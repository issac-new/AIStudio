// eval 一致性/归因/证据/Oracle/闭环 路由处理器（v0.4 单文件体量治理：从 controller.ts 拆出，行为不变）。
// 路由注册仍留在 controller.ts，保持原有注册顺序与路径。

import type { Context } from 'koa'
import { aggregateRun, compareRuns } from '../aggregate'
import { blindTrimmedMean } from '../blind-review'
import { coverageOfSets } from '../coverage'
import { evaluatorAuditOf } from '../evaluators'
import { judgeHumanAgreement } from '../human-agreement'
import { buildRegistryView, summarizeConsumption } from '../metric-registry'
import { runOutcomeCheck, listOutcomeVerifiers, type OutcomeRunContext } from '../outcome'
import { runReplayEval, type SampleInput } from '../runner'
import { computeE2eVerdict, e2eVerdictLine } from '../e2e-verdict'
import { sampleFromTrace, sampleSpanFromTrace } from '../trace-sampler'
import { reflowTraceToSet } from '../trace-reflow'
import { runOracleCase, playwrightBrowser, type OracleRunRecord } from '../uioracle'
import {
  appendIteration, appendOracleRun, appendTasksToSet, auditSnapshot, createOracleCase, createRemediation, createSet, exportSet,
  getOracleCase, getRemediation, getRun, getSet, getSetRevision, labelSetDimensions, listIterations, listOracleCases, listOracleRuns,
  listRemediations, listRuns, listSetRevisions, listSets, recordHumanVerdict, recordLiveEvidence,
  reflowTaskToSet, REGRESSION_SET_NAME, reviseRubric, saveSetCalibration, sealSet, verifyRemediation,
  addSetClarification,
} from '../store'
import { calibrateSet, type CalibrationSample } from '../set-calibration'
import { judgeAttempt } from '../judge'
import { publicSetView, publicTaskView } from '../rubric-visibility'
import { fail, ok } from '../../lib/http'
import { countRuns as countRedteamRuns } from '../../redteam/store'
import { loadEvalConfig } from '../types'
import { synthesizeProbesForTask } from '../synthesize'
import { compareBaseline, gradeSpecDesign, snapshotBaseline } from '../skill-grader'
import { ENTERPRISE_AXES, ENTERPRISE_SET_NAME, axesCoverage, buildEnterpriseSeedTasks } from '../enterprise-seed'
import { FAULT_CATEGORIES, FAULT_SET_NAME, buildFaultSeedTasks } from '../fault-seed'
import type { EvalRun, EvalSet, EvalTask, LiveEvidence } from '../types'
import { buildRedteamSeedTasks, REDTEAM_SET_NAME, REDTEAM_VECTORS } from '../redteam-seed'
import { buildRedteamVariants } from '../redteam-variants'
import { distillBadCase, judgeAttributionOf, ROOT_CAUSE_LABELS } from '../badcase-distill'
import { buildBadCaseVariants, CF_DIMENSIONS } from '../badcase-variants'
import { flywheelReadoutOf, latestRunOfSet, listLedger, mergeGateOf, passRateGateOf, recordDistill, recordVariantBatch, type ChangeManifest } from '../flywheel'
import { recallFewshot } from '../fewshot'
import { evaluateReleaseHold } from '../release-hold'
import { buildBehaviorSignals } from '../behavior-signals'
import { businessSummaryOf } from '../business-summary'
import { collectObsSignals } from '../../obssignals/collect'

import { actorOf, runSummary, setForRun } from './shared'

/** GET /runs/:id/agreement */
export async function getRunsIdAgreement(ctx: Context) {
const run = getRun(ctx.params.id)
if (!run) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
ctx.body = { ok: true, agreement: judgeHumanAgreement(run.attempts) }
}

/** GET /runs/:id/release-hold */
export async function getRunsIdReleaseHold(ctx: Context) {
const run = getRun(ctx.params.id)
if (!run) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
const baselineId = typeof ctx.query.baselineRunId === 'string' ? ctx.query.baselineRunId : null
const baselineRun = baselineId ? getRun(baselineId) : null
if (baselineId && !baselineRun) {
  ctx.status = 404
  ctx.body = { ok: false, problems: [`基线运行不存在：${baselineId}`] }
  return
}
const candidate = run.aggregates.releaseGate ?? null
if (!candidate) {
  ctx.body = { ok: false, problems: ['候选运行无 releaseGate 聚合（先完成判分聚合）'] }
  return
}
ctx.body = {
  ok: true,
  hold: evaluateReleaseHold(candidate, baselineRun?.aggregates.releaseGate ?? null),
}
}

