// eval 评测集与版本 路由处理器（v0.4 单文件体量治理：从 controller.ts 拆出，行为不变）。
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

import { actorOf, setSummary } from './shared'

/** POST /sample-from-trace */
export async function postSampleFromTrace(ctx: Context) {
const body = (ctx.request.body ?? {}) as { sessionId?: unknown }
const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
if (!sessionId) {
  ctx.status = 400
  ctx.body = { ok: false, detail: 'sessionId 必填' }
  return
}
const result = sampleFromTrace(sessionId)
if (!result.ok) {
  ctx.status = result.reason === 'sessionId 含非法字符' ? 400 : 404
  ctx.body = result
  return
}
ctx.body = { ...result, actor: actorOf(ctx) }
}

/** POST /sample-span-from-trace */
export async function postSampleSpanFromTrace(ctx: Context) {
const body = (ctx.request.body ?? {}) as { sessionId?: unknown; spanRef?: unknown }
const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
const spanRef = typeof body.spanRef === 'string' ? body.spanRef.trim() : ''
if (!sessionId || !spanRef) {
  ctx.status = 400
  ctx.body = { ok: false, detail: 'sessionId 与 spanRef 必填' }
  return
}
const result = sampleSpanFromTrace(sessionId, spanRef)
if (!result.ok) {
  ctx.status = result.reason?.includes('非法字符') ? 400 : 404
  ctx.body = result
  return
}
ctx.body = { ...result, actor: actorOf(ctx) }
}

/** POST /reflow-from-trace */
export async function postReflowFromTrace(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const result = reflowTraceToSet({
  sessionId: typeof body.sessionId === 'string' ? body.sessionId.trim() : '',
  ...(typeof body.spanRef === 'string' && body.spanRef.trim() ? { spanRef: body.spanRef.trim() } : {}),
  expectedTraceHash: typeof body.expectedTraceHash === 'string' ? body.expectedTraceHash.trim() : '',
  task: body.task as never,
  ...(typeof body.targetSetId === 'string' && body.targetSetId.trim() ? { targetSetId: body.targetSetId.trim() } : {}),
  actor: actorOf(ctx),
})
if (result.ok === false) {
  const failure = result as { ok: false; code: string; problems: string[] }
  ctx.status = failure.code === 'origin_conflict' || failure.code === 'trace_hash_mismatch'
    ? 409
    : failure.code === 'trace_unavailable' || failure.code === 'target_not_found' ? 404 : 400
  ctx.body = { ok: false, code: failure.code, problems: failure.problems }
  return
}
ctx.status = result.created ? 201 : 200
ctx.body = {
  ok: true,
  created: result.created,
  taskId: result.taskId,
  set: { id: result.set.id, name: result.set.name, track: result.set.track, taskCount: result.set.tasks.length, revision: result.set.revision },
  ...(result.alsoIn && result.alsoIn.length > 0 ? { alsoIn: result.alsoIn } : {}),
}
}

/** GET /sets */
export async function getSets(ctx: Context) {
ctx.body = { ok: true, sets: listSets() }
}

/** POST /sets */
export async function postSets(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const result = createSet(body as never, actorOf(ctx))
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = 201
ctx.body = { ok: true, set: result.set }
}

/** POST /sets/redteam-seed */
export async function postSetsRedteamSeed(ctx: Context) {
const store = { listSets }
const existing = store.listSets().find((s) => s.name === REDTEAM_SET_NAME)
if (existing) {
  ctx.body = { ok: true, existed: true, set: existing, vectors: REDTEAM_VECTORS }
  return
}
const result = createSet(
  { name: REDTEAM_SET_NAME, track: 'e2e', tasks: buildRedteamSeedTasks() },
  actorOf(ctx) ?? 'redteam-seed',
)
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = 201
ctx.body = { ok: true, existed: false, set: result.set, vectors: REDTEAM_VECTORS }
}

/** POST /sets/redteam-variants */
export async function postSetsRedteamVariants(ctx: Context) {
const existing = listSets().find((s) => s.name === REDTEAM_SET_NAME)
if (!existing) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['红队种子库不存在，先建种子库（POST /sets/redteam-seed）'] }
  return
}
const result = appendTasksToSet(existing.id, buildRedteamVariants())
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = result.appended > 0 ? 201 : 200
ctx.body = { ok: true, appended: result.appended, set: { id: result.set.id, name: result.set.name, taskCount: result.set.tasks.length, revision: result.set.revision } }
}

