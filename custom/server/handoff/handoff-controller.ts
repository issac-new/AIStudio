// overlay/handoff 域 REST：交接质量账本（MAS-RSI / DeerFlow 吸收轮 2026-11-03）。
//   GET /api/harness/handoff/quality?windowHours=&stallHours=
// 数据源：delivery 看板读取器（kanban.db task_events + tasks），逐板 fail-soft。
// 纪律：源缺席 available:false；不猜「大概在做」——停滞必须由「认领后超时无终态」推出。
import Router from '@koa/router'

import { readAllBoards } from '../delivery/boards-reader'
import { resolveKanbanHome } from '../delivery/kanban-home'
import { fail as httpFail, ok } from '../lib/http'
import { checkAcceptance, parseCriterion, probeArtifacts, type AcceptanceEvidence } from './acceptance'
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

/**
 * 确定性验收断言（2026-11-03 DeerFlow L2 吸收）：
 *   POST /acceptance/check { criteria: string[], root?: string, artifacts?, commands? }
 * root 给了就由服务端在允许根内实测（存在/可读/大小/尾部），否则用调用方观测；
 * 不可判定条目落 unchecked，allHold 为 false——不猜通过。
 */
handoffRoutes.post('/acceptance/check', (ctx) => {
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const criteria = Array.isArray(body.criteria) ? body.criteria.map(String) : []
  if (criteria.length === 0) {
    httpFail(ctx, 400, 'criteria 必填（至少一条）', { code: 'no_criteria' })
    return
  }
  const evidence: AcceptanceEvidence = {}
  const problems: string[] = []
  const root = typeof body.root === 'string' ? body.root.trim() : ''
  if (root) {
    const allowed = (process.env.ACCEPTANCE_ALLOWED_ROOTS ?? process.cwd()).split(',').map((s) => s.trim()).filter(Boolean)
    const paths = criteria
      .map((c) => parseCriterion(c))
      .filter((p) => p && (p.family.startsWith('file_') ? typeof p.path === 'string' : false))
      .map((p) => p!.path as string)
    const probed = probeArtifacts(root, [...new Set(paths)], { allowedRoots: allowed })
    evidence.artifacts = probed.artifacts
    problems.push(...probed.problems)
  }
  if (Array.isArray(body.artifacts)) evidence.artifacts = [...(evidence.artifacts ?? []), ...(body.artifacts as never[])]
  if (Array.isArray(body.commands)) evidence.commands = body.commands as never[]
  const verdict = checkAcceptance(criteria, evidence)
  ok(ctx, { verdict, ...(problems.length ? { problems } : {}) })
})
