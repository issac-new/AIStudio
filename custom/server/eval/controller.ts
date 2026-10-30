/**
 * Eval Studio REST（/api/hermes/eval/*）——spec: 2026-10-07-eval-studio-design.md §4.8。
 *
 * GET  /api/hermes/eval/sets                       评测集元数据列表（密封契约：永不携带题目内容）
 * POST /api/hermes/eval/sets                       建集（校验：risk 断言 expect 必须 'no' 等）
 * GET  /api/hermes/eval/sets/:id                   详情（密封集只回元数据）
 * POST /api/hermes/eval/sets/:id/seal              密封（此后内容不出库、改题须 Rubric Loop 留痕）
 * GET  /api/hermes/eval/sets/:id/export            导出（密封集拒绝）
 * POST /api/hermes/eval/sets/:id/dimensions        能力维度批量标注/种子族回填 {assignments?|backfill:'redteam-seed'}
 * POST /api/hermes/eval/sets/:id/tasks/:taskId/rubric  Rubric 修订（密封集须带 iterationId 留痕）
 * POST /api/hermes/eval/runs                       发起回放判分运行 {setId, samples, target?, crossValidate?}
 * GET  /api/hermes/eval/runs?setId=                运行摘要列表（不含 attempt 明细）
 * GET  /api/hermes/eval/runs/:id                   运行报告（密封集只回聚合——防探测：逐条对错可被重试探测）
 * GET  /api/hermes/eval/runs/compare?base=&head=   A/B 对比（同集两 run 逐任务翻转表+读数 delta；密封集拒绝）
 * POST /api/hermes/eval/runs/:id/reflow            坏例回流（失败任务一键转回归样本库，带溯源；幂等）
 * POST /api/hermes/eval/badcase/distill            失败样本五要素提炼入回归库（根因/禁忌动作/步数红线；dryRun 可预览；
 *                                                   judgeAttribution=true 附裁判端归因复核，四态入台账不改主判）
 * POST /api/hermes/eval/badcase/variants           坏例蓝本五维反事实变体扩产（默认 10 条，幂等；变体不可再当蓝本）
 * GET  /api/hermes/eval/flywheel                   数据飞轮读数（转化漏斗/根因聚类/坏例通过率退化门）
 * GET  /api/hermes/eval/flywheel/fewshot?query=    Few-shot 记忆按相似度召回（台账三元组；无相关历史=空）
 * POST /api/hermes/eval/flywheel/merge-gate        合入门试算（Prompt/模型/编排三类变更 → 回归库门 fail-closed）
 * POST /api/hermes/eval/runs/:id/verdicts          人工仲裁（冲突/unknown 断言的最终裁决）
 * POST /api/hermes/eval/runs/:id/attributions      归因双 Loop（finding=judge_wrong/rubric_ambiguous → Rubric Loop；
 *                                                   route=agent → 指回 review 域既有流程）
 * GET  /api/hermes/eval/runs/:id/iterations        该运行的 Rubric Loop 账本
 *
 * 归属：单租户信任模型（与 evidence 域同口径），写操作记 actor 痕。
 * 挂载：B 类 patch（M2 落），在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import { aggregateRun, compareRuns } from './aggregate'
import { blindTrimmedMean } from './blind-review'
import { coverageOfSets } from './coverage'
import { evaluatorAuditOf } from './evaluators'
import { judgeHumanAgreement } from './human-agreement'
import { buildRegistryView, summarizeConsumption } from './metric-registry'
import { runOutcomeCheck, listOutcomeVerifiers, type OutcomeRunContext } from './outcome'
import { runReplayEval, type SampleInput } from './runner'
import { computeE2eVerdict, e2eVerdictLine } from './e2e-verdict'
import { sampleFromTrace, sampleSpanFromTrace } from './trace-sampler'
import { reflowTraceToSet } from './trace-reflow'
import { runOracleCase, playwrightBrowser, type OracleRunRecord } from './uioracle'
import {
  appendIteration, appendOracleRun, appendTasksToSet, auditSnapshot, createOracleCase, createRemediation, createSet, exportSet,
  getOracleCase, getRemediation, getRun, getSet, getSetRevision, labelSetDimensions, listIterations, listOracleCases, listOracleRuns,
  listRemediations, listRuns, listSetRevisions, listSets, recordHumanVerdict, recordLiveEvidence,
  reflowTaskToSet, REGRESSION_SET_NAME, reviseRubric, sealSet, verifyRemediation,
} from './store'
import { countRuns as countRedteamRuns } from '../redteam/store'
import { mountRedteam } from '../redteam/routes'
import { loadEvalConfig } from './types'
import { synthesizeProbesForTask } from './synthesize'
import { ENTERPRISE_AXES, ENTERPRISE_SET_NAME, axesCoverage, buildEnterpriseSeedTasks } from './enterprise-seed'
import type { EvalRun, EvalSet, EvalTask, LiveEvidence } from './types'
import { buildRedteamSeedTasks, REDTEAM_SET_NAME, REDTEAM_VECTORS } from './redteam-seed'
import { buildRedteamVariants } from './redteam-variants'
import { distillBadCase, judgeAttributionOf, ROOT_CAUSE_LABELS } from './badcase-distill'
import { buildBadCaseVariants, CF_DIMENSIONS } from './badcase-variants'
import { flywheelReadoutOf, latestRunOfSet, listLedger, mergeGateOf, passRateGateOf, recordDistill, recordVariantBatch, type ChangeManifest } from './flywheel'
import { recallFewshot } from './fewshot'
import { evaluateReleaseHold } from './release-hold'
import { buildBehaviorSignals } from './behavior-signals'
import { businessSummaryOf } from './business-summary'
import { collectObsSignals } from '../obssignals/collect'
import { fail } from '../lib/http'

const router = new Router({ prefix: '/api/hermes/eval' })

function actorOf(ctx: Context): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

function outcomeContext(): OutcomeRunContext {
  const roots = process.env.EVAL_OUTCOME_ALLOWED_ROOTS?.split(',').map((s) => s.trim()).filter(Boolean)
  const baseUrl = process.env.EVAL_KANBAN_BASE_URL?.trim()
  const token = process.env.EVAL_KANBAN_TOKEN?.trim()
  const board = process.env.EVAL_KANBAN_BOARD?.trim()
  return {
    runStartedAt: Date.now(),
    ...(roots && roots.length ? { allowedRoots: roots } : {}),
    ...(baseUrl ? { kanban: { baseUrl, ...(token ? { token } : {}), ...(board ? { board } : {}) } } : {}),
  }
}

function runSummary(run: EvalRun) {
  return {
    id: run.id,
    setId: run.setId,
    ...(run.setHash ? { setHash: run.setHash } : {}),
    ...(run.setRevision !== undefined ? { setRevision: run.setRevision } : {}),
    target: run.target,
    k: run.k,
    status: run.status,
    ...(run.evidenceMode ? { evidenceMode: run.evidenceMode } : {}),
    createdAt: run.createdAt,
    createdBy: run.createdBy,
    note: run.note,
    aggregates: run.aggregates,
  }
}

/** 密封契约：集摘要永不携带题目内容（写端点同样适用）。 */
function setSummary(set: EvalSet) {
  return {
    id: set.id,
    name: set.name,
    track: set.track,
    module: set.module,
    sealed: true,
    contentHash: set.contentHash,
    revision: set.revision,
    createdAt: set.createdAt,
    taskCount: set.tasks.length,
  }
}

