// overlay/custom/server/approvals/__tests__/pending-controller.test.ts
// P1 审批收件箱守门：pending 聚合形状 + decide 前缀路由 + 历史落账 + 参数校验。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import type { AddressInfo } from 'net'

const LOG_FILE_BEFORE = process.env.HERMES_APPROVALS_LOG_FILE
const REVIEW_DIR_BEFORE = process.env.HERMES_REVIEW_DIR

async function fetchJson(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init)
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

describe('审批收件箱 REST（/api/approvals）', () => {
  let base: string
  let server: ReturnType<typeof createServer>

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()))
    if (LOG_FILE_BEFORE) process.env.HERMES_APPROVALS_LOG_FILE = LOG_FILE_BEFORE
    else delete process.env.HERMES_APPROVALS_LOG_FILE
    if (REVIEW_DIR_BEFORE) process.env.HERMES_REVIEW_DIR = REVIEW_DIR_BEFORE
    else delete process.env.HERMES_REVIEW_DIR
  })

  beforeEach(async () => {
    process.env.HERMES_APPROVALS_LOG_FILE = `/tmp/p1-approvals-log-${process.pid}-${Date.now()}.json`
    process.env.HERMES_REVIEW_DIR = `/tmp/p1-review-dir-${process.pid}-${Date.now()}`
    const { approvalsRoutes } = await import('../pending-controller')
    const { openReview } = await import('../../review/review-store')
    // 造一张待审评审卡 + 一张已裁决卡
    openReview({ reviewId: 'rev-pending-1', taskId: 't_100', domain: 'baseline', baseRef: 'main' })
    openReview({ reviewId: 'rev-done-1', taskId: 't_101', domain: 'uncommitted' })
    const { setVerdict } = await import('../../review/review-store')
    setVerdict('rev-done-1', 'approve', '已过', 'tester')

    const app = new Koa()
    app.use(async (ctx, next) => {
      (ctx.state as { user?: { username?: string } }).user = { username: 'qa-lead' }
      await next()
    })
    app.use(async (ctx, next) => {
      if (ctx.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const c of ctx.req) chunks.push(c as Buffer)
        try { ctx.request.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { ctx.request.body = {} }
      }
      await next()
    })
    app.use(approvalsRoutes.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  it('GET /pending：评审未裁决卡在列、已裁决卡不在列（fleet 源缺省不阻断）', async () => {
    const { status, body } = await fetchJson(base, '/api/approvals/pending')
    expect(status).toBe(200)
    const items = body.items as Array<{ id: string; kind: string; taskId?: string }>
    const ids = items.map((i) => i.id)
    expect(ids).toContain('review:rev-pending-1')
    expect(ids).not.toContain('review:rev-done-1')
    const pending = items.find((i) => i.id === 'review:rev-pending-1')!
    expect(pending.kind).toBe('review')
    expect(pending.taskId).toBe('t_100')
  })

  it('POST /decide：review approve 落裁决 + 历史含操作人/对象/结果', async () => {
    const decide = await fetchJson(base, '/api/approvals/review:rev-pending-1/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', note: '准出' }),
    })
    expect(decide.status).toBe(200)
    expect(decide.body.ok).toBe(true)

    const hist = await fetchJson(base, '/api/approvals/history')
    const entries = hist.body.entries as Array<{ actor: string; targetId: string; decision: string; note?: string }>
    const mine = entries.find((e) => e.targetId === 'rev-pending-1')
    expect(mine?.actor).toBe('qa-lead')
    expect(mine?.decision).toBe('approve')
    expect(mine?.note).toBe('准出')
    expect(mine?.targetTitle).toBe('t_100')
  })

  it('重复裁决 409（一次定音）；非法前缀 400；comment 不可经收件箱提交', async () => {
    await fetchJson(base, '/api/approvals/review:rev-pending-1/decide', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
    const again = await fetchJson(base, '/api/approvals/review:rev-pending-1/decide', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
    expect(again.status).toBe(409)
    const bad = await fetchJson(base, '/api/approvals/unknown:1/decide', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
    expect(bad.status).toBe(400)
    const comment = await fetchJson(base, '/api/approvals/review:rev-done-1/decide', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'comment' }),
    })
    expect(comment.status).toBe(400)
  })

  it('kanban decide：纯记账分支（决策 + 操作人 + 对象标题入历史）', async () => {
    const res = await fetchJson(base, '/api/approvals/kanban:t_200/decide', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', note: '验收通过', title: '支付渠道接入' }),
    })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    const hist = await fetchJson(base, '/api/approvals/history')
    const entries = hist.body.entries as Array<{ targetId: string; targetKind: string; targetTitle: string }>
    const mine = entries.find((e) => e.targetId === 't_200')
    expect(mine?.targetKind).toBe('kanban')
    expect(mine?.targetTitle).toBe('支付渠道接入')
  })

  it('fleet decide：非词表决策 400；id 缺会话段 400', async () => {
    const bad1 = await fetchJson(base, '/api/approvals/fleet:s1/decide', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
    expect(bad1.status).toBe(400)
    const bad2 = await fetchJson(base, '/api/approvals/fleet:s1:a1/decide', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'maybe' }),
    })
    expect(bad2.status).toBe(400)
  })
})
