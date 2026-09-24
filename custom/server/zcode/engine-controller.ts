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

const router = new Router({ prefix: '/api/zcode-engine' })

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
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      await runtime.watchSession(workspacePath, sessionId)
    } else {
      await runtime.watchWorkspace(workspacePath)
    }
    ctx.body = { ok: true, connected: runtime.connected, watching: runtime.watching }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    ctx.status = 503
    ctx.body = {
      ok: false,
      reason: /handshake|protocolVersion/i.test(detail) ? 'handshake_failed' : 'engine_unreachable',
      detail,
      retained: true, // watch 意图保留，引擎上线后自动重放
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

router.get('/projection', async (ctx) => {
  const runtime = getZcodeProjectionRuntime()
  ctx.body = { connected: runtime.connected, watching: runtime.watching }
})

export const zcodeEngineRoutes = router
