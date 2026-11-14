// eval 运行/处置单路由处理器（v0.4 单文件体量治理：第二批拆分，行为不变）。
// 路由注册仍留在 controller.ts，保持原有注册顺序与路径。

// eval 运行/处置单/数据飞轮 路由处理器（v0.4 单文件体量治理：从 controller.ts 拆出，行为不变）。
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
import { appendDiscoveryRun, listDiscoveryRuns, scoreDiscovery, type DiscoveryRun } from '../discovery-score'
import type { DiscoveryFinding } from '../types'
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

import { actorOf, outcomeContext, runSummary, setForRun, parseStabilityRetest } from './shared'

/** POST /runs */
export async function postRuns(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const setId = typeof body.setId === 'string' ? body.setId : ''
const rawSamples = (body.samples ?? {}) as Record<string, SampleInput[]>
if (!setId || typeof rawSamples !== 'object') {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['setId 与 samples 必填'] }
  return
}
const target = (body.target ?? {}) as EvalRun['target']
const stabilityRetest = parseStabilityRetest(body.stabilityRetest)
if (body.stabilityRetest !== undefined && stabilityRetest === undefined) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['stabilityRetest 须为 2-10 的整数（轮数；成本随轮数线性放大）'] }
  return
}
const result = await runReplayEval(
  {
    setId,
    samples: rawSamples,
    target,
    crossValidate: body.crossValidate === true,
    referenceLeakCheck: body.referenceLeakCheck === true,
    stabilityRetest,
    useOrigin: body.useOrigin === true,
    ...(typeof body.note === 'string' ? { note: body.note } : {}),
    actor: actorOf(ctx) ?? 'anonymous',
  },
  { judge: { config: loadEvalConfig() }, outcomeCtx: outcomeContext() },
)
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
const set = getSet(setId)
ctx.status = 201
// 密封集响应只回聚合
ctx.body = set?.sealed
  ? { ok: true, run: runSummary(result.run) }
  : { ok: true, run: result.run }
}


/** GET /runs */
export async function getRuns(ctx: Context) {
const setId = typeof ctx.query.setId === 'string' ? ctx.query.setId : undefined
ctx.body = { ok: true, runs: listRuns(setId).map(runSummary) }
}


/** POST /runs/:id/rerun */
export async function postRunsIdRerun(ctx: Context) {
const base = getRun(ctx.params.id)
if (!base) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const rawSamples = (body.samples ?? {}) as Record<string, SampleInput[]>
if (typeof rawSamples !== 'object' || Array.isArray(rawSamples)) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['samples 必填（taskId → 样本列表）'] }
  return
}
const set = getSet(base.setId)
if (!set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['评测集不存在'] }
  return
}
const result = await runReplayEval(
  {
    setId: base.setId,
    samples: rawSamples,
    target: (body.target ?? base.target) as EvalRun['target'],
    crossValidate: body.crossValidate === true,
    useOrigin: body.useOrigin === true,
    note: typeof body.note === 'string' && body.note.trim() ? body.note.trim() : `同卷复评：${base.id}`,
    actor: actorOf(ctx) ?? 'anonymous',
    ...(base.setRevision !== undefined ? { setRevision: base.setRevision } : {}),
    ...(base.setHash ? { expectedSetHash: base.setHash } : {}),
    ...(base.setRevision !== undefined ? { expectedRevision: base.setRevision } : {}),
  },
  { judge: { config: loadEvalConfig() }, outcomeCtx: outcomeContext() },
)
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = 201
ctx.body = set.sealed
  ? { ok: true, run: runSummary(result.run) }
  : { ok: true, run: result.run }
}


/** POST /runs/:id/remediations */
export async function postRunsIdRemediations(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const taskId = typeof body.taskId === 'string' ? body.taskId : ''
if (!taskId) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['taskId 必填'] }
  return
}
const sampleIdx = Number(body.sampleIdx)
const result = createRemediation({
  runId: ctx.params.id,
  taskId,
  ...(Number.isInteger(sampleIdx) && sampleIdx >= 1 ? { sampleIdx } : {}),
  ...(typeof body.note === 'string' ? { note: body.note } : {}),
  ...(typeof body.owner === 'string' ? { owner: body.owner } : {}),
  ...(actorOf(ctx) ? { createdBy: actorOf(ctx) } : {}),
})
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = result.created ? 201 : 200
ctx.body = { ok: true, created: result.created, remediation: result.remediation }
}


