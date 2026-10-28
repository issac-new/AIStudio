// overlay/secaudit 域：REST 控制器（挂 /api/governance/secaudit，零新 patch）。
import Router from '@koa/router'
import type { Context } from 'koa'
import type { RuleResult } from './types'
import { ruleProblems } from './types'
import {
  createProject, finalizeRun, getProjectOrFail, listAllProjects, reviewRecord, runLedger, startRun, submitCandidate, verifyCandidate,
} from './engine'
import { surfaceCatalogForApi } from './exposed'
import { fail } from '../lib/http'

// 挂载契约（2026-10-22 走查批修正）：子路由**不带前缀**，由 governance-controller
// router.use('/secaudit') 嵌套挂载（sim-launch 同款先例）——@koa/router 嵌套下
// 绝对前缀子路由无论 use 带不带路径都会拼错前缀整族 404（上线即死实锚），
// 测试面（secaudit-http.test.ts）已改为生产同款嵌套拓扑守护。
export const secAuditRoutes = new Router()

// 问题清单是对象数组（fail 的 problems 选项只接 string[]），经 extra 原样透传保形；
// error 取首条 detail，供只读文案的调用方直接用。
function failProblems(ctx: Context, status: number, problems: Array<{ code: string; detail: string }>): void {
  fail(ctx, status, problems[0]?.detail ?? '请求未通过校验', { extra: { problems } })
}

/** 取失败分支的问题清单（TS 窄化助手：调用点已判 !result.ok）。 */
function problemsOf<T>(r: RuleResult<T>): Array<{ code: string; detail: string }> {
  return ruleProblems(r)
}

/** Koa 请求体（TS 类型缺口助手：body 由 @koa/bodyparser 挂载）。 */
function bodyOf(ctx: { request: unknown }): Record<string, unknown> {
  const req = ctx.request as { body?: unknown }
  return (req.body ?? {}) as Record<string, unknown>
}

secAuditRoutes.get('/catalog', (ctx) => {
  ctx.body = { ok: true, catalog: surfaceCatalogForApi() }
})

secAuditRoutes.get('/projects', (ctx) => {
  ctx.body = { ok: true, projects: listAllProjects() }
})

secAuditRoutes.post('/projects', (ctx) => {
  const b = bodyOf(ctx)
  const result = createProject({
    name: typeof b.name === 'string' ? b.name : '',
    target: (b.target ?? { kind: 'agent-deployment' }) as never,
    ...(Array.isArray(b.surfaces) ? { surfaces: b.surfaces as never } : {}),
    ...(typeof b.createdBy === 'string' ? { createdBy: b.createdBy } : {}),
  })
  if (!result.ok) {
    failProblems(ctx, 400, problemsOf(result))
    return
  }
  ctx.status = 201
  ctx.body = { ok: true, project: result.value }
})

secAuditRoutes.get('/projects/:id', (ctx) => {
  const result = getProjectOrFail(String(ctx.params.id ?? ''))
  if (!result.ok) {
    failProblems(ctx, 404, problemsOf(result))
    return
  }
  ctx.body = { ok: true, project: result.value }
})

secAuditRoutes.post('/projects/:id/runs', async (ctx) => {
  const result = await startRun(String(ctx.params.id ?? ''))
  if (!result.ok) {
    failProblems(ctx, 400, problemsOf(result))
    return
  }
  ctx.status = 201
  ctx.body = { ok: true, run: result.value }
})

secAuditRoutes.get('/projects/:id/runs/:runId', (ctx) => {
  const result = runLedger(String(ctx.params.id ?? ''), String(ctx.params.runId ?? ''))
  if (!result.ok) {
    failProblems(ctx, 404, problemsOf(result))
    return
  }
  ctx.body = { ok: true, run: result.value }
})

secAuditRoutes.post('/projects/:id/candidates', (ctx) => {
  const b = bodyOf(ctx)
  const result = submitCandidate(String(ctx.params.id ?? ''), {
    surfaceClass: String(b.surfaceClass ?? '') as never,
    title: typeof b.title === 'string' ? b.title : '',
    detail: typeof b.detail === 'string' ? b.detail : '',
    ...(typeof b.traceChain === 'string' ? { traceChain: b.traceChain } : {}),
    ...(typeof b.observation === 'string' ? { observation: b.observation } : {}),
    author: typeof b.author === 'string' ? b.author : '',
  })
  if (!result.ok) {
    failProblems(ctx, 400, problemsOf(result))
    return
  }
  ctx.status = 201
  ctx.body = { ok: true, finding: result.value }
})

secAuditRoutes.post('/projects/:id/findings/:fid/verify', (ctx) => {
  const b = bodyOf(ctx)
  const result = verifyCandidate(String(ctx.params.id ?? ''), String(ctx.params.fid ?? ''), {
    verifier: typeof b.verifier === 'string' ? b.verifier : '',
    status: (b.status ?? 'needs_validation') as never,
    ...(typeof b.refutation === 'string' ? { refutation: b.refutation } : {}),
    ...(typeof b.unknownFact === 'string' ? { unknownFact: b.unknownFact } : {}),
    ...(typeof b.severity === 'string' ? { severity: b.severity as never } : {}),
    ...(b.defenseInDepth === true ? { defenseInDepth: true } : {}),
  })
  if (!result.ok) {
    const problems = problemsOf(result)
    const self = problems.find((p) => p.code === 'self_verification_forbidden')
    failProblems(ctx, self ? 409 : 400, problems)
    return
  }
  ctx.body = { ok: true, finding: result.value }
})

secAuditRoutes.post('/projects/:id/findings/:fid/record-review', (ctx) => {
  const b = bodyOf(ctx)
  const result = reviewRecord(String(ctx.params.id ?? ''), String(ctx.params.fid ?? ''), {
    reviewer: typeof b.reviewer === 'string' ? b.reviewer : '',
    outcome: (b.outcome ?? 'verified') as never,
  })
  if (!result.ok) {
    const problems = problemsOf(result)
    const self = problems.find((p) => p.code === 'self_review_forbidden')
    failProblems(ctx, self ? 409 : 400, problems)
    return
  }
  ctx.body = { ok: true, finding: result.value }
})

secAuditRoutes.post('/projects/:id/runs/:runId/finalize', (ctx) => {
  const result = finalizeRun(String(ctx.params.id ?? ''), String(ctx.params.runId ?? ''))
  if (!result.ok) {
    const problems = problemsOf(result)
    const gate = problems.find((p) => p.code === 'record_review_incomplete')
    failProblems(ctx, gate ? 409 : 400, problems)
    return
  }
  ctx.body = { ok: true, ...result.value }
})

secAuditRoutes.get('/projects/:id/runs/:runId/report', (ctx) => {
  const got = getProjectOrFail(String(ctx.params.id ?? ''))
  if (!got.ok) {
    failProblems(ctx, 404, problemsOf(got))
    return
  }
  const run = got.value.runs.find((r) => r.runId === String(ctx.params.runId ?? ''))
  if (!run?.report) {
    failProblems(ctx, 404, [{ code: 'report_not_found', detail: '该运行未出报告' }])
    return
  }
  ctx.body = { ok: true, report: run.report }
})