/** POST /blind-reviews/trimmed-mean */
export async function postBlindReviewsTrimmedMean(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const scores = Array.isArray(body.scores)
  ? (body.scores as Array<Record<string, unknown>>).map((s, i) => ({
    reviewerId: typeof s.reviewerId === 'string' ? s.reviewerId : `r${i + 1}`,
    score: Number(s.score),
  }))
  : []
const scaleMin = Number(body.scaleMin ?? 1)
const scaleMax = Number(body.scaleMax ?? 5)
if (!scores.length || !Number.isFinite(scaleMin) || !Number.isFinite(scaleMax) || scaleMax <= scaleMin) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['scores[{reviewerId,score}] 必填；scaleMin<scaleMax'] }
  return
}
ctx.body = {
  ok: true,
  result: blindTrimmedMean({
    reviewId: typeof body.reviewId === 'string' ? body.reviewId : 'adhoc',
    targetRef: typeof body.targetRef === 'string' ? body.targetRef : 'unknown',
    scaleMin,
    scaleMax,
    scores,
    trim: body.trim === 'none' ? 'none' : 'minmax',
    minReviewers: Number.isFinite(Number(body.minReviewers)) ? Number(body.minReviewers) : undefined,
  }),
}
}

/** GET /runs/:id/evaluators */
export async function getRunsIdEvaluators(ctx: Context) {
const run = getRun(ctx.params.id)
if (!run) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
const set = getSet(run.setId)
if (!set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['评测集不存在'] }
  return
}
// 只回聚合与判词来源统计，不回题目内容——密封集也可安全查看。
ctx.body = { ok: true, audit: evaluatorAuditOf(set, run) }
}

/** GET /runs/:id/evidence */
export async function getRunsIdEvidence(ctx: Context) {
const run = getRun(ctx.params.id)
if (!run) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
const set = getSet(run.setId)
if (!set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['评测集不存在'] }
  return
}
if (set.sealed) {
  // 逐条证据是探测通道（可反推题目对错），密封集结构性拒绝。
  ctx.status = 403
  ctx.body = { ok: false, problems: ['密封集不提供逐条证据（防探测）'] }
  return
}
const taskId = typeof ctx.query.taskId === 'string' ? ctx.query.taskId : ''
const sampleIdx = Number(ctx.query.sampleIdx)
if (!taskId || !Number.isInteger(sampleIdx) || sampleIdx < 1) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['taskId 与 sampleIdx(≥1) 必填'] }
  return
}
const attempt = run.attempts.find((a) => a.taskId === taskId && a.sampleIdx === sampleIdx)
if (!attempt) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['样本不存在'] }
  return
}
if (!attempt.sessionId) {
  ctx.body = {
    ok: false,
    reason: '该样本为内联证据，未关联 session trace，无法回溯',
    taskId,
    sampleIdx,
  }
  return
}
const spanSample = attempt.spanRef ? sampleSpanFromTrace(attempt.sessionId, attempt.spanRef) : null
const sample = spanSample ?? sampleFromTrace(attempt.sessionId)
if (!sample.ok || !sample.sample) {
  ctx.body = {
    ok: false,
    reason: sample.reason ?? 'trace 读取失败',
    taskId,
    sampleIdx,
    sessionId: attempt.sessionId,
  }
  return
}
const transcript = sample.sample.transcript ?? ''
const maxChars = 4000
ctx.body = {
  ok: true,
  taskId,
  sampleIdx,
  sessionId: attempt.sessionId,
  ...(attempt.spanRef ? { spanRef: attempt.spanRef, spanKind: spanSample?.spanKind } : {}),
  transcript: transcript.slice(0, maxChars),
  truncated: transcript.length > maxChars,
  toolCalls: sample.sample.toolCalls ?? [],
  efficiency: sample.sample.efficiency ?? {},
  meta: sample.meta,
  hint: '证据为工具调用摘要（参数已脱敏）；原始轨迹见 ~/.hermes/traces/<sessionId>.jsonl。',
}
}