/** 按运行钉住的版本取考卷；历史运行无版本时回落当前集（由指纹门另判）。 */
function setForRun(run: EvalRun): EvalSet | undefined {
  const current = getSet(run.setId)
  if (!current) return undefined
  if (run.setRevision !== undefined) {
    const frozen = getSetRevision(run.setId, run.setRevision)
    if (frozen) {
      return { ...current, revision: frozen.revision, contentHash: frozen.contentHash, tasks: frozen.tasks }
    }
  }
  return current
}

// ---------- 评测集 ----------

// 真实轨迹采样（2026-10-18 残余项④）：把 L2 trace 转成 Evidence；不自动建集。
router.post('/sample-from-trace', async (ctx) => {
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
})

// span 级采样（2026-10-19 观测层轮）：评估下沉 observation 级——单 LLM 调用
// （及其子工具调用）或单工具 span → Evidence，spanRef=api_request_id/tool_call_id。
router.post('/sample-span-from-trace', async (ctx) => {
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
})

// 生产失败轨迹 → 回归样本库（人工确认任务定义 + traceHash 防预览漂移）。
router.post('/reflow-from-trace', async (ctx) => {
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
})

router.get('/sets', async (ctx) => {
  ctx.body = { ok: true, sets: listSets() }
})

router.post('/sets', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const result = createSet(body as never, actorOf(ctx))
  if (!result.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: result.problems }
    return
  }
  ctx.status = 201
  ctx.body = { ok: true, set: result.set }
})

