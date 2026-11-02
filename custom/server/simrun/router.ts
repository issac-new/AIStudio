// overlay/custom/server/simrun/router.ts
// simrun 监督域 REST 面：GET status（状态+最近事件）/ POST start / POST stop。
// fail-soft：未启用（宿主 studio）时 status 报 { ok, enabled:false }，start 报 409。
import Router from '@koa/router'
import { getSimSupervisor } from './supervisor'

export { startSimSupervisorIfEnabled } from './supervisor'

export function createSimRunSupervisorRouter(): Router {
  const router = new Router()
  router.get('/api/simrun/supervisor/status', async (ctx) => {
    const s = getSimSupervisor()
    ctx.body = { ok: true, ts: Date.now(), state: s.state, events: s.recentEvents() }
  })
  router.post('/api/simrun/supervisor/start', async (ctx) => {
    const s = getSimSupervisor()
    if (!s.state.enabled) { ctx.status = 409; ctx.body = { ok: false, error: `未启用：${s.state.reason}` }; return }
    const body = (ctx.request as unknown as { body?: { runId?: string; startStep?: string } }).body ?? {}
    if (!body.runId || typeof body.runId !== 'string') { ctx.status = 400; ctx.body = { ok: false, error: 'runId 必填' }; return }
    try {
      s.start(body.runId, body.startStep)
      ctx.body = { ok: true, state: s.state }
    } catch (e) {
      ctx.status = 409; ctx.body = { ok: false, error: String(e) }
    }
  })
  router.post('/api/simrun/supervisor/stop', async (ctx) => {
    const s = getSimSupervisor()
    s.stop()
    ctx.body = { ok: true, state: s.state }
  })
  return router
}

export const simRunSupervisorRoutes = createSimRunSupervisorRouter()

export default createSimRunSupervisorRouter()
