// overlay/handoff 域 REST：交接质量账本（MAS-RSI / DeerFlow 吸收轮 2026-11-03）。
//   GET /api/harness/handoff/quality?windowHours=&stallHours=
// 数据源：delivery 看板读取器（kanban.db task_events + tasks），逐板 fail-soft。
// 纪律：源缺席 available:false；不猜「大概在做」——停滞必须由「认领后超时无终态」推出。
import Router from '@koa/router'

import { readAllBoards } from '../delivery/boards-reader'
import { resolveKanbanHome } from '../delivery/kanban-home'
import { fail as httpFail, ok } from '../lib/http'
import { computeHandoffQuality, mergeBoardsForHandoff } from './handoff-quality'

export const handoffRoutes = new Router()

handoffRoutes.get('/quality', (ctx) => {
  const { home, tried } = resolveKanbanHome()
  if (!home) {
    ok(ctx, { available: false, reason: '看板数据根缺席', tried })
    return
  }
  try {
    const boards = readAllBoards(home)
    const merged = mergeBoardsForHandoff(boards)
    const windowHours = Number(ctx.query.windowHours ?? 24)
    const stallHours = Number(ctx.query.stallHours ?? 6)
    if (!Number.isFinite(windowHours) || windowHours < 1 || windowHours > 720) {
      httpFail(ctx, 400, 'windowHours 必须是 1-720 的数值', { code: 'invalid_window' })
      return
    }
    if (!Number.isFinite(stallHours) || stallHours < 1 || stallHours > 168) {
      httpFail(ctx, 400, 'stallHours 必须是 1-168 的数值', { code: 'invalid_stall' })
      return
    }
    const report = merged.tasks.length === 0 && merged.events.length === 0
      ? { ...computeHandoffQuality([], [], { windowHours, stallHours }), available: false, reason: '看板无任务与事件（空库）' }
      : computeHandoffQuality(merged.tasks, merged.events, { windowHours, stallHours })
    ok(ctx, {
      report,
      kanbanHome: home,
      boards: merged.boards,
      boardsAvailable: merged.boardsAvailable,
      boardErrors: boards.filter((b) => !b.available).map((b) => ({ slug: b.slug, error: b.error ?? 'unknown' })),
    })
  } catch (e) {
    httpFail(ctx, 500, e instanceof Error ? e.message : String(e), { code: 'handoff_quality_failed' })
  }
})
