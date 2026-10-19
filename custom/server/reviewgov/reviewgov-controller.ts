// overlay/custom/server/reviewgov/reviewgov-controller.ts
// 评审治理 REST：挂在既有 /api/review 路由下（子前缀 /gov），免新增 B 类 patch。
//
// GET  /policy                     有效策略 + 熔断状态
// GET  /cases                      案例列表（state/tier/limit）
// POST /cases                      开案例（按改动内容分级）
// GET  /cases/:id                  案例详情 + 合并就绪度
// POST /cases/:id/rounds           开新一轮（轮次封顶；新提交使旧审批失效）
// POST /cases/:id/findings         加发现项（证据/去重/存量延后/nit 预算）
// POST /cases/:id/findings/:fid/answer  回答（fixed/wrong/intentional/didnt_matter）
// POST /cases/:id/findings/:fid/verify  独立验证投票
// POST /cases/:id/findings/:fid/promote 提升为回归评测案例（错题本）
// POST /cases/:id/approvals        记录审批（Agent 可记录但不占人工名额）
// POST /cases/:id/checks           上报自动检查状态
// POST /cases/:id/state            标记 merged/abandoned（merged 需先就绪）
// POST /signals                    记录回滚/事故/合并信号（熔断输入）
// GET  /metrics                    评审度量 + 熔断 + 评测案例数
import Router from '@koa/router'
import type { Context } from 'koa'
import {
  addApproval, addFinding, answerFinding, mergeReadiness, refreshCaseState, startRound, verifyFinding,
} from './convergence'
import { evaluateBreaker, computeMetrics } from './metrics'
import { loadReviewPolicy } from './policy-config'
import { appendEvalCase, appendSignal, listCases, listEvalCases, listSignals, loadCase, openCase, saveCase } from './store'
import {
  ACTOR_KINDS, FINDING_SEVERITIES, RESOLUTIONS, SIGNAL_KINDS,
  type ActorKind, type CheckState, type FindingSeverity, type Resolution, type ReviewCase, type SignalKind,
} from './types'

const router = new Router({ prefix: '/gov' })

function actorOf(ctx: Context): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

function bodyOf(ctx: Context): Record<string, unknown> {
  // koa 的 Request 类型未声明 body（由 bodyparser 运行时注入）；显式收窄避免类型误报。
  const req = ctx.request as unknown as { body?: unknown }
  return (req.body ?? {}) as Record<string, unknown>
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function isActorKind(v: unknown): v is ActorKind {
  return typeof v === 'string' && (ACTOR_KINDS as readonly string[]).includes(v)
}

function isSeverity(v: unknown): v is FindingSeverity {
  return typeof v === 'string' && (FINDING_SEVERITIES as readonly string[]).includes(v)
}

function isResolution(v: unknown): v is Resolution {
  return typeof v === 'string' && (RESOLUTIONS as readonly string[]).includes(v)
}

function isSignalKind(v: unknown): v is SignalKind {
  return typeof v === 'string' && (SIGNAL_KINDS as readonly string[]).includes(v)
}

function isCheckState(v: unknown): v is CheckState {
  return v === 'green' || v === 'red' || v === 'unknown'
}

function fail(ctx: Context, status: number, code: string, detail: string): void {
  ctx.status = status
  ctx.body = { ok: false, code, detail }
}

function requireCase(ctx: Context): ReviewCase | null {
  const rec = loadCase(ctx.params.id)
  if (!rec) {
    fail(ctx, 404, 'case_not_found', '评审案例不存在')
    return null
  }
  return rec
}

/** 以请求体里的 actorKind 标注身份；缺失且无 actor 时按 system 记，避免冒充人类。 */
function actorKindFrom(body: Record<string, unknown>, actor?: string): ActorKind {
  if (isActorKind(body.actorKind)) return body.actorKind
  return actor ? 'human' : 'system'
}

router.get('/policy', async (ctx) => {
  const policy = loadReviewPolicy()
  ctx.body = { ok: true, policy, breaker: evaluateBreaker(listSignals(), policy) }
})

router.get('/cases', async (ctx) => {
  const state = str(ctx.query.state)
  const tier = str(ctx.query.tier)
  const limitRaw = Number(ctx.query.limit ?? 200)
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200
  let cases = listCases(limit)
  if (state) cases = cases.filter((c) => c.state === state)
  if (tier) cases = cases.filter((c) => c.risk.tier === tier)
  ctx.body = { ok: true, cases }
})

router.post('/cases', async (ctx) => {
  const body = bodyOf(ctx)
  const caseId = str(body.caseId)
  const title = str(body.title)
  if (!caseId || !title) return fail(ctx, 400, 'invalid_input', 'caseId/title 必填')
  const changedPaths = body.changedPaths
  if (changedPaths !== undefined && (!Array.isArray(changedPaths) || changedPaths.some((p) => typeof p !== 'string'))) {
    return fail(ctx, 400, 'invalid_input', 'changedPaths 须为字符串数组')
  }
  const policy = loadReviewPolicy()
  const breaker = evaluateBreaker(listSignals(), policy)
  const rec = openCase({
    caseId,
    title,
    taskId: str(body.taskId),
    reviewId: str(body.reviewId),
    author: str(body.author),
    authorKind: isActorKind(body.authorKind) ? body.authorKind : (actorOf(ctx) ? 'human' : 'system'),
    baseCommit: str(body.baseCommit),
    headCommit: str(body.headCommit),
    changedPaths: (changedPaths as string[] | undefined) ?? [],
    diffLines: typeof body.diffLines === 'number' ? body.diffLines : undefined,
    behindFlag: body.behindFlag === true,
  }, policy, breaker)
  ctx.body = { ok: true, case: rec, readiness: mergeReadiness(rec, policy) }
})

router.get('/cases/:id', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const policy = loadReviewPolicy()
  ctx.body = { ok: true, case: rec, readiness: mergeReadiness(rec, policy) }
})

