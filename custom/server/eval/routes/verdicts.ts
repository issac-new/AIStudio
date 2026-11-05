// eval 运行详情/人工仲裁路由处理器（v0.4 单文件体量治理：第二批拆分，行为不变）。
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

import { actorOf, outcomeContext, runSummary, setForRun, parseStabilityRetest } from './shared.js'

/** GET /runs/:id */
export async function getRunsId(ctx: Context) {
const run = getRun(ctx.params.id)
if (!run) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
const set = getSet(run.setId)
ctx.body = set?.sealed
  ? { ok: true, run: runSummary(run) }
  : { ok: true, run }
}


/** POST /runs/:id/verdicts */
export async function postRunsIdVerdicts(ctx: Context) {
const body = (ctx.request.body ?? {}) as Record<string, unknown>
const value = body.value === 'yes' || body.value === 'no' ? body.value : null
const { taskId, assertionId } = body
const sampleIdx = Number(body.sampleIdx)
if (!value || typeof taskId !== 'string' || typeof assertionId !== 'string' || !Number.isInteger(sampleIdx) || sampleIdx < 1) {
  ctx.status = 400
  ctx.body = { ok: false, problems: ['taskId/sampleIdx/assertionId/value(yes|no) 必填'] }
  return
}
const config = loadEvalConfig()
const run = getRun(ctx.params.id)
const set = run ? setForRun(run) : undefined
if (!run || !set) {
  ctx.status = 404
  ctx.body = { ok: false, problems: ['运行不存在'] }
  return
}
const result = recordHumanVerdict(ctx.params.id, taskId, sampleIdx, assertionId, value, (r) => aggregateRun(set, r, config))
if (!result.ok) {
  ctx.status = 400
  ctx.body = { ok: false, problems: result.problems }
  return
}
ctx.body = { ok: true, run: set.sealed ? runSummary(result.run) : result.run }
}


export const verdictsHandlers = {
  getRunsId,
  postRunsIdVerdicts,
}
