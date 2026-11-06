// eval 数据飞轮/坏例/技能评分路由处理器（v0.4 单文件体量治理：第二批拆分，行为不变）。
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

/** GET /runs/compare */
export async function getRunsCompare(ctx: Context) {
const baseId = typeof ctx.query.base === 'string' ? ctx.query.base : ''
const headId = typeof ctx.query.head === 'string' ? ctx.query.head : ''
if (!baseId || !headId) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['base 与 head 必填（运行 id）'] }
  return
}
const base = getRun(baseId)
const head = getRun(headId)
if (!base || !head) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在（base/head）'] }
  return
}
if (base.setId !== head.setId) {
  ctx.status = 400
  ctx.body = { ok: false, problems: [`A/B 对比须同评测集：base=${base.setId} / head=${head.setId}`] }
  return
}
// 同集不代表同一份考卷：改题前后读数不可直接比较（收口轮）
if (base.setHash && head.setHash && base.setHash !== head.setHash) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['A/B 对比须同考卷版本：两侧试卷指纹不一致（集已改版，读数不可直接比较）'] }
  return
}
if (base.setRevision !== undefined && head.setRevision !== undefined && base.setRevision !== head.setRevision) {
  ctx.status = 400
  ctx.body = { ok: false, problems: [`A/B 对比须同考卷版本：r${base.setRevision} ≠ r${head.setRevision}`] }
  return
}
const set = setForRun(base)
if (!set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['评测集不存在'] }
  return
}
// 密封集拒绝：逐任务对错是内容出库面（防探测契约）
if (set.sealed) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['密封集不做逐题对比（逐条对错可被重试探测）'] }
  return
}
ctx.body = { ok: true, compare: compareRuns(set, base, head) }
}


/** POST /runs/:id/reflow */
export async function postRunsIdReflow(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const taskId = typeof body.taskId === 'string' ? body.taskId : ''
const sampleIdx = Number(body.sampleIdx)
if (!taskId) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['taskId 必填（sampleIdx/targetSetId 可选）'] }
  return
}
const result = reflowTaskToSet({
  runId: ctx.params.id,
  taskId,
  ...(Number.isInteger(sampleIdx) && sampleIdx >= 1 ? { sampleIdx } : {}),
  ...(typeof body.targetSetId === 'string' && body.targetSetId.trim() ? { targetSetId: body.targetSetId.trim() } : {}),
  actor: actorOf(ctx),
})
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.status = result.created ? 201 : 200
ctx.body = { ok: true, created: result.created, taskId: result.taskId, set: { id: result.set.id, name: result.set.name, taskCount: result.set.tasks.length } }
}


/** POST /badcase/distill */
export async function postBadcaseDistill(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const runId = typeof body.runId === 'string' ? body.runId.trim() : ''
const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : ''
const sampleIdx = Number(body.sampleIdx)
if (!runId || !taskId || !Number.isInteger(sampleIdx) || sampleIdx < 1) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['runId/taskId/sampleIdx(≥1) 必填（targetSetId/dryRun 可选）'] }
  return
}
const run = getRun(runId)
const source = run ? getSet(run.setId) : undefined
if (!run || !source) {
  ctx.status = 404
  ctx.body = { ok: false, problems: [`运行不存在：${runId}`] }
  return
}
// 密封源集题目内容不出库（与 reflow 同纪律）——提炼是内容出库路径
if (source.sealed) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['密封集题目内容不出库，不可提炼'] }
  return
}
const distilled = distillBadCase(source, run, taskId, sampleIdx)
if (!distilled.ok) {
  ctx.status = 400
  ctx.body = { ok: false, code: distilled.code, problems: distilled.problems }
  return
}
const { task, rootCause, tabooActions, failedSteps, stepRedline } = distilled.distilled
const proposal = {
  taskId: task.id,
  rootCause,
  rootCauseLabel: ROOT_CAUSE_LABELS[rootCause],
  tabooActions,
  failedSteps,
  stepRedline,
}
if (body.dryRun === true) {
  ctx.body = { ok: true, dryRun: true, proposal, task }
  return
}
const targetSetIdRaw = typeof body.targetSetId === 'string' ? body.targetSetId.trim() : ''
const targetMeta = targetSetIdRaw
  ? listSets().find((s) => s.id === targetSetIdRaw)
  : listSets().find((s) => s.name === REGRESSION_SET_NAME && !s.sealed)
