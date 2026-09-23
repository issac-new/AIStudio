/**
 * zcode 引擎健康面（/api/zcode-engine/*）——R4-P1 通道基建观测口。
 *
 * 挂载：B 类 patch 380 在 packages/server/src/bootstrap/routes.ts
 * `app.use(zcodeEngineRoutes.routes())`，与 ide/git 同款模式。
 *
 * GET /api/zcode-engine/health —— 引擎进程在线探测（WS open 握手即算在线）。
 *   返回 { ok, online, url, latencyMs }；offline 时 ok=false（HTTP 200，
 *   探测失败是业务常态不是服务错误）。
 */
import Router from '@koa/router'
import { probeZCodeEngine } from '../zcode/engine-bridge'

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

export const zcodeEngineRoutes = router
