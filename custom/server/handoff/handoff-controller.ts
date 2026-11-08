// overlay/handoff 域 REST：交接质量账本（MAS-RSI / DeerFlow 吸收轮 2026-11-03）。
//   GET /api/harness/handoff/quality?windowHours=&stallHours=
// 数据源：delivery 看板读取器（kanban.db task_events + tasks），逐板 fail-soft。
// 纪律：源缺席 available:false；不猜「大概在做」——停滞必须由「认领后超时无终态」推出。
import Router from '@koa/router'

import { readAllBoards } from '../delivery/boards-reader'
import { resolveKanbanHome } from '../delivery/kanban-home'
import { fail as httpFail, ok, bodyOf } from '../lib/http'
import { checkAcceptance, parseCriterion, probeArtifacts, type AcceptanceEvidence } from './acceptance'
import { verifyClaims, receiptFactsOf, type ClaimInput } from './claims'
import { computeHandoffQuality, mergeBoardsForHandoff } from './handoff-quality'
import { checkHandoffConformance, loadHandoffRules, renderHandoffRuleLine, selectHandoffRule } from './handoff-rules'

export const handoffRoutes = new Router()

handoffRoutes.get('/quality', (ctx) => {
  // 参数校验先于数据源解析：参数错是调用方问题，不该被「看板根缺席」掩盖成 200
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
  const { home, tried } = resolveKanbanHome()
  if (!home) {
    ok(ctx, { available: false, reason: '看板数据根缺席', tried })
    return
  }
  try {
    const boards = readAllBoards(home)
    const merged = mergeBoardsForHandoff(boards)
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

/**
 * 主张-回执核验（2026-11-03 DeerFlow L1 吸收）：
 *   POST /claims/verify { taskId, claims: [{id,text,evidenceRefs[]}] }
 * 回执来自 evidence 台账（同 taskId 的 evidenceId 才算依据）；未引用/不可解析/跨任务均判未验证。
 */
handoffRoutes.post('/claims/verify', async (ctx) => {
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const taskId = String(body.taskId ?? '').trim()
  if (!taskId) {
    httpFail(ctx, 400, 'taskId 必填', { code: 'no_task' })
    return
  }
  const claims = Array.isArray(body.claims) ? (body.claims as ClaimInput[]) : []
  if (claims.length === 0) {
    httpFail(ctx, 400, 'claims 必填（至少一条）', { code: 'no_claims' })
    return
  }
  const { listEvidence } = await import('../evidence/evidence-store')
  let records: Array<{ evidenceId: string }> = []
  try {
    records = listEvidence(taskId, undefined, 200)
  } catch {
    /* 台账不存在按空账处理：所有引用都会判不可解析（不猜） */
  }
  const report = verifyClaims(taskId, claims, receiptFactsOf(records))
  ok(ctx, { report, knownReceipts: records.length })
})

/**
 * 团队作用域交接规则（EvoTeam 吸收，2026-11-08）：
 *   GET  /rules                                    规则库读模型（available:false 给原因）
 *   POST /rules/select { from?, to, trigger?, familyId? }  选一条适用规则（NONE=null）
 *   POST /rules/conformance { ruleId, familyId?, presentEvidence[] }  回执侧缺项检查
 * 建议面：不阻断派发、不判失败；缺证据只报 missing。
 */
handoffRoutes.get('/rules', (ctx) => {
  const report = loadHandoffRules()
  ok(ctx, report.available
    ? { available: true, source: report.source, updated: report.updated, families: report.families }
    : { available: false, reason: report.reason, source: report.source })
})

handoffRoutes.post('/rules/select', (ctx) => {
  const body = bodyOf<{ from?: unknown; to?: unknown; trigger?: unknown; familyId?: unknown }>(ctx)
  const to = typeof body.to === 'string' ? body.to.trim() : ''
  if (!to) {
    httpFail(ctx, 400, 'to 必填（目标列/角色）', { code: 'no_target' })
    return
  }
  const report = loadHandoffRules()
  if (!report.available) {
    ok(ctx, { available: false, reason: report.reason, source: report.source, selection: null, line: null })
    return
  }
  const selection = selectHandoffRule(report.families, {
    from: typeof body.from === 'string' ? body.from : null,
    to,
    trigger: typeof body.trigger === 'string' ? body.trigger : null,
    familyId: typeof body.familyId === 'string' ? body.familyId : null,
  })
  ok(ctx, {
    available: true,
    source: report.source,
    selection,
    line: selection.rule ? renderHandoffRuleLine(selection.rule) : null,
  })
})

handoffRoutes.post('/rules/conformance', (ctx) => {
  const body = bodyOf<{ ruleId?: unknown; familyId?: unknown; presentEvidence?: unknown }>(ctx)
  const ruleId = typeof body.ruleId === 'string' ? body.ruleId.trim() : ''
  if (!ruleId) {
    httpFail(ctx, 400, 'ruleId 必填', { code: 'no_rule' })
    return
  }
  const report = loadHandoffRules()
  if (!report.available) {
    ok(ctx, { available: false, reason: report.reason, source: report.source, conformance: null })
    return
  }
  const familyId = typeof body.familyId === 'string' ? body.familyId.trim() : ''
  const families = familyId ? report.families.filter((f) => f.familyId === familyId) : report.families
  const matches = families.flatMap((f) => f.rules).filter((r) => r.ruleId === ruleId)
  if (matches.length === 0) {
    httpFail(ctx, 404, `规则不存在：${ruleId}${familyId ? `（家族 ${familyId}）` : ''}`, { code: 'rule_not_found' })
    return
  }
  if (matches.length > 1) {
    httpFail(ctx, 409, `ruleId 跨家族重复（${matches.length} 条），请指定 familyId`, { code: 'ambiguous_rule' })
    return
  }
  const present = Array.isArray(body.presentEvidence)
    ? body.presentEvidence.filter((x): x is string => typeof x === 'string')
    : []
  ok(ctx, { available: true, source: report.source, conformance: checkHandoffConformance(matches[0], present) })
})
