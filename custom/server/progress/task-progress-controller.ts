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
import { getSessionStore, readWorkspaceMilestones, readWorkspaceGitActivity } from './task-progress-store'
import { taskProgressOverview } from './task-progress-analytics'

const router = new Router({ prefix: '/api/progress' })

router.get('/tasks', async (ctx) => {
  const activeOnly = ctx.query.active === '1' || ctx.query.active === 'true'
  const limitRaw = Number(Array.isArray(ctx.query.limit) ? ctx.query.limit[0] : ctx.query.limit)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50
  try {
    const ledger = readDispatchLedger(2000).filter((e) => e.taskId)
    const sessions = getSessionStore(getZcodeProjectionRuntime())
    // 里程碑面（消费侧接线补全）：按台账出现的 distinct workspace 各读一次（有界 fail-soft），
    // 传聚合联合——引擎站点面缺席的任务以里程碑回退呈现进度。
    const milestonesByWorkspace = new Map<string, ReturnType<typeof readWorkspaceMilestones>>()
    for (const e of ledger) {
      if (e.workspaceId && !milestonesByWorkspace.has(e.workspaceId)) {
        milestonesByWorkspace.set(e.workspaceId, readWorkspaceMilestones(e.workspaceId))
      }
    }
    const overview = taskProgressOverview(ledger, sessions, { activeOnly, limit, milestonesByWorkspace })
    // git 在途面（G1）：按台账 distinct workspace 各读一次（只读有界），独立字段透出——
    // 交付分支零提交 ≠ 零进展（run14 并发误读教训）。
    const gitActivity: Record<string, ReturnType<typeof readWorkspaceGitActivity>> = {}
    for (const e of ledger) {
      if (e.workspaceId && !gitActivity[e.workspaceId]) {
        gitActivity[e.workspaceId] = readWorkspaceGitActivity(e.workspaceId)
      }
    }
    ctx.body = { ok: true, ts: Date.now(), ...overview, gitActivity }
  } catch (err) {
    ctx.body = { ok: false, ts: Date.now(), tasks: [], total: 0, activeCount: 0, sessionPendingCount: 0, reason: 'progress_read_failed', detail: err instanceof Error ? err.message : String(err) }
  }
})

export const progressRoutes = router
export default router
