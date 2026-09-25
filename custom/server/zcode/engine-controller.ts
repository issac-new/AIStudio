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
 * 归属闸（X1）：/mention 与 /checkpoint/recover 是引擎 run 入口，workspacePath 必须
 * 注册于 Studio 会话注册表且对调用方可见（归属模型与残余风险见 workspace-access.ts
 * 头注释），拒绝回 403 + invocation_not_allowed。投影入口 /projection/watch|unwatch
 * 同闸（X1 收口）：watch 会触发引擎连接并把该 workspace 的会话活动投影给调用方，
 * 未注册/不可见的 workspace 同样不得建立/拆除投影。
 *
 * 投影事件经 /zcode socket.io 命名空间扇出（projection-socket.ts，patch 398 注册）。
 */
import Router from '@koa/router'
import { probeZCodeEngine } from '../zcode/engine-bridge'
import { getZcodeProjectionRuntime } from '../zcode/projection-runtime'
import { MentionDispatchService } from '../zcode/mention-dispatch'
import { CHECKPOINT_RECOVERY_MODES, buildRecoveryEnvelopes, isCheckpointRecoveryMode } from '../zcode/checkpoint-options'
import { canUseWorkspace, type WorkspaceCaller } from '../zcode/workspace-access'

const router = new Router({ prefix: '/api/zcode-engine' })
const CHECKPOINT_MODES_JOIN = CHECKPOINT_RECOVERY_MODES.join('/')

/** X1 归属闸（引擎 run 入口共用）：拒绝时已写 403 + invocation_not_allowed，调用侧直接 return。 */
function workspaceAccessDenied(ctx: { state?: unknown; status: number; body: unknown }, workspacePath: string): boolean {
  const caller = (ctx.state as { user?: WorkspaceCaller } | undefined)?.user
  if (canUseWorkspace(caller, workspacePath)) return false
  ctx.status = 403
  ctx.body = { ok: false, reason: 'invocation_not_allowed', detail: 'workspace 未注册或当前用户无权访问' }
  return true
}

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
  // X1 归属闸：watch 即把该 workspace 的会话活动投影给调用方（并触发引擎连接），
  // 未注册/不可见的 workspace 不得建立投影。
  if (workspaceAccessDenied(ctx, workspacePath)) return
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
  // X1 归属闸：拆除投影同判据（与 watch 对称——不可见的 workspace 调用方本就不该持有投影意图）。
  if (workspaceAccessDenied(ctx, workspacePath)) return
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
  // X1 归属闸：派单即引擎 run，未注册/不可见的 workspace 不得触发。
  if (workspaceAccessDenied(ctx, workspacePath)) return
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
  // X1 归属闸：checkpoint 恢复即向引擎发命令，未注册/不可见的 workspace 不得触发。
  if (workspaceAccessDenied(ctx, workspacePath)) return
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

router.post('/mention/preview', async (ctx) => {
  // 分派预演（multica WillEnqueueRun 语义，矩阵 §3.5 P1）：预测会不会起跑、为谁跑。
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { workspacePath, text } = body as Record<string, unknown>
  if (typeof workspacePath !== 'string' || !workspacePath || typeof text !== 'string' || !text) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'workspacePath 与 text 必填' }
    return
  }
  const service = getMentionDispatch()
  const svcAny = service as unknown as {
    pending: Map<string, { since: number }>
    known: Set<string>
    deferred: Set<string>
    mentionAuthor?: string
    now: () => number
    pendingTtlMs: number
  }
  const { willEnqueueRun } = await import('../zcode/will-enqueue')
  const previews = willEnqueueRun(text, workspacePath, {
    engine: { probe: async () => true, createSession: async () => ({ session: { sessionId: '' } }), sendCommand: async () => ({ status: 'accepted' }) },
    knownAgents: svcAny.known,
    deferredAgents: svcAny.deferred,
    mentionAuthor: svcAny.mentionAuthor,
    pendingKeys: new Set(svcAny.pending.keys()),
    pendingSince: new Map([...svcAny.pending.entries()].map(([k, v]) => [k, v.since])),
    now: svcAny.now,
    pendingTtlMs: svcAny.pendingTtlMs,
  })
  ctx.body = { ok: true, previews }
})

router.post('/queue/enqueue', async (ctx) => {
  // GOAL-05 让位队列（minimax 矩阵 §3.4 P1）：自治项遇用户消息让位，轮空恢复。
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { itemId, workspacePath, origin, text, source } = body as Record<string, unknown>
  if (typeof itemId !== 'string' || !itemId || typeof workspacePath !== 'string' || !workspacePath
      || (origin !== 'user' && origin !== 'autonomy') || typeof text !== 'string' || !text) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'itemId/workspacePath/origin(user|autonomy)/text 必填' }
    return
  }
  const { enqueue } = await import('../zcode/dispatch-queue')
  const result = enqueue({ itemId, workspacePath, origin, text, at: Date.now(), state: 'pending', source: typeof source === 'string' ? source : undefined })
  ctx.body = { ok: true, ...result }
})

router.post('/queue/yield', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { workspacePath } = body as Record<string, unknown>
  if (typeof workspacePath !== 'string' || !workspacePath) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'workspacePath 必填' }
    return
  }
  const { yieldToUser } = await import('../zcode/dispatch-queue')
  ctx.body = { ok: true, yielded: yieldToUser(workspacePath) }
})

router.post('/queue/drain', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { workspacePath } = body as Record<string, unknown>
  if (typeof workspacePath !== 'string' || !workspacePath) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'workspacePath 必填' }
    return
  }
  const dq = await import('../zcode/dispatch-queue')
  ctx.body = { ok: true, restored: dq.restoreYielded(workspacePath), next: dq.dequeueNext(workspacePath) }
})

router.get('/queue/:workspacePath', async (ctx) => {
  const { queueView } = await import('../zcode/dispatch-queue')
  ctx.body = { ok: true, queue: queueView(ctx.params.workspacePath) }
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