/** POST /runs/:id/live-evidence */
export async function postRunsIdLiveEvidence(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const evidence: LiveEvidence = { recordedBy: actorOf(ctx) ?? 'anonymous', recordedAt: Date.now() }
const problems: string[] = []

const q = body.qpsProbe as Record<string, unknown> | undefined
if (q !== undefined) {
  const targetQps = Number(q.targetQps)
  const achievedQps = Number(q.achievedQps)
  const errorRate = Number(q.errorRate)
  const p99ToP50 = Number(q.p99ToP50)
  if (![targetQps, achievedQps, p99ToP50].every((v) => Number.isFinite(v) && v > 0)) problems.push('qpsProbe.targetQps/achievedQps/p99ToP50 须为正数')
  if (!(Number.isFinite(errorRate) && errorRate >= 0 && errorRate <= 1)) problems.push('qpsProbe.errorRate 须为 0~1')
  if (!problems.length) {
    evidence.qpsProbe = {
      targetQps, achievedQps, errorRate, p99ToP50,
      ...(typeof q.source === 'string' && q.source.trim() ? { source: q.source.trim() } : {}),
      at: Date.now(),
    }
  }
}

if (Array.isArray(body.responseTiers)) {
  const tiers: LiveEvidence['responseTiers'] = []
  for (const [i, raw] of body.responseTiers.entries()) {
    const t = raw as Record<string, unknown>
    const tier = t.tier === 'simple' || t.tier === 'complex' ? t.tier : null
    const samples = Number(t.samples)
    const p95Ms = Number(t.p95Ms)
    if (!tier) problems.push(`responseTiers[${i}].tier 须为 simple/complex`)
    if (!(Number.isInteger(samples) && samples >= 1)) problems.push(`responseTiers[${i}].samples 须为 ≥1 整数`)
    if (!(Number.isFinite(p95Ms) && p95Ms > 0)) problems.push(`responseTiers[${i}].p95Ms 须为正数`)
    if (tier && !problems.length) {
      tiers.push({ tier, samples, p95Ms, ...(typeof t.source === 'string' && t.source.trim() ? { source: t.source.trim() } : {}), at: Date.now() })
    }
  }
  if (!problems.length && tiers.length > 0) evidence.responseTiers = tiers
}

if (!evidence.qpsProbe && !evidence.responseTiers) problems.push('须至少携带 qpsProbe 或 responseTiers 之一')
if (problems.length) {
  ctx.status = 400
  ctx.body = { ok: false, problems }
  return
}
const config = loadEvalConfig()
const run = getRun(ctx.params.id)
const set = run ? setForRun(run) : undefined
const result = recordLiveEvidence(ctx.params.id, evidence, (r) => (set ? aggregateRun(set, r, config) : r))
if (!result.ok) {
  ctx.status = 404
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.body = { ok: true, run: set?.sealed ? runSummary(result.run) : result.run }
}

/** POST /runs/:id/attributions */
export async function postRunsIdAttributions(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const run = getRun(ctx.params.id)
if (!run) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
if (body.route === 'agent') {
  // Agent Loop：指回 review 域既有评审流程（不做双头实现——单一事实源）
  ctx.body = {
    ok: true,
    loop: 'agent',
    pointer: { domain: 'review', hint: '走评审域三裁决流程（/api/review/*），运行证据已在本 run 的 attempts 留痕' },
  }
  return
}
const finding = body.finding === 'judge_wrong' || body.finding === 'rubric_ambiguous' ? body.finding : null
if (!finding || typeof body.taskId !== 'string' || typeof body.assertionId !== 'string') {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['rubric 路径须带 taskId/assertionId/finding(judge_wrong|rubric_ambiguous)；或 route=agent'] }
  return
}
const attempt = run.attempts.find((a) => a.taskId === body.taskId)
const verdict = attempt?.verdicts.find((v) => v.assertionId === body.assertionId)
const result = appendIteration({
  runId: ctx.params.id,
  taskId: body.taskId,
  assertionId: body.assertionId,
  verdictAtTime: verdict?.value ?? 'unknown',
  finding,
  ...(typeof body.note === 'string' ? { note: body.note } : {}),
  createdBy: actorOf(ctx),
})
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = 201
ctx.body = { ok: true, loop: 'rubric', iteration: result.iteration }
}

/** GET /runs/:id/iterations */
export async function getRunsIdIterations(ctx: Context) {
ctx.body = { ok: true, iterations: listIterations(ctx.params.id) }
}

/** GET /iterations */
export async function getIterations(ctx: Context) {
ctx.body = { ok: true, iterations: listIterations() }
}

/** GET /oracle/cases */
export async function getOracleCases(ctx: Context) {
ctx.body = { ok: true, cases: listOracleCases() }
}

/** POST /oracle/cases */
export async function postOracleCases(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const result = createOracleCase(body as never, actorOf(ctx))
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = 201
ctx.body = { ok: true, case: result.case }
}

/** POST /oracle/cases/:id/run */
export async function postOracleCasesIdRun(ctx: Context) {
const oracleCase = getOracleCase(ctx.params.id)
if (!oracleCase) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['用例不存在'] }
  return
}
const record: OracleRunRecord = {
  id: `orun-${Date.now().toString(36)}`,
  caseId: oracleCase.id,
  status: 'done',
  verdict: 'unknown',
  createdAt: Date.now(),
  ...(actorOf(ctx) ? { createdBy: actorOf(ctx) } : {}),
}
try {
  const browser = await playwrightBrowser()
  try {
    const output = await runOracleCase(oracleCase, {
      config: loadEvalConfig(),
      browser,
    })
    record.stage1 = output.stage1
    record.stage2 = output.stage2
    record.frames = output.frames
    record.verdict = output.verdict
  } finally {
    // 每次运行起的 chromium 实例用完即关（进程级泄漏防护）
    await browser.close().catch(() => undefined)
  }
} catch (e) {
  record.status = 'failed'
  record.verdict = 'failed'
  record.error = (e as Error).message
}
appendOracleRun(record)
ctx.status = 201
ctx.body = { ok: true, run: record }
}