if (targetSetIdRaw && !targetMeta) {
  ctx.status = 400
  ctx.body = { ok: false, problems: [`目标评测集不存在：${targetSetIdRaw}`] }
  return
}
if (targetMeta?.sealed) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['目标评测集已密封，不可追加提炼任务'] }
  return
}
let appended: number
let setSummaryLine: { id: string; name: string; taskCount: number; revision: number }
if (!targetMeta) {
  const created = createSet({ name: REGRESSION_SET_NAME, track: source.track, tasks: [task] }, actorOf(ctx) ?? 'badcase-distill')
  if (!created.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: created.problems }
    return
  }
  appended = 1
  setSummaryLine = { id: created.set.id, name: created.set.name, taskCount: created.set.tasks.length, revision: created.set.revision }
} else {
  const result = appendTasksToSet(targetMeta.id, [task])
  if (!result.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: result.problems }
    return
  }
  appended = result.appended
  setSummaryLine = { id: result.set.id, name: result.set.name, taskCount: result.set.tasks.length, revision: result.set.revision }
}
// LLM 归因并联复核（round 2 D13）：选通才调用；判定端不可用如实 offline，不影响入库
const attribution = body.judgeAttribution === true
  ? await judgeAttributionOf(distilled.distilled, loadEvalConfig())
  : undefined
const ledger = recordDistill({
  taskId: task.id,
  sourceRunId: runId,
  sourceTaskId: taskId,
  sampleIdx,
  rootCause,
  tabooActions,
  failedSteps,
  stepRedline,
  targetSetId: setSummaryLine.id,
  ...(actorOf(ctx) ? { actor: actorOf(ctx) } : {}),
  // 文本快照（D16）：源集非密封（上文已拦），fewshot 召回的触发场景/正确示范源
  problem: source.tasks.find((t) => t.id === taskId)?.problem,
  expectedBehavior: source.tasks.find((t) => t.id === taskId)?.expectedBehavior,
  ...(attribution ? { attribution } : {}),
})
ctx.status = appended > 0 ? 201 : 200
ctx.body = {
  ok: true,
  appended,
  duplicate: appended === 0,
  ledgerDuplicate: ledger.duplicate,
  proposal,
  ...(attribution ? { attribution } : {}),
  set: setSummaryLine,
}
}


/** POST /badcase/variants */
export async function postBadcaseVariants(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const dimKeys = CF_DIMENSIONS.map((d) => d.key)
const dims = Array.isArray(body.dims)
  ? body.dims.filter((d): d is typeof dimKeys[number] => typeof d === 'string' && dimKeys.includes(d as typeof dimKeys[number]))
  : undefined
if (dims && dims.length === 0) {
  ctx.status = 400
  ctx.body = { ok: false, problems: [`dims 须为五维子集：${CF_DIMENSIONS.map((d) => d.key).join('/')}`] }
  return
}
// 蓝本定位：taskId 精确找（非密封集），或回归库全部 origin 任务
const nonSealedSets = listSets().filter((s) => !s.sealed).map((s) => getSet(s.id)).filter((s): s is EvalSet => s !== undefined)
const taskIdRaw = typeof body.taskId === 'string' ? body.taskId.trim() : ''
const variantTargetRaw = typeof body.targetSetId === 'string' ? body.targetSetId.trim() : ''
let blueprints: EvalTask[]
if (taskIdRaw) {
  const found = nonSealedSets.flatMap((s) => s.tasks).find((t) => t.id === taskIdRaw)
  if (!found) {
    ctx.status = 404
    ctx.body = { ok: false, problems: [`任务不存在（或所在集已密封）：${taskIdRaw}`] }
    return
  }
  blueprints = [found]
} else if (body.allFromRegression === true) {
  const regression = nonSealedSets.find((s) => s.name === REGRESSION_SET_NAME)
  blueprints = (regression?.tasks ?? []).filter((t) => t.origin)
} else {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['taskId 或 allFromRegression=true 二选一必填'] }
  return
}
// 变体不可再当蓝本（防变体套变体指数膨胀；维度缩配重跑走幂等跳过）
const variantBlueprints = blueprints.filter((t) => t.id.includes('-cf'))
blueprints = blueprints.filter((t) => !t.id.includes('-cf'))
if (blueprints.length === 0) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['无可扩产蓝本（变体任务不可再当蓝本；回归库无带溯源任务）'] }
  return
}