// 红队种子库（百度轮 B5：红队四步只落第一步「攻击向量库」种子形态；自动生成挂账）。
// 幂等：同名集已存在即返回既有（existed=true），不重复建。
router.post('/sets/redteam-seed', async (ctx) => {
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
})

// 红队变体扩产（B6：规则改写器 24 种子 → 114 变体；按 id 去重幂等追加进种子库）。
router.post('/sets/redteam-variants', async (ctx) => {
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
})

// 企业级约束种子库（2026-10-23 挂账清偿 G3）：三轴（权限边界/长周期/合规）×3 任务，
// 幂等建集（红队种子同款）；响应附三轴覆盖读数（按显式映射表，缺轴如实列 gap）。
router.post('/sets/enterprise-seed', async (ctx) => {
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
})

router.get('/sets/:id', async (ctx) => {
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
  ctx.body = { ok: true, set }
})

router.post('/sets/:id/seal', async (ctx) => {
  const result = sealSet(ctx.params.id, actorOf(ctx))
  if (!result.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: result.problems }
    return
  }
  ctx.body = { ok: true }
})

router.get('/sets/:id/export', async (ctx) => {
  const result = exportSet(ctx.params.id)
  if (!result.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: result.problems }
    return
  }
  ctx.body = { ok: true, set: result.set }
})

// 能力维度标注通道（2026-10-30 run23 复盘）：批量给集内任务打七维或显式 'unclassified'。
// 两条用法：assignments 逐题显式标注（含 null 清除）；backfill='redteam-seed' 按产品登记的
// 向量映射批量回填存量集（只补未标注项，不覆盖已有标注）。写入走版本快照（revision+1）。
router.post('/sets/:id/dimensions', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const assignments = body.assignments
  if (assignments !== undefined && (typeof assignments !== 'object' || assignments === null || Array.isArray(assignments))) {
    ctx.status = 400
    ctx.body = { ok: false, problems: ['assignments 须为 {taskId: dimension|null} 对象'] }
    return
  }
  const backfill = body.backfill === undefined ? undefined : String(body.backfill)
  if (backfill !== undefined && backfill !== 'redteam-seed') {
    ctx.status = 400
    ctx.body = { ok: false, problems: [`backfill 只接受 'redteam-seed'（收到：${backfill}）`] }
    return
  }
  const result = labelSetDimensions(ctx.params.id, {
    ...(assignments ? { assignments: assignments as Record<string, EvalTask['dimension'] | null> } : {}),
    ...(backfill ? { backfill: backfill as 'redteam-seed' } : {}),
  })
  if (!result.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: result.problems }
    return
  }
  ctx.body = { ok: true, ...result.result, actor: actorOf(ctx) ?? null }
})

router.post('/sets/:id/tasks/:taskId/rubric', async (ctx) => {
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
})

// 合成探针提案（2026-10-23 HarnessPro 挂账清偿 G1）：判定端为指定任务提案 S0 规则
// 草稿（六种白名单 kind，结构化校验）；不自动改卷——人工经上方 rubric 修订端点采纳。
// fail-open：判定端离线 → ok:false 如实返回。密封集拒绝（内容不出面）。
router.post('/sets/:id/tasks/:taskId/synthesize', async (ctx) => {
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
})

// ---------- 考卷版本快照（收口轮） ----------

router.get('/sets/:id/revisions', async (ctx) => {
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
})

router.get('/sets/:id/revisions/:revision', async (ctx) => {
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
  ctx.body = { ok: true, revision: frozen }
})

// ---------- 运行 ----------

// POST /runs 可选参数 stabilityRetest（2-10）：同输入重复判定轮数，读数进
// aggregates.outputStability（京东「稳定性也是指标」）。成本随轮数线性放大——
// 2-3 轮够出翻转率，超出拒绝（防误把整批预算烧在复测上）。
function parseStabilityRetest(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined
  const n = Math.floor(raw)
  if (n < 2 || n > 10) return undefined
  return n
}

router.post('/runs', async (ctx) => {
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
})

router.get('/runs', async (ctx) => {
  const setId = typeof ctx.query.setId === 'string' ? ctx.query.setId : undefined
  ctx.body = { ok: true, runs: listRuns(setId).map(runSummary) }
})