/** GET /runs/:id/remediations */
export async function getRunsIdRemediations(ctx: Context) {
ctx.body = { ok: true, remediations: listRemediations({ runId: ctx.params.id }) }
}


/** GET /remediations */
export async function getRemediations(ctx: Context) {
const runId = typeof ctx.query.runId === 'string' ? ctx.query.runId : undefined
const setId = typeof ctx.query.setId === 'string' ? ctx.query.setId : undefined
const status = typeof ctx.query.status === 'string' ? ctx.query.status : undefined
ctx.body = { ok: true, remediations: listRemediations({ runId, setId, status }) }
}


/** POST /remediations/:id/verify */
export async function postRemediationsIdVerify(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const rerunRunId = typeof body.rerunRunId === 'string' ? body.rerunRunId : ''
if (!rerunRunId) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['rerunRunId 必填（先经 /runs/:id/rerun 复评）'] }
  return
}
if (!getRemediation(ctx.params.id)) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['处置单不存在'] }
  return
}
const result = verifyRemediation(ctx.params.id, rerunRunId)
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.body = {
  ok: true,
  closed: result.closed,
  alreadyClosed: result.alreadyClosed,
  remediation: result.remediation,
  ...(result.autoReflow ? { autoReflow: result.autoReflow } : {}),
}
}


/** POST /runs/discovery（2026-11-14 P1 发现测试）：{setId, findings, note?} → 判分＋落账。
 * 只接受 kind=discovery 的集（task 形态集走既有 /runs 回放判分通道）；findings 每条
 * description 必填，evidenceRefs 缺失不拒收——判分层判 unsupported（锚点门槛在判分不在入口，
 * 报告才能如实呈现「无锚点发现」这一失败形态而非入口静默丢弃）。 */
export async function postRunsDiscovery(ctx: Context) {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const setId = typeof body.setId === 'string' ? body.setId : ''
  const findings = body.findings
  if (!setId || !Array.isArray(findings)) {
    ctx.status = 400
    ctx.body = { ok: false, problems: ['setId 与 findings（数组）必填'] }
    return
  }
  const set = getSet(setId)
  if (!set) {
    ctx.status = 404
    ctx.body = { ok: false, problems: [`评测集不存在：${setId}`] }
    return
  }
  if (set.kind !== 'discovery' || !set.discovery) {
    ctx.status = 400
    ctx.body = { ok: false, problems: [`集 ${setId} 非 discovery 形态（task 形态走 POST /runs 回放判分）`] }
    return
  }
  const problems: string[] = []
  findings.forEach((f, i) => {
    const it = f as Partial<DiscoveryFinding>
    if (!it || typeof it.description !== 'string' || !it.description.trim()) problems.push(`findings #${i} description 必填`)
  })
  if (problems.length) {
    ctx.status = 400
    ctx.body = { ok: false, problems }
    return
  }
  const score = scoreDiscovery(set.discovery, findings as DiscoveryFinding[])
  const run: DiscoveryRun = {
    id: `drun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    setId,
    setHash: set.contentHash,
    score,
    createdAt: Date.now(),
    createdBy: actorOf(ctx) ?? 'anonymous',
    ...(typeof body.note === 'string' && body.note.trim() ? { note: body.note.trim() } : {}),
  }
  appendDiscoveryRun(run)
  ctx.status = 201
  ctx.body = { ok: true, run }
}

/** GET /runs/discovery?setId=（P1）：发现测试运行账（独立账本；坏行计数如实呈现）。 */
export async function getRunsDiscovery(ctx: Context) {
  const setId = typeof ctx.query.setId === 'string' && ctx.query.setId ? ctx.query.setId : undefined
  const { runs, badLines } = listDiscoveryRuns(setId)
  ctx.body = { ok: true, runs, ...(badLines > 0 ? { badLines } : {}) }
}


export const runsHandlers = {
  postRuns,
  getRuns,
  postRunsIdRerun,
  postRunsIdRemediations,
  getRunsIdRemediations,
  getRemediations,
  postRemediationsIdVerify,
  postRunsDiscovery,
  getRunsDiscovery,
}
