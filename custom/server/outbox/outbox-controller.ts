/**
 * 发件箱 REST（Always-on Agents 吸收 P2，2026-11-16）。
 *
 * POST /api/hermes/outbox            入队（recipient/body/source 必填；dedupeKey 幂等）
 * GET  /api/hermes/outbox            查询（status/channel/source/recipient/limit）
 * GET  /api/hermes/outbox/stats      读数（状态/通道/优先级分布 + 积压年龄）
 * POST /api/hermes/outbox/dispatch   手动派发一轮（env OUTBOX_DISPATCH=off 时拒绝）
 *
 * 挂载：B 类补丁 784 在 bootstrap/routes.ts（与 run-outcome 同批）。
 * 自动轮：OUTBOX_TICK_INTERVAL_MS 缺省 60000（0=不自动 tick；unref 不阻塞退出）。
 */
import Router from '@koa/router'
import {
  enqueueOutbox, isOutboxChannel, isOutboxPriority, isOutboxStatus, listOutbox, outboxStats,
} from './outbox-store'
import { dispatchDue, outboxBacklog } from './outbox-dispatcher'

const router = new Router({ prefix: '/api/hermes/outbox' })

export function outboxDispatchEnabled(): boolean {
  return (process.env.OUTBOX_DISPATCH ?? 'on').trim().toLowerCase() !== 'off'
}

router.post('/', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const recipient = body.recipient as { kind?: unknown; name?: unknown } | undefined
  if (!recipient || (recipient.kind !== 'member' && recipient.kind !== 'agent') || typeof recipient.name !== 'string' || !recipient.name) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'recipient 须为 { kind: member|agent, name }' }
    return
  }
  if (typeof body.body !== 'string' || !body.body) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'body 必填' }
    return
  }
  if (typeof body.source !== 'string' || !body.source) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'source 必填' }
    return
  }
  if (body.channel !== undefined && !isOutboxChannel(body.channel)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'channel 须为 inbox|matrix' }
    return
  }
  if (body.priority !== undefined && !isOutboxPriority(body.priority)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'priority 须为 critical|high|normal' }
    return
  }
  const result = enqueueOutbox({
    recipient: { kind: recipient.kind, name: recipient.name },
    body: body.body,
    source: body.source,
    ...(typeof body.channel === 'string' ? { channel: body.channel as never } : {}),
    ...(typeof body.priority === 'string' ? { priority: body.priority as never } : {}),
    ...(typeof body.runId === 'string' && body.runId ? { runId: body.runId } : {}),
    ...(typeof body.dedupeKey === 'string' && body.dedupeKey ? { dedupeKey: body.dedupeKey } : {}),
    ...(typeof body.mergeKey === 'string' && body.mergeKey ? { mergeKey: body.mergeKey } : {}),
    ...(typeof body.notBefore === 'number' ? { notBefore: body.notBefore } : {}),
  })
  ctx.status = result.enqueued ? 200 : result.reason === 'duplicate' ? 200 : 400
  ctx.body = { ok: result.enqueued, ...result }
})

router.get('/', async (ctx) => {
  const { status, channel, source, recipient } = ctx.query
  if (status !== undefined && !isOutboxStatus(status)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'status 须为 pending|delivering|delivered|failed|suppressed' }
    return
  }
  if (channel !== undefined && !isOutboxChannel(channel)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'channel 须为 inbox|matrix' }
    return
  }
  const limit = ctx.query.limit === undefined ? undefined : Number(ctx.query.limit)
  if (limit !== undefined && !Number.isFinite(limit)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'limit 须为数字' }
    return
  }
  const messages = listOutbox({
    ...(status ? { status: status as never } : {}),
    ...(channel ? { channel: channel as never } : {}),
    ...(typeof source === 'string' && source ? { source } : {}),
    ...(typeof recipient === 'string' && recipient ? { recipient } : {}),
    ...(limit !== undefined ? { limit } : {}),
  })
  ctx.body = { ok: true, messages }
})

router.get('/stats', async (ctx) => {
  ctx.body = { ok: true, ...outboxStats(), backlog: outboxBacklog() }
})

router.post('/dispatch', async (ctx) => {
  if (!outboxDispatchEnabled()) {
    ctx.status = 409
    ctx.body = { ok: false, detail: '派发已关闭（OUTBOX_DISPATCH=off）' }
    return
  }
  ctx.body = { ok: true, ...(await dispatchDue()) }
})

export const outboxRouter = router

// 自动轮：缺省 60s；0 不启动；unref 不阻塞进程退出。
function tickIntervalMs(): number {
  const raw = process.env.OUTBOX_TICK_INTERVAL_MS?.trim()
  const n = raw === undefined || raw === '' ? 60_000 : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const interval = tickIntervalMs()
if (interval > 0 && outboxDispatchEnabled()) {
  const timer = setInterval(() => {
    void dispatchDue().catch(() => { /* 单轮失败等下一轮 */ })
  }, interval)
  timer.unref?.()
}