const results: Array<{ taskId: string; appended: number; variantIds: string[]; setId: string }> = []
for (const blueprint of blueprints) {
  const variants = buildBadCaseVariants(blueprint, dims)
  // 目标集：显式 targetSetId > 蓝本所在集
  const ownerSet = nonSealedSets.find((s) => s.tasks.some((t) => t.id === blueprint.id))
  const targetId = variantTargetRaw || ownerSet?.id
  if (!targetId) {
    ctx.status = 400
    ctx.body = { ok: false, problems: [`蓝本 ${blueprint.id} 所在集不可定位，须显式传 targetSetId`] }
    return
  }
  const appended = appendTasksToSet(targetId, variants)
  if (!appended.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: appended.problems }
    return
  }
  recordVariantBatch({
    blueprintTaskId: blueprint.id,
    variantIds: variants.map((v) => v.id),
    dimensions: (dims ?? CF_DIMENSIONS.map((d) => d.key)),
    targetSetId: targetId,
    ...(actorOf(ctx) ? { actor: actorOf(ctx) } : {}),
  })
  results.push({ taskId: blueprint.id, appended: appended.appended, variantIds: variants.map((v) => v.id), setId: targetId })
}
const totalAppended = results.reduce((sum, r) => sum + r.appended, 0)
ctx.status = totalAppended > 0 ? 201 : 200
ctx.body = {
  ok: true,
  appended: totalAppended,
  blueprints: results,
  ...(variantBlueprints.length > 0 ? { skippedVariantBlueprints: variantBlueprints.map((t) => t.id) } : {}),
}
}


/** GET /flywheel */
export async function getFlywheel(ctx: Context) {
const sets = listSets().map((meta) => getSet(meta.id)).filter((s): s is EvalSet => s !== undefined)
const runs = listRuns()
const readout = flywheelReadoutOf(sets, runs, listRemediations({}), listLedger())
const regression = sets.find((s) => s.name === REGRESSION_SET_NAME)
const latest = regression ? latestRunOfSet(runs, regression.id) : undefined
ctx.body = { ok: true, ...readout, gate: passRateGateOf(latest) }
}


/** GET /flywheel/fewshot */
export async function getFlywheelFewshot(ctx: Context) {
const query = typeof ctx.query.query === 'string' ? ctx.query.query : ''
if (!query.trim()) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['query 必填（当前任务的题面/派单语境）'] }
  return
}
const recall = recallFewshot(query, listLedger().distills)
ctx.body = { ok: true, ...recall }
}


/** POST /flywheel/merge-gate */
export async function postFlywheelMergeGate(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const manifest: ChangeManifest = {
  ...(body.prompt === true ? { prompt: true } : {}),
  ...(body.model === true ? { model: true } : {}),
  ...(body.orchestration === true ? { orchestration: true } : {}),
}
const sets = listSets().map((meta) => getSet(meta.id)).filter((s): s is EvalSet => s !== undefined)
const runs = listRuns()
const regression = sets.find((s) => s.name === REGRESSION_SET_NAME)
const latest = regression ? latestRunOfSet(runs, regression.id) : undefined
const result = mergeGateOf(manifest, latest)
ctx.body = { ok: true, ...result, ...(regression ? { setId: regression.id } : {}) }
}


/** POST /skill-grade */
export async function postSkillGrade(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const specText = typeof body.specText === 'string' ? body.specText : ''
if (!specText.trim()) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['specText 必填（含 §19 测试左移段的 spec 全文）'] }
  return
}
const config = loadEvalConfig()
const grades = await gradeSpecDesign(specText, { config })
// 可选基线对比：传 baselineRunId 时读同 runId 末次快照；缺快照/文件 → baseline:null（fail-open）
let baseline: ReturnType<typeof compareBaseline> = null
if (typeof body.baselineRunId === 'string' && body.baselineRunId.trim()) {
  const runId = body.baselineRunId.trim()
  baseline = compareBaseline(runId, grades)
  // 请求里显式 snapshot=true 时把本次判定落为该 runId 的新基线（写失败 fail-soft）
  if (body.snapshot === true) snapshotBaseline(runId, grades)
}
ctx.body = { ok: true, grades, ...(baseline ? { baseline } : {}) }
}


export const flywheelHandlers = {
  getRunsCompare,
  postRunsIdReflow,
  postBadcaseDistill,
  postBadcaseVariants,
  getFlywheel,
  getFlywheelFewshot,
  postFlywheelMergeGate,
  postSkillGrade,
}