/** POST /sets/enterprise-seed */
export async function postSetsEnterpriseSeed(ctx: Context) {
const existing = listSets().find((s) => s.name === ENTERPRISE_SET_NAME)
if (existing) {
  // listSets 返回摘要（EvalSetMeta 无 tasks）——取全集算覆盖
  const full = getSet(existing.id)
  ctx.body = { ok: true, existed: true, set: existing, axes: ENTERPRISE_AXES, coverage: full ? axesCoverage(full.tasks) : null }
  return
}
const result = createSet(
  { name: ENTERPRISE_SET_NAME, track: 'e2e', tasks: buildEnterpriseSeedTasks() },
  actorOf(ctx) ?? 'enterprise-seed',
)
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = 201
ctx.body = { ok: true, existed: false, set: setSummary(result.set), axes: ENTERPRISE_AXES, coverage: axesCoverage(result.set.tasks) }
}

/** POST /sets/fault-seed */
export async function postSetsFaultSeed(ctx: Context) {
const existing = listSets().find((s) => s.name === FAULT_SET_NAME)
if (existing) {
  ok(ctx, { existed: true, set: existing, categories: FAULT_CATEGORIES })
  return
}
const result = createSet(
  { name: FAULT_SET_NAME, track: 'e2e', tasks: buildFaultSeedTasks() },
  actorOf(ctx) ?? 'fault-seed',
)
if (!result.ok) {
  fail(ctx, 400, result.problems.join('；'))
  return
}
ctx.status = 201
ok(ctx, { existed: false, set: setSummary(result.set), categories: FAULT_CATEGORIES })
}

/** GET /sets/:id */
export async function getSetsId(ctx: Context) {
const set = getSet(ctx.params.id)
if (!set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['评测集不存在'] }
  return
}
if (set.sealed) {
  ctx.body = { ok: true, sealed: true, set: { id: set.id, name: set.name, track: set.track, module: set.module, sealed: true, contentHash: set.contentHash, revision: set.revision, createdAt: set.createdAt, taskCount: set.tasks.length } }
  return
}
// 隐藏断言不出 API 面（2026-10-30）：只暴露条数，内容仅在服务端判分时使用。
ok(ctx, { set: publicSetView(set) })
}

/** POST /sets/:id/seal */
export async function postSetsIdSeal(ctx: Context) {
const result = sealSet(ctx.params.id, actorOf(ctx))
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.body = { ok: true }
}

/** POST /sets/:id/calibrate */
export async function postSetsIdCalibrate(ctx: Context) {
const set = getSet(ctx.params.id)
if (!set) {
  fail(ctx, 404, '评测集不存在')
  return
}
const body = (ctx.request.body ?? {}) as { samples?: CalibrationSample[] }
const samples = Array.isArray(body.samples) ? body.samples : []
if (samples.length === 0) {
  fail(ctx, 400, 'samples 必填', { problems: ['至少 1 条「基线失败→解法通过」样本'] })
  return
}
const config = loadEvalConfig()
const calibration = await calibrateSet(set, samples, async (task, evidence) => {
  const judged = await judgeAttempt(task, evidence, { config }, {})
  // outcome 校验器检查的是运行环境终态，离线证据无法复现——synthesize 为通过，
  // 使校准只作用于 rubric（notes 里如实声明这一口径）。
  return {
    taskId: task.id,
    sampleIdx: 1,
    verdicts: judged.verdicts,
    ...(task.outcome ? { outcome: { verifier: task.outcome.verifier, ok: true, detail: 'calibration: 终态校验跳过' } } : {}),
    judgeMeta: judged.judgeMeta,
    judgedAt: Date.now(),
  }
})
const saved = saveSetCalibration(set.id, calibration)
if (!saved.ok) {
  fail(ctx, 400, '校准落库失败', { problems: saved.problems })
  return
}
ok(ctx, { calibration, sealed: set.sealed })
}

/** POST /sets/:id/clarifications */
export async function postSetsIdClarifications(ctx: Context) {
const body = (ctx.request.body ?? {}) as { question?: string; answer?: string }
const result = addSetClarification(ctx.params.id, String(body.question ?? ''), String(body.answer ?? ''))
if (!result.ok) {
  fail(ctx, 400, '澄清事实写入失败', { problems: result.problems })
  return
}
ok(ctx, { clarifications: result.set.clarifications ?? [] })
}

/** GET /sets/:id/export */
export async function getSetsIdExport(ctx: Context) {
const result = exportSet(ctx.params.id)
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
// 隐藏断言不可导出（2026-10-30）：导出面与详情面同一投影。
ok(ctx, { set: publicSetView(result.set) })
}