/** GET /oracle/runs */
export async function getOracleRuns(ctx: Context) {
const caseId = typeof ctx.query.caseId === 'string' ? ctx.query.caseId : undefined
ctx.body = { ok: true, runs: listOracleRuns(caseId) }
}

/** GET /metric-registry */
export async function getMetricRegistry(ctx: Context) {
const snapshot = auditSnapshot()
const coverage = coverageOfSets(snapshot.sets)
const consumption = summarizeConsumption({
  runs: snapshot.runs.map((run) => ({
    aggregates: {
      passAt1: run.aggregates.passAt1,
      passAtK: run.aggregates.passAtK,
      riskVeto: run.aggregates.riskVeto,
      releaseGate: { measuredCount: run.aggregates.releaseGate?.measuredCount ?? 0 },
    },
    attempts: run.attempts.map((attempt) => ({
      verdicts: attempt.verdicts.map((v) => ({ source: v.source, previousValue: v.previousValue })),
    })),
  })),
  iterations: snapshot.iterationCount,
  reflows: snapshot.reflowCount,
  dimensionTaggedTasks: snapshot.dimensionTaggedTasks,
  redteamRuns: countRedteamRuns(),
})
ctx.body = { ok: true, registry: buildRegistryView(consumption), coverage }
}

/** GET /outcome-verifiers */
export async function getOutcomeVerifiers(ctx: Context) {
ctx.body = { ok: true, verifiers: listOutcomeVerifiers() }
}

/** GET /behavior-signals */
export async function getBehaviorSignals(ctx: Context) {
const days = Math.min(30, Math.max(1, Number(ctx.query.days) || 7))
const collected = collectObsSignals(days)
if (!collected.report.available) {
  ctx.body = { ok: true, available: false, days, reason: collected.report.notes.join('；') || '观测数据不可用', signals: null }
  return
}
ctx.body = { ok: true, available: true, signals: buildBehaviorSignals(collected.report.totals, days) }
}

/** GET /runs/:id/business-summary */
export async function getRunsIdBusinessSummary(ctx: Context) {
const run = getRun(ctx.params.id)
if (!run) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
ctx.body = { ok: true, summary: businessSummaryOf(run) }
}

/** POST /e2e-verdict */
export function postE2eVerdict(ctx: Context) {
const b = ctx.request.body as {
  metricRegistry?: unknown; evalRun?: unknown; evalSet?: unknown
  evaluators?: unknown; redteamRun?: unknown
  maxUnknown?: unknown; maxRedteamFp?: unknown
} | undefined
const obj = (v: unknown) => (v && typeof v === 'object' && Object.keys(v as object).length > 0 ? v as Record<string, unknown> : null)
if (!obj(b?.evalRun)) {
  fail(ctx, 400, 'evalRun 必填（/api/hermes/eval/runs/:id 响应件）')
  return
}
const r = computeE2eVerdict({
  registry: obj(b?.metricRegistry),
  runBody: obj(b?.evalRun),
  setBody: obj(b?.evalSet),
  evaluators: obj(b?.evaluators),
  redteamRun: obj(b?.redteamRun),
  maxUnknown: typeof b?.maxUnknown === 'number' ? b.maxUnknown : Number(process.env.EVAL_MAX_UNKNOWN ?? 0.10),
  maxRedteamFp: typeof b?.maxRedteamFp === 'number' ? b.maxRedteamFp : Number(process.env.EVAL_REDTEAM_FP_MAX ?? 0.20),
})
ctx.body = { ok: true, ...r, line: e2eVerdictLine(r) }
}

export const analysisHandlers = {
  getRunsIdAgreement,
  getRunsIdReleaseHold,
  postBlindReviewsTrimmedMean,
  getRunsIdEvaluators,
  getRunsIdEvidence,
  postRunsIdLiveEvidence,
  postRunsIdAttributions,
  getRunsIdIterations,
  getIterations,
  getOracleCases,
  postOracleCases,
  postOracleCasesIdRun,
  getOracleRuns,
  getMetricRegistry,
  getOutcomeVerifiers,
  getBehaviorSignals,
  getRunsIdBusinessSummary,
  postE2eVerdict,
}
