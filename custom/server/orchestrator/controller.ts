// custom/server/orchestrator/controller.ts
// 编排域 REST（2026-10-31 A+B 批）。
// 前缀 /api/orchestrator：事件摄入、线程订阅、决策与凭证、按源准入、策略版本、看板桥手动 tick。
// 写操作统一非 2xx 失败；读模型降级用 200 + ok:true + available:false。
import Router from '@koa/router'
import { requireAuthenticatedActor } from '../approval-inbox/human-gate'
import { fail, ok } from '../lib/http'
import { defaultCells, getAdmission, listAdmissions, normalizeAdmission, setAdmission } from './admission'
import { ingestTrigger } from './ingest'
import { bridgeAll, kanbanDbPaths } from './kanban-bridge'
import { activeMandateFor, issueMandate, revalidate, revoke } from './mandate'
import { currentPolicyVersion } from './policy-version'
import { listAssignments, listDecisions, listMandates, listThreads, listTriggers } from './store'
import { markRead, pendingFor, subscribe, subscriptionsOf } from './thread'
import { POLICY_KINDS, SOURCE_KINDS, TRIGGER_STATUSES, type PolicyKind, type SourceKind, type TriggerStatus } from './types'

const router = new Router({ prefix: '/api/orchestrator' })

function actorOf(ctx: { state?: unknown }): { username: string; role: string } | null {
  try {
    const a = requireAuthenticatedActor(ctx as never)
    return { username: a.username, role: a.role }
  } catch {
    return null
  }
}

/** 只读端点不做身份拦截（与既有治理读模型一致）；写端点必须认证。 */
function requireActorOrFail(ctx: Parameters<typeof fail>[0]): { username: string; role: string } | null {
  const actor = actorOf(ctx)
  if (!actor) {
    fail(ctx, 401, '关键写操作需要认证用户', { code: 'authenticated_actor_required' })
    return null
  }
  return actor
}

router.get('/health', async ctx => {
  ok(ctx, {
    available: true,
    policyVersions: Object.fromEntries(POLICY_KINDS.map(k => [k, currentPolicyVersion(k)])),
    kanbanDbs: kanbanDbPaths(),
  })
})

router.get('/triggers', async ctx => {
  const limit = Number(ctx.query.limit ?? 50)
  const statusRaw = String(ctx.query.status ?? '').trim()
  const status = TRIGGER_STATUSES.includes(statusRaw as TriggerStatus) ? statusRaw as TriggerStatus : undefined
  ok(ctx, { triggers: listTriggers(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 50, status) })
})

