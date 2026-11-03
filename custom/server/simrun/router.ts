// overlay/custom/server/simrun/router.ts
// simrun 监督域 REST 面：GET status（状态+最近事件）/ POST start / POST stop。
// fail-soft：未启用（宿主 studio）时 status 报 { ok, enabled:false }，start 报 409。
// 响应一律走 lib/http 助手（K19 架构棘轮：新增模块不得抬高手写计数）。
import Router from '@koa/router'
import { bodyOf, fail, ok } from '../lib/http'
import { getSimSupervisor } from './supervisor'

export { startSimSupervisorIfEnabled } from './supervisor'

export function createSimRunSupervisorRouter(): Router {
  const router = new Router()
  router.get('/api/simrun/supervisor/status', async (ctx) => {
    const s = getSimSupervisor()
    ok(ctx, { ts: Date.now(), state: s.state, events: s.recentEvents() })
  })
  router.post('/api/simrun/supervisor/start', async (ctx) => {
    const s = getSimSupervisor()
    if (!s.state.enabled) { fail(ctx, 409, `未启用：${s.state.reason}`); return }
    const body = bodyOf<{ runId?: string; startStep?: string }>(ctx)
    if (!body.runId || typeof body.runId !== 'string') { fail(ctx, 400, 'runId 必填'); return }
    try {
      s.start(body.runId, body.startStep)
      ok(ctx, { state: s.state })
    } catch (e) {
      fail(ctx, 409, String(e))
    }
  })
  router.post('/api/simrun/supervisor/stop', async (ctx) => {
    const s = getSimSupervisor()
    s.stop()
    ok(ctx, { state: s.state })
  })
  return router
}

export const simRunSupervisorRoutes = createSimRunSupervisorRouter()

export default createSimRunSupervisorRouter()