// 同卷复评（收口轮）：按基准运行钉住的版本快照判分，考卷改版即拒绝。
router.post('/runs/:id/rerun', async (ctx) => {
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
})

// ---------- 处置单（收口轮：失败样本 → 修复 → 同卷复评 → 机械关闭） ----------

router.post('/runs/:id/remediations', async (ctx) => {
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
})

router.get('/runs/:id/remediations', async (ctx) => {
  ctx.body = { ok: true, remediations: listRemediations({ runId: ctx.params.id }) }
})

router.get('/remediations', async (ctx) => {
  const runId = typeof ctx.query.runId === 'string' ? ctx.query.runId : undefined
  const setId = typeof ctx.query.setId === 'string' ? ctx.query.setId : undefined
  const status = typeof ctx.query.status === 'string' ? ctx.query.status : undefined
  ctx.body = { ok: true, remediations: listRemediations({ runId, setId, status }) }
})

router.post('/remediations/:id/verify', async (ctx) => {
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
})

// A/B 对比（腾讯启示⑩）：字面路由须先于 /runs/:id 注册（同前缀按注册序匹配）
router.get('/runs/compare', async (ctx) => {
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
})

// 坏例回流（腾讯 §03：线上坏例转回归样本，防问题回潮）
router.post('/runs/:id/reflow', async (ctx) => {
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
})

// ---------- 数据飞轮（2026-10-25 吸收轮：坏例→资产→通过率门） ----------

/**
 * POST /badcase/distill {runId, taskId, sampleIdx, targetSetId?, dryRun?}
 * 失败样本 → 五要素提炼（根因/禁忌动作/步数红线）→ 回归任务入回归库（幂等）。
 * dryRun=true 只回提案不落库（入库前抽样质检卡点的人工预览通道）。
 */
router.post('/badcase/distill', async (ctx) => {
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
})

/**
 * POST /badcase/variants {taskId?, allFromRegression?, dims?, targetSetId?}
 * 坏例蓝本 → 五维反事实变体（默认 10 条）幂等追加。变体不可再当蓝本（防指数膨胀）。
 */
router.post('/badcase/variants', async (ctx) => {
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
})

/**
 * GET /flywheel —— 飞轮读数：转化漏斗（错误转化率）+ 根因聚类 + 坏例通过率退化门。
 * 全派生 fail-soft：无数据 null/no_data，不造数。
 */
router.get('/flywheel', async (ctx) => {
  const sets = listSets().map((meta) => getSet(meta.id)).filter((s): s is EvalSet => s !== undefined)
  const runs = listRuns()
  const readout = flywheelReadoutOf(sets, runs, listRemediations({}), listLedger())
  const regression = sets.find((s) => s.name === REGRESSION_SET_NAME)
  const latest = regression ? latestRunOfSet(runs, regression.id) : undefined
  ctx.body = { ok: true, ...readout, gate: passRateGateOf(latest) }
})

/**
 * GET /flywheel/fewshot?query= —— Few-shot 记忆按相似度召回（round 2 挂账 1）：
 * 飞轮台账三元组（触发场景/错误示范/正确示范）按词面相似度召回，超阈值才有返回，
 * 无相关历史=空（Prompt 保持干净）。阈值 FLYWHEEL_FEWSHOT_MIN_SIM 可调（D12）。
 */
router.get('/flywheel/fewshot', async (ctx) => {
  const query = typeof ctx.query.query === 'string' ? ctx.query.query : ''
  if (!query.trim()) {
    ctx.status = 400
    ctx.body = { ok: false, problems: ['query 必填（当前任务的题面/派单语境）'] }
    return
  }
  const recall = recallFewshot(query, listLedger().distills)
  ctx.body = { ok: true, ...recall }
})

/**
 * POST /flywheel/merge-gate {prompt?, model?, orchestration?} —— 合入门试算
 * （round 2 挂账 2）：三类变更任一为真 → 回归库最新 run 必须过通过率门且无
 * riskVeto，否则 blocked（fail-closed）。reviewgov 案例可显式携带该读数接入
 * mergeReadiness（regressionGate 字段）。
 */
router.post('/flywheel/merge-gate', async (ctx) => {
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
})

router.get('/runs/:id', async (ctx) => {
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
})

router.post('/runs/:id/verdicts', async (ctx) => {
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
})

// ---------- 裁判×人工一致率校准（2026-10-21 三号调研：κ 而非裸一致率） ----------

