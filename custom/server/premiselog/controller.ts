// overlay/custom/server/premiselog/controller.ts
// 假设登记簿 REST（B 组）。挂载 /api/premiselog（补丁 751）。
//
// 定位：登记簿是业务对象（承重判断台账），影响面是读侧探测——不保存第二份业务真值。
// 探测根不可识别时一律报 unverifiable，绝不把「探测不到」说成「对象已失联」。
// 响应形状走 lib/http 的 ok/fail/bodyOf（K19 单一写法）。
import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Router from '@koa/router'
import type { Context } from 'koa'
import { appendGovEvent } from '../govbus/event-log'
import { bodyOf, created, fail, ok } from '../lib/http'
import {
  KIND_TITLES, checkScope, checkStatement, dueQueue, expireOverdue, impactOf, refute,
  reviseStatement, type PremiseKind, type PremiseStatus,
} from './premise-log'
import {
  createPremise, getPremise, listPremises, listReeval, putPremise, pushReeval, removePremise,
  resolveReeval,
} from './store'

export const premiseLogRoutes = new Router({ prefix: '/api/premiselog' })

function actorOf(ctx: Context): string {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return 'unknown'
  return user.username ?? (user.id !== undefined ? String(user.id) : 'unknown')
}

/**
 * 影响面探测根。
 *
 * 只有在根下同时看到 `custom/` 与 `docs/` 才认作本仓检出——否则返回 null，
 * 让全部锚落到「不可核验」。这是为了不把「跑在别的 cwd」误报成「一堆对象失联」。
 */
function probeRoot(): string | null {
  const explicit = (process.env.AISTUDIO_ROOT || process.env.OVERLAY_ROOT || '').trim()
  const candidate = explicit ? resolve(explicit) : process.cwd()
  try {
    if (existsSync(join(candidate, 'custom')) && existsSync(join(candidate, 'docs'))) return candidate
  } catch { /* 探测失败按未识别处理 */ }
  return null
}

function safeListDir(dir: string): Set<string> {
  try { return new Set(readdirSync(dir)) } catch { return new Set() }
}

function makeAnchorProbe(root: string | null): (anchor: string) => boolean {
  if (!root) return () => true   // 未识别根：全部按「不可核验」处理，不计 stale
  const specDir = join(root, 'docs', 'superpowers', 'specs')
  const serverDir = join(root, 'custom', 'server')
  const clientDir = join(root, 'custom', 'client')
  let specCache: Set<string> | null = null
  let serverCache: Set<string> | null = null
  let clientCache: Set<string> | null = null
  return (anchor: string) => {
    const a = anchor.trim()
    if (a.startsWith('/api/')) return true   // 端点无法静态核验：不报 stale
    specCache ??= safeListDir(specDir)
    serverCache ??= safeListDir(serverDir)
    clientCache ??= safeListDir(clientDir)
    if (a.endsWith('.md')) return specCache.has(a) || existsSync(join(specDir, a))
    return serverCache.has(a) || clientCache.has(a)
  }
}

premiseLogRoutes.get('/premises', (ctx) => {
  const status = typeof ctx.query.status === 'string' ? ctx.query.status as PremiseStatus : undefined
  const kind = typeof ctx.query.kind === 'string' ? ctx.query.kind as PremiseKind : undefined
  ok(ctx, {
    entries: listPremises({ ...(status ? { status } : {}), ...(kind ? { kind } : {}) }),
    kinds: Object.entries(KIND_TITLES).map(([k, t]) => ({ kind: k, title: t })),
  })
})

premiseLogRoutes.get('/premises/:id', (ctx) => {
  const entry = getPremise(ctx.params.id)
  if (!entry) {
    fail(ctx, 404, '假设不存在', { code: 'not-found' })
    return
  }
  ok(ctx, { entry })
})

premiseLogRoutes.post('/premises', (ctx) => {
  const body = bodyOf(ctx)
  const problems = [...checkStatement(body.statement), ...checkScope(body.scope)]
  if (typeof body.reviewAt !== 'number' || !Number.isFinite(body.reviewAt)) {
    problems.push('reviewAt 必填（复核日期，毫秒时间戳）')
  }
  if (!['market', 'tech', 'org', 'cost', 'compliance'].includes(String(body.kind))) {
    problems.push('kind 须为 market|tech|org|cost|compliance')
  }
  if (problems.length) {
    fail(ctx, 422, '假设未通过形式校验（可证伪性）', { code: 'invalid-premise', problems })
    return
  }
  const entry = createPremise({
    statement: String(body.statement),
    kind: body.kind as PremiseKind,
    scope: (body.scope as string[]).map(String),
    reviewAt: body.reviewAt as number,
    ...(body.confidence === 'high' || body.confidence === 'low' ? { confidence: body.confidence } : {}),
    createdBy: actorOf(ctx),
  })
  appendGovEvent({
    domain: 'system',
    severity: 'info',
    type: 'premise.registered',
    source: 'premiselog/controller',
    summary: `假设登记：${entry.statement.slice(0, 60)}（影响面 ${entry.scope.length} 项，复核 ${new Date(entry.reviewAt).toISOString().slice(0, 10)}）`,
    refs: { premiseId: entry.id },
  })
  created(ctx, { entry }, `/api/premiselog/premises/${entry.id}`)
})