router.post('/cases/:id/rounds', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const body = bodyOf(ctx)
  const changedPaths = body.changedPaths
  if (changedPaths !== undefined && (!Array.isArray(changedPaths) || changedPaths.some((p) => typeof p !== 'string'))) {
    return fail(ctx, 400, 'invalid_input', 'changedPaths 须为字符串数组')
  }
  const policy = loadReviewPolicy()
  const result = startRound(rec, {
    headCommit: str(body.headCommit),
    changedPaths: changedPaths as string[] | undefined,
  }, policy, evaluateBreaker(listSignals(), policy))
  if ('error' in result) return fail(ctx, result.code === 'round_cap_reached' ? 409 : 400, result.code, result.detail)
  const saved = saveCase(refreshCaseState(result.case, policy))
  ctx.body = { ok: true, case: saved, round: result.round, readiness: mergeReadiness(saved, policy) }
})

router.post('/cases/:id/findings', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const body = bodyOf(ctx)
  const file = str(body.file)
  const line = body.line
  const text = str(body.body)
  const severity = body.severity
  if (!file || typeof line !== 'number' || !Number.isInteger(line) || line < 1 || !text || !isSeverity(severity)) {
    return fail(ctx, 400, 'invalid_input', 'file/line/body/severity 必填（line 正整数，severity=important|nit|preexisting）')
  }
  const policy = loadReviewPolicy()
  const actor = actorOf(ctx)
  const result = addFinding(rec, {
    findingId: str(body.findingId),
    file,
    line,
    body: text,
    severity,
    origin: body.origin === 'preexisting' ? 'preexisting' : undefined,
    bugClass: str(body.bugClass),
    authorKind: actorKindFrom(body, actor),
    author: str(body.author) ?? actor,
    evidence: str(body.evidence),
  }, policy)
  if ('error' in result) return fail(ctx, 400, result.code, result.detail)
  const saved = saveCase(refreshCaseState(result.case, policy))
  ctx.body = {
    ok: true,
    case: saved,
    finding: result.finding,
    deduped: result.deduped,
    readiness: mergeReadiness(saved, policy),
  }
})

router.post('/cases/:id/findings/:fid/answer', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const body = bodyOf(ctx)
  const resolution = body.resolution
  if (!isResolution(resolution)) {
    return fail(ctx, 400, 'invalid_input', 'resolution 须为 fixed|wrong|intentional|didnt_matter')
  }
  const policy = loadReviewPolicy()
  const result = answerFinding(rec, ctx.params.fid, resolution, actorOf(ctx))
  if ('error' in result) return fail(ctx, result.code === 'finding_not_found' ? 404 : 409, result.code, result.detail)
  const saved = saveCase(refreshCaseState(result.case, policy))
  ctx.body = { ok: true, case: saved, finding: result.finding, readiness: mergeReadiness(saved, policy) }
})

router.post('/cases/:id/findings/:fid/verify', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const body = bodyOf(ctx)
  const vote = body.vote
  if (vote !== 'confirm' && vote !== 'reject') {
    return fail(ctx, 400, 'invalid_input', 'vote 须为 confirm|reject')
  }
  const voter = str(body.voter)
  if (!voter) return fail(ctx, 400, 'invalid_input', 'voter 必填（验证 Agent 或人）')
  const policy = loadReviewPolicy()
  const result = verifyFinding(rec, ctx.params.fid, vote, voter, actorKindFrom(body, actorOf(ctx)))
  if ('error' in result) return fail(ctx, result.code === 'finding_not_found' ? 404 : 409, result.code, result.detail)
  const saved = saveCase(refreshCaseState(result.case, policy))
  ctx.body = { ok: true, case: saved, finding: result.finding, readiness: mergeReadiness(saved, policy) }
})

