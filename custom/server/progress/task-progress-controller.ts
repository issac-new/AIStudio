/**
 * 研发任务进度 REST（Router prefix /api/progress）。
 *
 * GET /api/progress/tasks?active=1&limit=50 —— 按任务卡的研发进度快照：
 * 派发事实（台账文件真值）联会话进度（投影事件流存储）。fail-soft：任何一
 * 面缺席都如实降级（会话面暂缺标注），端点本身不 5xx。
 */
import Router from '@koa/router'
import { readDispatchLedger } from '../governance/dispatch-ledger'
import { getZcodeProjectionRuntime } from '../zcode/projection-runtime'
import { getSessionStore } from './task-progress-store'
import { taskProgressOverview } from './task-progress-analytics'

const router = new Router({ prefix: '/api/progress' })

router.get('/tasks', async (ctx) => {
  const activeOnly = ctx.query.active === '1' || ctx.query.active === 'true'
  const limitRaw = Number(Array.isArray(ctx.query.limit) ? ctx.query.limit[0] : ctx.query.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50
  try {
    const ledger = readDispatchLedger(2000).filter((e) => e.taskId)
    const sessions = getSessionStore(getZcodeProjectionRuntime())
    const overview = taskProgressOverview(ledger, sessions, { activeOnly, limit })
    ctx.body = { ok: true, ts: Date.now(), ...overview }
  } catch (err) {
    ctx.body = { ok: false, ts: Date.now(), tasks: [], total: 0, activeCount: 0, sessionPendingCount: 0, reason: 'progress_read_failed', detail: err instanceof Error ? err.message : String(err) }
  }
})

export const progressRoutes = router
export default router