router.get('/runs/:id/agreement', async (ctx) => {
  const run = getRun(ctx.params.id)
  if (!run) {
    ctx.status = 404
    ctx.body = { ok: false, problems: ['运行不存在'] }
    return
  }
  ctx.body = { ok: true, agreement: judgeHumanAgreement(run.attempts) }
})

// ---------- 指标退化禁发闸（候选 run vs 基线 run=最近稳定版） ----------

router.get('/runs/:id/release-hold', async (ctx) => {
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
})

// ---------- 主观盲测面板（纯函数读数面；分数不回写判词） ----------

router.post('/blind-reviews/trimmed-mean', async (ctx) => {
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
})

// ---------- 评估器三角互证审计（百度范式 §3） ----------

router.get('/runs/:id/evaluators', async (ctx) => {
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
})

// ---------- 归因一次点击：按 sessionId 重读证据（百度范式 §5） ----------

router.get('/runs/:id/evidence', async (ctx) => {
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
})

// 线上证据回填（B7）：压测/分档实测入账，门禁 qps/分档项即时转真判并重聚合。
router.post('/runs/:id/live-evidence', async (ctx) => {
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
})

// ---------- 归因双 Loop ----------

router.post('/runs/:id/attributions', async (ctx) => {
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
})

router.get('/runs/:id/iterations', async (ctx) => {
  ctx.body = { ok: true, iterations: listIterations(ctx.params.id) }
})

router.get('/iterations', async (ctx) => {
  ctx.body = { ok: true, iterations: listIterations() }
})

// ---------- UI Oracle（M3：KuiTest 两阶段「预测→验证」） ----------

router.get('/oracle/cases', async (ctx) => {
  ctx.body = { ok: true, cases: listOracleCases() }
})

router.post('/oracle/cases', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const result = createOracleCase(body as never, actorOf(ctx))
  if (!result.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: result.problems }
    return
  }
  ctx.status = 201
  ctx.body = { ok: true, case: result.case }
})

router.post('/oracle/cases/:id/run', async (ctx) => {
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
})

router.get('/oracle/runs', async (ctx) => {
  const caseId = typeof ctx.query.caseId === 'string' ? ctx.query.caseId : undefined
  ctx.body = { ok: true, runs: listOracleRuns(caseId) }
})

// ---------- 指标注册表与消费证据（百度范式 §4：评估器即回报函数） ----------

router.get('/metric-registry', async (ctx) => {
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
})

// ---------- 辅助 ----------

router.get('/outcome-verifiers', async (ctx) => {
  ctx.body = { ok: true, verifiers: listOutcomeVerifiers() }
})

// ---------- 行为信号面（京东吸收轮·立项批：真实使用行为当评测信号） ----------

// 观测窗口合计 → 供评测消费的行为信号行；采集链路故障 fail-soft（available=false 如实缺席）。
router.get('/behavior-signals', async (ctx) => {
  const days = Math.min(30, Math.max(1, Number(ctx.query.days) || 7))
  const collected = collectObsSignals(days)
  if (!collected.report.available) {
    ctx.body = { ok: true, available: false, days, reason: collected.report.notes.join('；') || '观测数据不可用', signals: null }
    return
  }
  ctx.body = { ok: true, available: true, signals: buildBehaviorSignals(collected.report.totals, days) }
})

// ---------- 经营语言摘要（京东吸收轮·立项批：评测结论翻译成决策者三句话） ----------

router.get('/runs/:id/business-summary', async (ctx) => {
  const run = getRun(ctx.params.id)
  if (!run) {
    ctx.status = 404
    ctx.body = { ok: false, problems: ['运行不存在'] }
    return
  }
  ctx.body = { ok: true, summary: businessSummaryOf(run) }
})

// 红队路由挂在同一前缀下（/api/hermes/eval/redteam/*），零新增 patch。
mountRedteam(router)

// 全流程推演评测门禁判据（融合批三）：EVAL-GATE PASS/GAP/FAIL 的单一实现——
// simharness mx-eval-summary.py 判据面退役，驱动只送采集件+映射退出码（0/2/1）。
// 输入=驱动已采集的产品端点响应件（metric-registry/eval-run/eval-set/evaluators/
// redteam-run），阈值 env 同源（EVAL_MAX_UNKNOWN/EVAL_REDTEAM_FP_MAX 可覆盖）。
router.post('/e2e-verdict', (ctx) => {
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
})


export const evalRoutes = router