router.post('/cases/:id/findings/:fid/promote', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const finding = rec.findings.find((f) => f.findingId === ctx.params.fid)
  if (!finding) return fail(ctx, 404, 'finding_not_found', '发现项不存在')
  const body = bodyOf(ctx)
  const source = body.source === 'incident' || body.source === 'revert' ? body.source : 'manual'
  const evalCase = appendEvalCase({
    caseId: rec.caseId,
    findingId: finding.findingId,
    source,
    title: str(body.title) ?? `[${finding.severity}] ${finding.file}:${finding.line}`,
    expected: str(body.expected) ?? `评审应命中：${finding.body}`,
    file: finding.file,
    line: finding.line,
    createdBy: actorOf(ctx),
  })
  const next: ReviewCase = {
    ...rec,
    findings: rec.findings.map((f) => (f.findingId === finding.findingId ? { ...f, promotedEvalCaseId: evalCase.evalCaseId } : f)),
    updatedAt: Date.now(),
  }
  const saved = saveCase(next)
  ctx.body = { ok: true, case: saved, evalCase }
})

router.post('/cases/:id/approvals', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const body = bodyOf(ctx)
  const decision = body.decision
  if (decision !== 'approve' && decision !== 'request_changes' && decision !== 'comment') {
    return fail(ctx, 400, 'invalid_input', 'decision 须为 approve|request_changes|comment')
  }
  const actor = str(body.actor) ?? actorOf(ctx)
  const actorKind = actorKindFrom(body, actor)
  const commit = str(body.commit) ?? rec.headCommit
  if (!commit) return fail(ctx, 400, 'commit_required', '审批必须绑定提交（commit 或案例 headCommit）')
  const policy = loadReviewPolicy()
  const next = addApproval(rec, {
    actor,
    actorKind,
    decision,
    commit,
    note: str(body.note),
    conflictResolved: body.conflictResolved === true,
  })
  const saved = saveCase(refreshCaseState(next, policy))
  ctx.body = { ok: true, case: saved, readiness: mergeReadiness(saved, policy) }
})

router.post('/cases/:id/checks', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const checks = bodyOf(ctx).checks
  if (!isCheckState(checks)) return fail(ctx, 400, 'invalid_input', 'checks 须为 green|red|unknown')
  const policy = loadReviewPolicy()
  const saved = saveCase(refreshCaseState({ ...rec, checks, updatedAt: Date.now() }, policy))
  ctx.body = { ok: true, case: saved, readiness: mergeReadiness(saved, policy) }
})

router.post('/cases/:id/state', async (ctx) => {
  const rec = requireCase(ctx)
  if (!rec) return
  const state = bodyOf(ctx).state
  if (state !== 'merged' && state !== 'abandoned') {
    return fail(ctx, 400, 'invalid_input', 'state 须为 merged|abandoned')
  }
  const policy = loadReviewPolicy()
  if (state === 'merged') {
    if (rec.state === 'merged') {
      ctx.body = { ok: true, case: rec, readiness: mergeReadiness(rec, policy) }
      return
    }
    const readiness = mergeReadiness(rec, policy)
    if (!readiness.ready) {
      return fail(ctx, 409, 'not_ready', `合并就绪度未达标：${readiness.blockers.join('；')}`)
    }
    appendSignal({ kind: 'merge', caseId: rec.caseId })
  }
  const saved = saveCase({ ...rec, state, updatedAt: Date.now() })
  ctx.body = { ok: true, case: saved, readiness: mergeReadiness(saved, policy) }
})

router.post('/signals', async (ctx) => {
  const body = bodyOf(ctx)
  const kind = body.kind
  if (!isSignalKind(kind)) return fail(ctx, 400, 'invalid_input', 'kind 须为 revert|incident|merge')
  const signal = appendSignal({
    kind,
    caseId: str(body.caseId),
    note: str(body.note),
  })
  const policy = loadReviewPolicy()
  ctx.body = { ok: true, signal, breaker: evaluateBreaker(listSignals(), policy) }
})

router.get('/metrics', async (ctx) => {
  const policy = loadReviewPolicy()
  const metrics = computeMetrics(listCases(), listSignals(), policy, listEvalCases())
  ctx.body = { ok: true, metrics }
})

export const reviewGovRoutes = router
