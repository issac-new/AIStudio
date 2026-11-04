// taskmodel 路由（挂 harness 前缀下零 patch：/api/harness/taskmodel/:taskId）。
import Router from '@koa/router'
import { readTaskDetailFast } from '../services/hermes/kanban-task-fast'
import { deriveTaskModel } from './taskmodel'
import { ok, fail } from '../lib/http'

export const taskModelRoutes = new Router()

/** GET /api/harness/taskmodel/:taskId?board=default —— 任务模型 v1 只读投影。 */
taskModelRoutes.get('/taskmodel/:taskId', async (ctx) => {
  const taskId = String(ctx.params.taskId ?? '').trim()
  const board = typeof ctx.query.board === 'string' && ctx.query.board ? ctx.query.board : undefined
  if (!taskId) { fail(ctx, 400, 'taskId 必填'); return }
  if (!board) { fail(ctx, 400, 'board 必填（快道按板库直读）'); return }
  const detail = readTaskDetailFast(taskId, board)
  if (!detail) { fail(ctx, 404, '任务不存在或快道不可用（回落 CLI 老路径）'); return }
  const model = deriveTaskModel(detail)
  if (!model) { fail(ctx, 500, '详情存在但派生失败（task.id 缺失）'); return }
  ok(ctx, { model })
})
