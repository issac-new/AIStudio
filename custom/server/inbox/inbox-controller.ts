/**
 * 注意力队列 REST（/api/inbox）——multica §六 inbox 吸收（矩阵 §3.5 P1）。
 *
 * POST /api/inbox                        投递（member|agent 双收件人；itemId 幂等；正文截 200）
 * GET  /api/inbox/:kind/:recipient       查询（unreadOnly/includeArchived/severity/limit 双轴过滤）
 * POST /api/inbox/:kind/:recipient/mark  批量双轴（read/archive）
 *
 * 挂载：B 类 patch 418 在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import {
  deliver, isInboxSeverity, isInboxType, markItems, queryInbox, type InboxItem, type InboxSeverity,
} from './inbox-store'

const router = new Router({ prefix: '/api/inbox' })

router.post('/', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { itemId, type, severity, recipientKind, recipient, body: text } = body
  if (typeof itemId !== 'string' || !itemId
      || !isInboxType(type) || !isInboxSeverity(severity)
      || (recipientKind !== 'member' && recipientKind !== 'agent')
      || typeof recipient !== 'string' || !recipient || typeof text !== 'string') {
    ctx.status = 400
    ctx.body = {
      ok: false,
      detail: 'itemId/type/severity/recipientKind(member|agent)/recipient/body 必填（type/severity 词表内）',
    }
    return
  }
  const item: InboxItem = {
    itemId, type, severity, recipientKind, recipient,
    body: text, at: Date.now(), read: false, archived: false,
  }
  const result = deliver(item)
  ctx.body = { ok: true, ...result }
})

router.get('/:kind/:recipient', async (ctx) => {
  const kind = ctx.params.kind
  if (kind !== 'member' && kind !== 'agent') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'kind 须为 member|agent' }
    return
  }
  const severity = ctx.query.severity
  if (severity !== undefined && !isInboxSeverity(severity)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'severity 须为三档之一' }
    return
  }
  const items = queryInbox(kind, ctx.params.recipient, {
    unreadOnly: ctx.query.unreadOnly === 'true',
    includeArchived: ctx.query.includeArchived === 'true',
    severity: severity as InboxSeverity | undefined,
    limit: Number(ctx.query.limit ?? 50),
  })
  ctx.body = { ok: true, items }
})

router.post('/:kind/:recipient/mark', async (ctx) => {
  const kind = ctx.params.kind
  if (kind !== 'member' && kind !== 'agent') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'kind 须为 member|agent' }
    return
  }
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const ids = body.itemIds
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'itemIds 须为 1-200 个 id 数组' }
    return
  }
  const patch: Partial<Pick<InboxItem, 'read' | 'archived'>> = {}
  if (typeof body.read === 'boolean') patch.read = body.read
  if (typeof body.archived === 'boolean') patch.archived = body.archived
  if (patch.read === undefined && patch.archived === undefined) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'read/archived 至少一项' }
    return
  }
  const changed = markItems(kind, ctx.params.recipient, ids.map(String), patch)
  ctx.body = { ok: true, changed }
})

export const inboxRoutes = router
