/**
 * zcode 引擎健康面 + 会话投影面（/api/zcode-engine/*）——R4-P1/P2。
 *
 * 挂载：B 类 patch 380 在 packages/server/src/bootstrap/routes.ts
 * `app.use(zcodeEngineRoutes.routes())`，与 ide/git 同款模式。
 *
 * GET  /api/zcode-engine/health —— 引擎进程在线探测（WS open 握手即算在线）。
 *   返回 { ok, online, url, latencyMs }；offline 时 ok=false（HTTP 200，
 *   探测失败是业务常态不是服务错误）。
 *
 * POST /api/zcode-engine/projection/watch    { workspacePath[, sessionId] }
 *   —— 开始投影（sessions-index 必订；sessionId 可选加订 conversation topic）。
 *   引擎离线时返回 503 + reason（词表值）；意图保留，引擎上线后自动重放。
 * POST /api/zcode-engine/projection/unwatch  { workspacePath } —— 停止投影。
 * GET  /api/zcode-engine/projection —— { connected, watching:[...] }。
 *
 * 投影事件经 /zcode socket.io 命名空间扇出（projection-socket.ts，patch 398 注册）。
 */
import Router from '@koa/router'
import { probeZCodeEngine } from '../zcode/engine-bridge'
import { getZcodeProjectionRuntime } from '../zcode/projection-runtime'
import { MentionDispatchService } from '../zcode/mention-dispatch'
import { CHECKPOINT_RECOVERY_MODES, buildRecoveryEnvelopes, isCheckpointRecoveryMode } from '../zcode/checkpoint-options'

const router = new Router({ prefix: '/api/zcode-engine' })
const CHECKPOINT_MODES_JOIN = CHECKPOINT_RECOVERY_MODES.join('/')

let dispatchSingleton: MentionDispatchService | null = null

/** 派单服务单例：引擎面经投影 runtime（ensureConnected + 桥上调用）。 */
function getMentionDispatch(): MentionDispatchService {
  if (dispatchSingleton) return dispatchSingleton
  const runtime = getZcodeProjectionRuntime()
  dispatchSingleton = new MentionDispatchService({
    engine: {
      probe: () => probeZCodeEngine(),
      createSession: (p) => runtime.withAgent((agent) => agent.createSession(p)),
      sendCommand: (p) => runtime.withAgent((agent) => agent.sendConversationCommandV4(p)),
    },
    clientId: 'swarmstudio-mention-bus',
    knownAgents: ['zcode', ...(('' + (process.env.ZCODE_MENTION_AGENTS ?? '')).split(',').filter(Boolean))],
    deferredAgents: ['claude-code', 'codex', 'pi', 'grok', 'dsh', 'opencode', 'mimo'],
    onOutcome: () => { /* outcome 经 dispatch() 返回值透传 REST；socket 扇出由调用侧 emit */ },
  })
  return dispatchSingleton
}

router.get('/health', async (ctx) => {
  const startedAt = Date.now()
  const online = await probeZCodeEngine()
  ctx.body = {
    ok: online,
    online,
    url: 'ws://127.0.0.1:3030/ws',
    latencyMs: Date.now() - startedAt,
  }
})

router.post('/projection/watch', async (ctx) => {
  const { workspacePath, sessionId } = (ctx.request.body ?? {}) as { workspacePath?: string; sessionId?: string }
  if (typeof workspacePath !== 'string' || workspacePath.length === 0) {
    ctx.status = 400
    ctx.body = { ok: false, reason: 'target_unavailable', detail: 'workspacePath 必填' }
    return
  }
  const runtime = getZcodeProjectionRuntime()
  try {
    // 先 watchWorkspace 再 watchSession（对齐 /mention 路径顺序）：watchSession 要求
    // workspace 已 watch，带 sessionId 直调首调必失败。
    await runtime.watchWorkspace(workspacePath)
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      await runtime.watchSession(workspacePath, sessionId)
    }
    ctx.body = { ok: true, connected: runtime.connected, watching: runtime.watching }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    ctx.status = 503
    ctx.body = {
      ok: false,
      reason: /handshake|protocolVersion/i.test(detail) ? 'handshake_failed' : 'engine_unreachable',
      detail,
      // retained 按实际意图状态回报（意图已登记才保留、引擎上线后重放），不再无条件 true。
      retained: runtime.hasWatchIntent(workspacePath),
      watching: runtime.watching,
    }
  }
})

router.post('/projection/unwatch', async (ctx) => {
  const { workspacePath } = (ctx.request.body ?? {}) as { workspacePath?: string }
  if (typeof workspacePath !== 'string' || workspacePath.length === 0) {
    ctx.status = 400
    ctx.body = { ok: false, reason: 'target_unavailable', detail: 'workspacePath 必填' }
    return
  }
  const runtime = getZcodeProjectionRuntime()
  await runtime.unwatch(workspacePath)
  ctx.body = { ok: true, watching: runtime.watching }
})

