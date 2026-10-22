// overlay/trust 域 REST：挂在 /api/harness/trust 之下（由 harness-controller 子路由挂载，
// 不新增 bootstrap 补丁）。
//
// 写面沿用治理面约定：有认证主体时须 super_admin；单用户无鉴权部署放行。
// 关键约束：admit 只接收"完成提议"，请求体里的 state/result 字段一律不读。
import Router from '@koa/router'
import { IntegrityError } from './integrity'
import {
  ServiceError, addClaims, admit, beginAudit, getCase, ledgerTail, ledgerVerification,
  listCaseSummaries, openCase, overview, recordAudits, verifyCheckpoint, writeCheckpoint,
} from './service'
import { checkSurfaceChain } from './surfaces'
import type { TrustCase } from './types'

const router = new Router()

type Ctx = {
  state?: unknown
  status?: number
  body?: unknown
  params: Record<string, string>
  query: Record<string, unknown>
  // body 由 bootstrap 的 body parser 挂载，Koa 的 Request 类型不含它。
  request: any
}

function writeDenied(ctx: Ctx): boolean {
  const user = (ctx.state as { user?: { role?: string } } | undefined)?.user
  if (user && user.role !== 'super_admin') {
    ctx.status = 403
    ctx.body = { ok: false, detail: '治理写面须 super_admin 权限' }
    return true
  }
  return false
}

function bodyOf(ctx: Ctx): Record<string, unknown> {
  const b = ctx.request.body
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {}
}

function actorOf(ctx: Ctx, body: Record<string, unknown>): string {
  const explicit = typeof body.actor === 'string' ? body.actor.trim() : ''
  if (explicit) return explicit
  const user = (ctx.state as { user?: Record<string, unknown> } | undefined)?.user
  const fromUser = user && (typeof user.username === 'string' ? user.username : typeof user.name === 'string' ? user.name : '')
  return fromUser || 'operator'
}

function fail(ctx: Ctx, e: unknown): void {
  if (e instanceof ServiceError) {
    ctx.status = e.status
    ctx.body = { ok: false, error: e.message, ...(e.detail != null ? { detail: e.detail } : {}) }
    return
  }
  if (e instanceof IntegrityError) {
    ctx.status = e.code === 'root_not_allowed' ? 403 : 400
    ctx.body = { ok: false, error: e.message, code: e.code }
    return
  }
  ctx.status = 500
  ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
}

/** 读面只返回相对路径与摘要；清单条目只在服务端用于比对，不随案件返回。 */
function caseView(c: TrustCase): TrustCase {
  return c
}

router.get('/overview', async (ctx) => {
  try {
    ctx.body = { ok: true, ...overview() }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/surfaces', async (ctx) => {
  try {
    ctx.body = { ok: true, ...checkSurfaceChain() }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/ledger', async (ctx) => {
  try {
    ctx.body = { ok: true, events: ledgerTail(ctx.query.limit) }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/ledger/verify', async (ctx) => {
  try {
    ctx.body = { ok: true, ...ledgerVerification() }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/cases', async (ctx) => {
  try {
    ctx.body = { ok: true, cases: listCaseSummaries() }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/cases', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    const c = openCase({
      caseId: b.caseId,
      title: b.title,
      runId: b.runId,
      workspaceRoot: b.workspaceRoot,
      claims: b.claims,
      actor: actorOf(ctx, b),
    })
    ctx.status = 201
    ctx.body = { ok: true, case: caseView(c) }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/cases/:id', async (ctx) => {
  try {
    ctx.body = { ok: true, case: caseView(getCase(ctx.params.id)) }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/cases/:id/claims', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    const added = addClaims(ctx.params.id, b.claims, actorOf(ctx, b))
    ctx.status = 201
    ctx.body = { ok: true, added }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/cases/:id/begin-audit', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    ctx.body = { ok: true, ...beginAudit(ctx.params.id, actorOf(ctx, b), b) }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/cases/:id/audits', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    const audits = recordAudits(ctx.params.id, b.audits, actorOf(ctx, b))
    ctx.status = 201
    ctx.body = { ok: true, audits }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/cases/:id/admit', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    const res = admit(ctx.params.id, actorOf(ctx, b), b)
    // 准入结论本身用 200 返回；是否准入看 decision.result，不靠 HTTP 状态区分。
    ctx.body = { ok: true, ...res }
  } catch (e) {
    fail(ctx, e)
  }
})

router.post('/cases/:id/checkpoint', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = bodyOf(ctx)
  try {
    const checkpoint = writeCheckpoint(ctx.params.id, actorOf(ctx, b), b)
    ctx.status = 201
    ctx.body = { ok: true, checkpoint }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/cases/:id/checkpoints', async (ctx) => {
  try {
    ctx.body = { ok: true, checkpoints: getCase(ctx.params.id).checkpoints }
  } catch (e) {
    fail(ctx, e)
  }
})

router.get('/cases/:id/checkpoints/:checkpointId/verify', async (ctx) => {
  try {
    const id = ctx.params.checkpointId === 'latest' ? undefined : ctx.params.checkpointId
    ctx.body = { ok: true, ...verifyCheckpoint(ctx.params.id, id) }
  } catch (e) {
    fail(ctx, e)
  }
})

export default router
