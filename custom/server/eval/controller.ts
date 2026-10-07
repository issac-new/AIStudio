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
import { aggregateRun } from './aggregate'
import { runOutcomeCheck, listOutcomeVerifiers, type OutcomeRunContext } from './outcome'
import { runReplayEval, type SampleInput } from './runner'
import { runOracleCase, playwrightBrowser, type OracleRunRecord } from './uioracle'
import {
  appendIteration, appendOracleRun, createOracleCase, createSet, exportSet, getOracleCase,
  getRun, getSet, listIterations, listOracleCases, listOracleRuns, listRuns, listSets,
  recordHumanVerdict, reviseRubric, sealSet,
} from './store'
import { loadEvalConfig } from './types'
import type { EvalRun } from './types'

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

router.get('/sets/:id', async (ctx) => {
  const set = getSet(ctx.params.id)
  if (!set) {
    ctx.status = 404
    ctx.body = { ok: false, problems: ['评测集不存在'] }
    return
  }
  if (set.sealed) {
    ctx.body = { ok: true, sealed: true, set: { id: set.id, name: set.name, track: set.track, module: set.module, sealed: true, createdAt: set.createdAt, taskCount: set.tasks.length } }
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

// ---------- 辅助 ----------

router.get('/outcome-verifiers', async (ctx) => {
  ctx.body = { ok: true, verifiers: listOutcomeVerifiers() }
})

export const evalRoutes = router