router.post('/mention', async (ctx) => {
  const { workspacePath, text } = (ctx.request.body ?? {}) as { workspacePath?: string; text?: string }
  if (typeof workspacePath !== 'string' || workspacePath.length === 0 || typeof text !== 'string' || text.length === 0) {
    ctx.status = 400
    ctx.body = { ok: false, reason: 'target_unavailable', detail: 'workspacePath 与 text 必填' }
    return
  }
  const runtime = getZcodeProjectionRuntime()
  const service = getMentionDispatch()
  const outcomes = await service.dispatch({ workspacePath, text })
  // run 可追溯：成功派发的会话立即挂上投影（conversation topic → /zcode 房间）。
  for (const o of outcomes) {
    if (o.reason === 'queued' && o.sessionId) {
      try {
        await runtime.watchWorkspace(workspacePath).catch(() => undefined)
        await runtime.watchSession(workspacePath, o.sessionId).catch(() => undefined)
      } catch { /* 投影失败不回滚派单；outcome 已携带 sessionId/commandId 可追溯 */ }
    }
  }
  ctx.body = { ok: outcomes.every((o) => o.reason === 'queued' || o.reason === 'coalesced' || o.reason === 'deferred'), outcomes, pending: service.pendingSnapshot() }
})

router.post('/checkpoint/recover', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { mode, workspacePath, sessionId, rowId, entityId, originalQueryText } = body as Record<string, unknown>
  if (typeof workspacePath !== 'string' || typeof sessionId !== 'string'
      || typeof rowId !== 'number' || typeof entityId !== 'string') {
    ctx.status = 400
    ctx.body = { ok: false, reason: 'target_unavailable', detail: 'workspacePath/sessionId/rowId/entityId 必填' }
    return
  }
  if (!isCheckpointRecoveryMode(mode)) {
    ctx.status = 400
    ctx.body = { ok: false, reason: 'target_unavailable', detail: `mode 须为四档之一（${CHECKPOINT_MODES_JOIN}）` }
    return
  }
  const runtime = getZcodeProjectionRuntime()
  const envelopes = buildRecoveryEnvelopes(mode, {
    workspacePath, sessionId, rowId, entityId,
    clientId: 'swarmstudio-checkpoint',
    originalQueryText: typeof originalQueryText === 'string' ? originalQueryText : undefined,
  }, Date.now())
  // 逐条 try、逐条回报（S8）：summarize 档两条命令可能一条已生效一条失败，一条失败即
  // 503 会让调用方整单重试（双写）；逐条 rejected 也不能谎报 ok:true。ok 由全部命令推导。
  const commands: Array<{ commandId: string; type: string; status?: string; reasonCode?: string; ok: boolean; detail?: string; transportError?: boolean }> = []
  for (const envelope of envelopes) {
    try {
      const r = await runtime.withAgent((agent) => agent.sendConversationCommandV4({ workspacePath, envelope: envelope as unknown as Record<string, unknown> }))
      const accepted = !r.status || r.status === 'accepted' || r.status === 'ok'
      commands.push({ commandId: envelope.commandId, type: envelope.type, status: r.status, reasonCode: r.reasonCode, ok: accepted })
    } catch (err) {
      // transportError：调用链本身失败（引擎不可达/超时），区别于引擎回 rejected 的业务拒绝
      commands.push({ commandId: envelope.commandId, type: envelope.type, ok: false, transportError: true, detail: err instanceof Error ? err.message : String(err) })
    }
  }
  const landed = commands.filter((c) => c.ok).length
  const ok = landed === commands.length
  if (ok) {
    ctx.body = { ok: true, mode, commands }
    return
  }
  // 部分成功（已有命令生效）回 200 + partial:true，防止调用方按 503 整单重试双写；
  // 全部失败且均为传输层错误才 503（重试安全，什么都没生效）。
  const firstFailure = commands.find((c) => !c.ok)
  const transportDown = commands.every((c) => c.ok || c.transportError === true)
  ctx.status = landed === 0 && transportDown ? 503 : 200
  ctx.body = {
    ok: false,
    partial: landed > 0,
    landed,
    total: commands.length,
    mode,
    commands,
    reason: ctx.status === 503
      ? (/handshake/i.test(firstFailure?.detail ?? '') ? 'handshake_failed' : 'engine_unreachable')
      : 'command_rejected',
    detail: firstFailure?.detail,
  }
})

router.get('/squad/evaluations', async (ctx) => {
  const { listEvaluations } = await import('../zcode/squad-protocol')
  const squad = typeof ctx.query.squad === 'string' ? ctx.query.squad : undefined
  ctx.body = { ok: true, evaluations: listEvaluations(squad) }
})

router.get('/projection', async (ctx) => {
  const runtime = getZcodeProjectionRuntime()
  ctx.body = { connected: runtime.connected, watching: runtime.watching }
})

export const zcodeEngineRoutes = router