/** POST /sets/:id/dimensions */
export async function postSetsIdDimensions(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const assignments = body.assignments
if (assignments !== undefined && (typeof assignments !== 'object' || assignments === null || Array.isArray(assignments))) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['assignments 须为 {taskId: dimension|null} 对象'] }
  return
}
const backfill = body.backfill === undefined ? undefined : String(body.backfill)
// 路由层白名单与 store 同步扩（2026-10-31 活体实拍实录：收尾批只扩了 store 的
// enterprise-seed 分支，路由层旧白名单先拦——单测直调 labelSetDimensions 绕过
// 路由，活体 API 才暴露。教训：两端词表必须同批同步）。
if (backfill !== undefined && backfill !== 'redteam-seed' && backfill !== 'enterprise-seed') {
  fail(ctx, 400, 'backfill 参数不合法', { problems: [`backfill 只接受 'redteam-seed' | 'enterprise-seed'（收到：${backfill}）`] })
  return
}
const result = labelSetDimensions(ctx.params.id, {
  ...(assignments ? { assignments: assignments as Record<string, EvalTask['dimension'] | null> } : {}),
  ...(backfill ? { backfill: backfill as 'redteam-seed' | 'enterprise-seed' } : {}),
})
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.body = { ok: true, ...result.result, actor: actorOf(ctx) ?? null }
}

/** POST /sets/:id/tasks/:taskId/rubric */
export async function postSetsIdTasksTaskIdRubric(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const assertionId = typeof body.assertionId === 'string' ? body.assertionId : ''
const revision = typeof body.revision === 'string' ? body.revision : ''
const iterationId = typeof body.iterationId === 'string' ? body.iterationId : undefined
const result = reviseRubric(ctx.params.id, ctx.params.taskId, assertionId, revision, iterationId)
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.body = { ok: true, set: result.set.sealed ? setSummary(result.set) : result.set }
}

/** POST /sets/:id/tasks/:taskId/synthesize */
export async function postSetsIdTasksTaskIdSynthesize(ctx: Context) {
const set = getSet(ctx.params.id)
if (!set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['评测集不存在'] }
  return
}
if (set.sealed) {
  ctx.status = 403
  ctx.body = { ok: false, problems: ['密封集不可合成（内容不出 API 面，防探测）'] }
  return
}
const task = set.tasks.find((t) => t.id === ctx.params.taskId)
if (!task) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['任务不存在'] }
  return
}
const result = await synthesizeProbesForTask(task, { config: loadEvalConfig() })
ctx.body = { ...result, setId: set.id, taskId: task.id, actor: actorOf(ctx) }
}

/** GET /sets/:id/revisions */
export async function getSetsIdRevisions(ctx: Context) {
const set = getSet(ctx.params.id)
if (!set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['评测集不存在'] }
  return
}
const revisions = listSetRevisions(set.id).map((r) => ({
  revision: r.revision,
  contentHash: r.contentHash,
  createdAt: r.createdAt,
  taskCount: r.tasks.length,
}))
ctx.body = { ok: true, revisions }
}

/** GET /sets/:id/revisions/:revision */
export async function getSetsIdRevisionsRevision(ctx: Context) {
const set = getSet(ctx.params.id)
if (!set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['评测集不存在'] }
  return
}
const revision = Number(ctx.params.revision)
if (!Number.isInteger(revision) || revision < 1) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['revision 须为 ≥1 的整数'] }
  return
}
const frozen = getSetRevision(set.id, revision)
if (!frozen) {
  ctx.status = 404
  ctx.body = { ok: false, problems: [`版本不存在：r${revision}`] }
  return
}
if (set.sealed) {
  ctx.status = 403
  ctx.body = { ok: false, problems: ['密封集不提供历史版本题目内容（防探测）'] }
  return
}
// 历史版本同走可见性投影：隐藏断言不出对外 API 面（2026-10-30）。
ctx.body = { ok: true, revision: { ...frozen, tasks: frozen.tasks.map(publicTaskView) } }
}

export const setsHandlers = {
  postSampleFromTrace,
  postSampleSpanFromTrace,
  postReflowFromTrace,
  getSets,
  postSets,
  postSetsRedteamSeed,
  postSetsRedteamVariants,
  postSetsEnterpriseSeed,
  postSetsFaultSeed,
  getSetsId,
  postSetsIdSeal,
  postSetsIdCalibrate,
  postSetsIdClarifications,
  getSetsIdExport,
  postSetsIdDimensions,
  postSetsIdTasksTaskIdRubric,
  postSetsIdTasksTaskIdSynthesize,
  getSetsIdRevisions,
  getSetsIdRevisionsRevision,
}
