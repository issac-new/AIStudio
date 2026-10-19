/**
 * Eval Studio REST（/api/hermes/eval/*）——spec: 2026-10-07-eval-studio-design.md §4.8。
 *
 * GET  /api/hermes/eval/sets                       评测集元数据列表（密封契约：永不携带题目内容）
 * POST /api/hermes/eval/sets                       建集（校验：risk 断言 expect 必须 'no' 等）
 * GET  /api/hermes/eval/sets/:id                   详情（密封集只回元数据）
 * POST /api/hermes/eval/sets/:id/seal              密封（此后内容不出库、改题须 Rubric Loop 留痕）
 * GET  /api/hermes/eval/sets/:id/export            导出（密封集拒绝）
 * POST /api/hermes/eval/sets/:id/tasks/:taskId/rubric  Rubric 修订（密封集须带 iterationId 留痕）
 * POST /api/hermes/eval/runs                       发起回放判分运行 {setId, samples, target?, crossValidate?}
 * GET  /api/hermes/eval/runs?setId=                运行摘要列表（不含 attempt 明细）
 * GET  /api/hermes/eval/runs/:id                   运行报告（密封集只回聚合——防探测：逐条对错可被重试探测）
 * GET  /api/hermes/eval/runs/compare?base=&head=   A/B 对比（同集两 run 逐任务翻转表+读数 delta；密封集拒绝）
 * POST /api/hermes/eval/runs/:id/reflow            坏例回流（失败任务一键转回归样本库，带溯源；幂等）
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
import { coverageOfSets } from './coverage'
import { evaluatorAuditOf } from './evaluators'
import { buildRegistryView, summarizeConsumption } from './metric-registry'
import { runOutcomeCheck, listOutcomeVerifiers, type OutcomeRunContext } from './outcome'
import { runReplayEval, type SampleInput } from './runner'
import { sampleFromTrace } from './trace-sampler'
import { runOracleCase, playwrightBrowser, type OracleRunRecord } from './uioracle'
import {
  appendIteration, appendOracleRun, appendTasksToSet, auditSnapshot, createOracleCase, createSet, exportSet,
  getOracleCase, getRun, getSet, listIterations, listOracleCases, listOracleRuns, listRuns,
  listSets, recordHumanVerdict, recordLiveEvidence, reflowTaskToSet, reviseRubric, sealSet,
} from './store'
import { countRuns as countRedteamRuns } from '../redteam/store'
import { mountRedteam } from '../redteam/routes'
import { loadEvalConfig } from './types'
import type { EvalRun, LiveEvidence } from './types'
import { buildRedteamSeedTasks, REDTEAM_SET_NAME, REDTEAM_VECTORS } from './redteam-seed'
import { buildRedteamVariants } from './redteam-variants'

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
    target: run.target,
    k: run.k,
    status: run.status,
    createdAt: run.createdAt,
    createdBy: run.createdBy,
    note: run.note,
    aggregates: run.aggregates,
  }
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
  ctx.body = { ok: true, set: result.set }
})

// ---------- 运行 ----------

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
  const result = await runReplayEval(
    {
      setId,
      samples: rawSamples,
      target,
      crossValidate: body.crossValidate === true,
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
  const set = getSet(base.setId)
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
  const set = run ? getSet(run.setId) : undefined
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
  ctx.body = { ok: true, run: result.run }
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
  const sample = sampleFromTrace(attempt.sessionId)
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
  const set = getRun(ctx.params.id) ? getSet(getRun(ctx.params.id)!.setId) : undefined
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

// 红队路由挂在同一前缀下（/api/hermes/eval/redteam/*），零新增 patch。
mountRedteam(router)


export const evalRoutes = router
