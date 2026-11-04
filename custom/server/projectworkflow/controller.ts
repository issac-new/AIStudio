// custom/server/projectworkflow/controller.ts
// 项目工作流域 REST（2026-11-04）：项目一级状态机 + 完成守卫。
//
// 端点（prefix /api/projectworkflow）：
//   GET  /projects                状态文件 × 全板任务统计的合并清单
//   GET  /projects/:id            状态 + 统计 + 未终结任务清单 + timeline 倒序
//   POST /projects/:id/pause      暂停收单（completed 终态 → 409）
//   POST /projects/:id/resume     恢复（completed 须显式 reopen，本轮未提供 → 409）
//   POST /projects/:id/complete   完成守卫：有未终结任务 → 422 + problems；
//                                 ?override=true 且 body/query 带非空 reason → 放行
//                                 并落 override 佐证 + complete_override 事件；
//                                 已完成再完成 → 幂等 200。
//
// 权限：暂不加 admin 门——与 kanban 端点同档（登录态即可），收紧时与
// kanban admin write scope（补丁 716）一并对齐。actor 取 ctx.state.user?.username
// ?? 'api'（无会话上下文的本机调用）。
// 响应形状一律走 lib/http ok/fail（失败体经 fail() 出 error + problems 机器可读；
// 不手写失败字面量——K19 棘轮对注释里的字面量同样计数）。
import Router from '@koa/router'
import type { Context } from 'koa'
import { fail, ok } from '../lib/http'
import { getProjectState, readState, setStatus, type ProjectStateEntry } from './state-store'
import { listProjectIds, projectTaskStats, unfinishedProjectTasks } from './project-tasks'

const router = new Router({ prefix: '/api/projectworkflow' })

/** 操作者：会话用户名优先，无会话（本机/脚本）记 'api'。 */
function actorOf(ctx: Context): string {
  const u = (ctx.state as { user?: { username?: unknown } }).user
  const name = u?.username
  return (typeof name === 'string' && name.trim()) ? name.trim() : 'api'
}

/** override reason：query 或 body 任一带非空字符串即有效。 */
function overrideReasonOf(ctx: Context): string | null {
  const fromQuery = ctx.query?.reason
  const fromBody = (ctx.request as { body?: { reason?: unknown } }).body?.reason
  const q = typeof fromQuery === 'string' ? fromQuery.trim() : ''
  const b = typeof fromBody === 'string' ? fromBody.trim() : ''
  return q || b || null
}

/** 列表：状态文件项目 ∪ 库中发现的有任务项目；零板任务的项目也列出（统计为 0）。 */
export async function listProjects(ctx: Context): Promise<void> {
  const state = readState()
  const ids = new Set<string>([...Object.keys(state.projects), ...listProjectIds()])
  const projects = [...ids].sort().map((id) => {
    const entry: ProjectStateEntry = state.projects[id] ?? { status: 'active', timeline: [] }
    return {
      id,
      status: entry.status,
      taskStats: projectTaskStats(id),
      ...(entry.pausedAt !== undefined ? { pausedAt: entry.pausedAt } : {}),
      ...(entry.completedAt !== undefined ? { completedAt: entry.completedAt } : {}),
    }
  })
  ok(ctx, { projects })
}

/** 单项目：状态 + 统计 + 未终结任务 + timeline 倒序（最新在前）。 */
export async function getProject(ctx: Context): Promise<void> {
  const id = String(ctx.params.id ?? '')
  if (!id) { fail(ctx, 400, '缺少项目 id', { code: 'missing_project_id' }); return }
  const entry = getProjectState(id)
  ok(ctx, {
    id,
    status: entry.status,
    ...(entry.pausedAt !== undefined ? { pausedAt: entry.pausedAt } : {}),
    ...(entry.completedAt !== undefined ? { completedAt: entry.completedAt } : {}),
    ...(entry.override ? { override: entry.override } : {}),
    taskStats: projectTaskStats(id),
    unfinishedTasks: unfinishedProjectTasks(id),
    timeline: [...entry.timeline].sort((a, b) => b.at - a.at),
  })
}

/** 暂停：completed 是终态（reopen 未提供），对其 pause 与 resume 同判 409。 */
export async function pauseProject(ctx: Context): Promise<void> {
  const id = String(ctx.params.id ?? '')
  const current = getProjectState(id)
  if (current.status === 'completed') {
    fail(ctx, 409, '项目已完成（终态），须显式 reopen 后才能变更（本轮未提供 reopen）', { code: 'completed_terminal' })
    return
  }
  const next = setStatus(id, 'paused', { actor: actorOf(ctx) })
  ok(ctx, { id, status: next.status, pausedAt: next.pausedAt })
}

/** 恢复：completed 不能直接 resume——历史完成是有账面意义的终态，重开须走显式 reopen。 */
export async function resumeProject(ctx: Context): Promise<void> {
  const id = String(ctx.params.id ?? '')
  const current = getProjectState(id)
  if (current.status === 'completed') {
    fail(ctx, 409, '项目已完成（终态），不能直接 resume，须显式 reopen（本轮未提供 reopen）', { code: 'completed_terminal' })
    return
  }
  const next = setStatus(id, 'active', { actor: actorOf(ctx) })
  ok(ctx, { id, status: next.status })
}

/** 完成：守卫（422+problems）→ override 放行（记佐证）→ 幂等 200。 */
export async function completeProject(ctx: Context): Promise<void> {
  const id = String(ctx.params.id ?? '')
  const actor = actorOf(ctx)
  const current = getProjectState(id)
  if (current.status === 'completed') {
    // 幂等：已完成再完成不追加事件，回当前事实。
    ok(ctx, { id, status: 'completed', completedAt: current.completedAt, idempotent: true })
    return
  }

  const unfinished = unfinishedProjectTasks(id)
  const overrideWanted = String(ctx.query?.override ?? '').trim().toLowerCase() === 'true'
  const reason = overrideReasonOf(ctx)

  if (unfinished.length > 0) {
    if (!overrideWanted) {
      fail(ctx, 422, `项目存在 ${unfinished.length} 张未终结任务，不能完成（须清账或 ?override=true 带 reason）`, {
        code: 'unfinished_tasks',
        problems: unfinished.map((t) => `${t.board}/${t.id} [${t.status}] ${t.title}`),
      })
      return
    }
    if (!reason) {
      fail(ctx, 400, 'override=true 必须带非空 reason（body.reason 或 ?reason=）', { code: 'override_reason_required' })
      return
    }
    const next = setStatus(id, 'completed', { actor, reason, override: true })
    ok(ctx, { id, status: next.status, completedAt: next.completedAt, override: next.override })
    return
  }

  const next = setStatus(id, 'completed', { actor })
  ok(ctx, { id, status: next.status, completedAt: next.completedAt })
}

router.get('/projects', listProjects)
router.get('/projects/:id', getProject)
router.post('/projects/:id/pause', pauseProject)
router.post('/projects/:id/resume', resumeProject)
router.post('/projects/:id/complete', completeProject)

export { router as projectworkflowRoutes }
