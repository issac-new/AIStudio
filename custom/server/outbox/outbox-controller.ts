/**
 * 发件箱 REST（Always-on Agents 吸收 P2，2026-11-16）。
 *
 * POST /api/hermes/outbox            入队（recipient/body/source 必填；dedupeKey 幂等）
 * GET  /api/hermes/outbox            查询（status/channel/source/recipient/limit）
 * GET  /api/hermes/outbox/stats      读数（状态/通道/优先级分布 + 积压年龄）
 * POST /api/hermes/outbox/dispatch   手动派发一轮（env OUTBOX_DISPATCH=off 时拒绝）
 *
 * 挂载：B 类补丁 784 在 bootstrap/routes.ts（与 run-outcome 同批）。
 * 自动轮：OUTBOX_TICK_INTERVAL_MS 缺省 60000（0=不自动 tick；测试环境不启）。
 * 响应形状统一走 lib/http（K19：新代码不手写响应体/失败字面量）。
 */
import Router from '@koa/router'
import { bodyOf, fail, ok } from '../lib/http'
import {
  enqueueOutbox, isOutboxChannel, isOutboxPriority, isOutboxStatus, listOutbox, outboxStats,
} from './outbox-store'
import { dispatchDue, outboxBacklog } from './outbox-dispatcher'

const router = new Router({ prefix: '/api/hermes/outbox' })

export function outboxDispatchEnabled(): boolean {
  return (process.env.OUTBOX_DISPATCH ?? 'on').trim().toLowerCase() !== 'off'
}

router.post('/', async (ctx) => {
  const body = bodyOf(ctx)
  const recipient = body.recipient as { kind?: unknown; name?: unknown } | undefined
  if (!recipient || (recipient.kind !== 'member' && recipient.kind !== 'agent') || typeof recipient.name !== 'string' || !recipient.name) {
    fail(ctx, 400, 'recipient 须为 { kind: member|agent, name }')
    return
  }
  if (typeof body.body !== 'string' || !body.body) {
    fail(ctx, 400, 'body 必填')
    return
  }
  if (typeof body.source !== 'string' || !body.source) {
    fail(ctx, 400, 'source 必填')
    return
  }
  if (body.channel !== undefined && !isOutboxChannel(body.channel)) {
    fail(ctx, 400, 'channel 须为 inbox|matrix')
    return
  }
  if (body.priority !== undefined && !isOutboxPriority(body.priority)) {
    fail(ctx, 400, 'priority 须为 critical|high|normal')
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
  if (!result.enqueued && result.reason !== 'duplicate') {
    fail(ctx, 400, (result.problems ?? ['入队失败']).join('；'), { problems: result.problems ?? [] })
    return
  }
  ok(ctx, result as unknown as Record<string, unknown>)
})

router.get('/', async (ctx) => {
  const { status, channel, source, recipient } = ctx.query
  if (status !== undefined && !isOutboxStatus(status)) {
    fail(ctx, 400, 'status 须为 pending|delivering|delivered|failed|suppressed')
    return
  }
  if (channel !== undefined && !isOutboxChannel(channel)) {
    fail(ctx, 400, 'channel 须为 inbox|matrix')
    return
  }
  const limit = ctx.query.limit === undefined ? undefined : Number(ctx.query.limit)
  if (limit !== undefined && !Number.isFinite(limit)) {
    fail(ctx, 400, 'limit 须为数字')
    return
  }
  const messages = listOutbox({
    ...(status ? { status: status as never } : {}),
    ...(channel ? { channel: channel as never } : {}),
    ...(typeof source === 'string' && source ? { source } : {}),
    ...(typeof recipient === 'string' && recipient ? { recipient } : {}),
    ...(limit !== undefined ? { limit } : {}),
  })
  ok(ctx, { messages })
})

router.get('/stats', async (ctx) => {
  ok(ctx, { ...outboxStats(), backlog: outboxBacklog() })
})

router.post('/dispatch', async (ctx) => {
  if (!outboxDispatchEnabled()) {
    fail(ctx, 409, '派发已关闭（OUTBOX_DISPATCH=off）')
    return
  }
  ok(ctx, (await dispatchDue()) as unknown as Record<string, unknown>)
})

export const outboxRouter = router

// 自动轮：缺省 60s；0 不启动；unref 不阻塞进程退出。
function tickIntervalMs(): number {
  const raw = process.env.OUTBOX_TICK_INTERVAL_MS?.trim()
  const n = raw === undefined || raw === '' ? 60_000 : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const interval = tickIntervalMs()
// 测试环境不启自动轮（先例：sandbox-lease/policy-store 的 NODE_ENV 守卫）——避免导入
// 路由清单的测试进程落真盘/真外呼；手动 POST /dispatch 仍可测。
if (interval > 0 && outboxDispatchEnabled() && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const timer = setInterval(() => {
    void dispatchDue().catch(() => { /* 单轮失败等下一轮 */ })
  }, interval)
  timer.unref?.()
}