premiseLogRoutes.put('/premises/:id', (ctx) => {
  const current = getPremise(ctx.params.id)
  if (!current) {
    fail(ctx, 404, '假设不存在', { code: 'not-found' })
    return
  }
  const body = bodyOf(ctx)
  let next = current

  if (body.statement !== undefined) {
    const problems = checkStatement(body.statement)
    if (problems.length) {
      fail(ctx, 422, '陈述未通过形式校验', { code: 'invalid-statement', problems })
      return
    }
    // 改写留历史（reviseStatement 内建 history 追加，不静默覆盖）
    next = reviseStatement(next, String(body.statement), actorOf(ctx), Date.now())
  }
  if (body.scope !== undefined) {
    const problems = checkScope(body.scope)
    if (problems.length) {
      fail(ctx, 422, '影响面未通过校验', { code: 'invalid-scope', problems })
      return
    }
    next = { ...next, scope: (body.scope as string[]).map(String), updatedAt: Date.now() }
  }
  if (typeof body.reviewAt === 'number' && Number.isFinite(body.reviewAt)) {
    // 复核完成：重新计时并回到成立中
    next = { ...next, reviewAt: body.reviewAt, status: 'hold', updatedAt: Date.now() }
  }
  if (body.confidence === 'high' || body.confidence === 'medium' || body.confidence === 'low') {
    next = { ...next, confidence: body.confidence, updatedAt: Date.now() }
  }
  ok(ctx, { entry: putPremise(next) })
})

premiseLogRoutes.delete('/premises/:id', (ctx) => {
  if (!removePremise(ctx.params.id)) {
    fail(ctx, 404, '假设不存在', { code: 'not-found' })
    return
  }
  ok(ctx)
})

premiseLogRoutes.get('/due', (ctx) => {
  const now = Date.now()
  ok(ctx, { now, rows: dueQueue(listPremises(), now) })
})

premiseLogRoutes.post('/expire', (ctx) => {
  const body = bodyOf(ctx)
  const graceDays = typeof body.graceDays === 'number' && body.graceDays >= 0 ? body.graceDays : 14
  const result = expireOverdue(listPremises(), Date.now(), graceDays)
  for (const id of result.expired) {
    const updated = result.premises.find((p) => p.id === id)
    if (updated) putPremise(updated)
  }
  ok(ctx, { expired: result.expired })
})

premiseLogRoutes.get('/premises/:id/impact', (ctx) => {
  const premise = getPremise(ctx.params.id)
  if (!premise) {
    fail(ctx, 404, '假设不存在', { code: 'not-found' })
    return
  }
  const root = probeRoot()
  ok(ctx, {
    report: impactOf(premise, makeAnchorProbe(root)),
    probe: root
      ? { root, recognized: true }
      : { root: null, recognized: false, detail: '未识别到仓检出根（需同时存在 custom/ 与 docs/）；全部锚按不可核验处理' },
  })
})

premiseLogRoutes.post('/premises/:id/refute', (ctx) => {
  const premise = getPremise(ctx.params.id)
  if (!premise) {
    fail(ctx, 404, '假设不存在', { code: 'not-found' })
    return
  }
  const body = bodyOf(ctx)
  let result: ReturnType<typeof refute>
  try {
    result = refute(premise, { evidence: String(body.evidence ?? ''), by: actorOf(ctx), now: Date.now() })
  } catch (e) {
    fail(ctx, 409, '推翻未获准', {
      code: 'refute-rejected',
      problems: [e instanceof Error ? e.message : String(e)],
    })
    return
  }
  const entry = putPremise(result.premise)
  const reeval = pushReeval(result.reeval)
  appendGovEvent({
    domain: 'system',
    severity: 'warn',
    type: 'premise.refuted',
    source: 'premiselog/controller',
    summary: `假设被推翻：${entry.statement.slice(0, 60)}（影响面 ${entry.scope.length} 项进重评）`,
    refs: { premiseId: entry.id, reevalId: reeval.id },
  })
  ok(ctx, { entry, reeval, impact: impactOf(entry, makeAnchorProbe(probeRoot())) })
})

premiseLogRoutes.get('/reeval', (ctx) => {
  const all = ctx.query.all === '1'
  ok(ctx, { items: listReeval(!all) })
})

premiseLogRoutes.post('/reeval/:id/resolve', (ctx) => {
  const body = bodyOf(ctx)
  const state = body.state === 'dismissed' ? 'dismissed' : 'done'
  const result = resolveReeval(ctx.params.id, state, {
    by: actorOf(ctx),
    note: typeof body.note === 'string' ? body.note : '',
  })
  if (result.ok) {
    ok(ctx, { item: result.item })
    return
  }
  fail(ctx, 409, '处置未获准', { code: 'resolve-rejected', problems: result.problems })
})
