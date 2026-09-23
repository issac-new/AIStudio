// overlay/custom/server/controllers/ide/retry-counts.ts
// IDE 简报面板「打回次数」数据源（aipaydev 缺口 3 可视化收尾）：
//   GET /api/ide/retry-count?task=<taskId> → { taskId, count, leaderIntervention, maxExceeded }
// 读 RetryStore sidecar（~/.hermes-web-ui/overlay/aipaydev-retry.json），
// 与 patch 363 的 reopenReview 计数链同源。
//
// 挂载：B 类 patch（series 371）在 packages/server/src/bootstrap/routes.ts
// `app.use(ideRetryCountRoutes.routes())`，与 ide/git、ide/worktree 同款模式，
// 继承全局 authMiddleware 链（同 patch 134 的鉴权位次说明）。

import Router from '@koa/router'
import { RetryStore } from '../../services/kanban/retry-store'
import { RETRY_LEADER_THRESHOLD, RETRY_MAX } from '../../services/kanban/retry-guard'

export const ideRetryCountRoutes = new Router()

ideRetryCountRoutes.get('/api/ide/retry-count', async (ctx) => {
  const taskId = String(ctx.query.task ?? '').trim()
  if (!taskId) {
    ctx.status = 400
    ctx.body = { error: 'task query param required' }
    return
  }
  try {
    const count = await RetryStore.get(taskId)
    ctx.body = {
      taskId,
      count,
      leaderIntervention: count >= RETRY_LEADER_THRESHOLD,
      maxExceeded: count >= RETRY_MAX,
    }
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: err instanceof Error ? err.message : 'retry count read failed' }
  }
})

export default ideRetryCountRoutes