router.post('/triggers', async ctx => {
  const actor = requireActorOrFail(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const sourceKind = String(body.sourceKind ?? '')
  if (!SOURCE_KINDS.includes(sourceKind as SourceKind)) {
    fail(ctx, 400, `sourceKind 须为 ${SOURCE_KINDS.join('|')}`, { code: 'invalid_source_kind' })
    return
  }
  const sourceId = String(body.sourceId ?? '').trim()
  const externalId = String(body.externalId ?? '').trim()
  const threadKey = String(body.threadKey ?? '').trim()
  if (!sourceId || !externalId || !threadKey) {
    fail(ctx, 400, 'sourceId/externalId/threadKey 必填', { code: 'missing_field' })
    return
  }
  const result = ingestTrigger({
    sourceId, sourceKind: sourceKind as SourceKind, externalId, threadKey,
    actor: typeof body.actor === 'string' ? body.actor : undefined,
    addressed: body.addressed === true,
    payload: body.payload ?? null,
  }, { decidedBy: actor.username })
  ok(ctx, { ...result })
})

router.get('/threads', async ctx => {
  ok(ctx, { threads: listThreads(Number(ctx.query.limit ?? 50) as number) })
})

router.get('/threads/:id/subscriptions', async ctx => {
  const id = String(ctx.params.id ?? '')
  if (!id) { fail(ctx, 400, 'thread id 必填'); return }
  ok(ctx, { subscriptions: subscriptionsOf(id) })
})

router.post('/threads/:id/subscriptions', async ctx => {
  const actor = requireActorOrFail(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const subscriber = String(body.subscriber ?? '').trim()
  const mode = String(body.mode ?? 'context')
  if (!subscriber) { fail(ctx, 400, 'subscriber 必填', { code: 'missing_subscriber' }); return }
  if (!['wake', 'notify', 'context'].includes(mode)) {
    fail(ctx, 400, 'mode 须为 wake|notify|context', { code: 'invalid_mode' })
    return
  }
  ok(ctx, {
    subscription: subscribe({
      threadId: String(ctx.params.id ?? ''), subscriber,
      mode: mode as 'wake' | 'notify' | 'context',
      cursor: typeof body.cursor === 'string' ? body.cursor : null,
    }),
  })
})

router.get('/threads/:id/pending', async ctx => {
  const subscriber = String(ctx.query.subscriber ?? '').trim()
  if (!subscriber) { fail(ctx, 400, 'subscriber 查询参数必填', { code: 'missing_subscriber' }); return }
  ok(ctx, { triggers: pendingFor(String(ctx.params.id ?? ''), subscriber) })
})

router.post('/threads/:id/read', async ctx => {
  const actor = requireActorOrFail(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const subscriber = String(body.subscriber ?? '').trim()
  const triggerId = String(body.triggerId ?? '').trim()
  if (!subscriber || !triggerId) { fail(ctx, 400, 'subscriber/triggerId 必填', { code: 'missing_field' }); return }
  const moved = markRead(String(ctx.params.id ?? ''), subscriber, triggerId)
  ok(ctx, { advanced: moved })
})

router.get('/decisions', async ctx => {
  ok(ctx, { decisions: listDecisions(Number(ctx.query.limit ?? 50) as number) })
})

router.get('/mandates', async ctx => {
  const ticketId = typeof ctx.query.ticketId === 'string' ? ctx.query.ticketId.trim() : ''
  ok(ctx, { mandates: listMandates(ticketId || undefined, Number(ctx.query.limit ?? 50) as number) })
})

router.post('/mandates', async ctx => {
  const actor = requireActorOrFail(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const decisionId = String(body.decisionId ?? '').trim()
  const ticketId = String(body.ticketId ?? '').trim()
  if (!decisionId || !ticketId) { fail(ctx, 400, 'decisionId/ticketId 必填', { code: 'missing_field' }); return }
  const strength = String(body.strength ?? 'explicit')
  if (!['explicit', 'delegated', 'inferred'].includes(strength)) {
    fail(ctx, 400, 'strength 须为 explicit|delegated|inferred', { code: 'invalid_strength' })
    return
  }
  ok(ctx, {
    mandate: issueMandate({
      decisionId, ticketId,
      scope: (body.scope && typeof body.scope === 'object') ? body.scope as Record<string, unknown> : {},
      strength: strength as 'explicit' | 'delegated' | 'inferred',
      ruleIds: Array.isArray(body.ruleIds) ? body.ruleIds.map(String) : [],
      policyVersion: Number(body.policyVersion ?? currentPolicyVersion('source-admission')),
      issuer: actor.username,
      ttlMs: typeof body.ttlMs === 'number' && Number.isFinite(body.ttlMs) ? body.ttlMs : undefined,
    }),
  })
})

router.post('/mandates/:id/revoke', async ctx => {
  const actor = requireActorOrFail(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const reason = String(body.reason ?? '').trim() || `revoked_by:${actor.username}`
  const done = revoke(String(ctx.params.id ?? ''), reason)
  if (!done) { fail(ctx, 404, '凭证不存在或已撤销', { code: 'not_found' }); return }
  ok(ctx, { revoked: true })
})

router.post('/mandates/:id/revalidate', async ctx => {
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const result = revalidate(String(ctx.params.id ?? ''), {
    currentSenderListed: body.currentSenderListed === true,
    addressed: body.addressed === true,
  })
  ok(ctx, { ...result })
})

router.get('/mandates/active/:ticketId', async ctx => {
  ok(ctx, { mandate: activeMandateFor(String(ctx.params.ticketId ?? '')) })
})

router.get('/admissions', async ctx => {
  ok(ctx, { admissions: listAdmissions(), defaults: defaultCells() })
})

router.get('/admissions/:sourceId', async ctx => {
  const sourceId = String(ctx.params.sourceId ?? '')
  const admission = getAdmission(sourceId)
  if (!admission) { ok(ctx, { available: false, admission: null }); return }
  ok(ctx, { available: true, admission })
})

router.put('/admissions/:sourceId', async ctx => {
  const actor = requireActorOrFail(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const sourceId = String(ctx.params.sourceId ?? '')
  if (!sourceId) { fail(ctx, 400, 'sourceId 必填', { code: 'missing_source' }); return }
  try {
    const admission = setAdmission(normalizeAdmission({
      sourceId,
      mode: body.mode as never,
      allowedSenders: Array.isArray(body.allowedSenders) ? body.allowedSenders.map(String) : [],
      cells: Array.isArray(body.cells) ? body.cells as never : undefined,
    }), actor.username)
    ok(ctx, { admission, policyVersion: currentPolicyVersion('source-admission') })
  } catch (error) {
    fail(ctx, 500, `准入表写入失败：${error instanceof Error ? error.message : String(error)}`, { code: 'admission_write_failed' })
  }
})

router.get('/policy-versions', async ctx => {
  ok(ctx, { versions: Object.fromEntries(POLICY_KINDS.map(k => [k as PolicyKind, currentPolicyVersion(k)])) })
})

router.get('/assignments/:ticketId', async ctx => {
  ok(ctx, { assignments: listAssignments(String(ctx.params.ticketId ?? '')) })
})

/** 手动 tick：与将来的常驻 pass 同一入口，便于测试与运维补采。 */
router.post('/kanban-bridge/tick', async ctx => {
  const actor = requireActorOrFail(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const limit = Number(body.limit ?? 200)
  const results = bridgeAll({ limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 1000) : 200 })
  ok(ctx, {
    ingested: results.length,
    accepted: results.filter(r => r.accepted).length,
    duplicated: results.filter(r => r.duplicated).length,
    results: results.slice(0, 50),
  })
})

export const orchestratorRoutes = router
