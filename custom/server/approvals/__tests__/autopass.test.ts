// overlay/custom/server/approvals/__tests__/autopass.test.ts
// V4.1 §七 抽检器守门：纯函数（确定性抽检/候选判定）+ REST 集成
// （低风险自动放行 → 台账 auto_pass → 抽检处置 confirm/veto）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import type { AddressInfo } from 'net'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const ENV_BEFORE = {
  LOG: process.env.HERMES_APPROVALS_LOG_FILE,
  QUEUE: process.env.HERMES_APPROVALS_QUEUE_DIR,
  SPOT: process.env.HERMES_APPROVALS_SPOTCHECK_FILE,
  GRACE: process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS,
  RATE: process.env.HERMES_APPROVALS_SPOTCHECK_RATE,
  ENABLE: process.env.HERMES_APPROVALS_AUTOPASS,
}

async function fetchJson(base: string, path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init)
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

describe('autopass 纯函数（确定性抽检 + 候选判定）', () => {
  it('stableHash 确定性：同串同值、不同串大概率不同', async () => {
    const { stableHash, shouldSpotCheck } = await import('../autopass')
    expect(stableHash('fleetfile:rq-1')).toBe(stableHash('fleetfile:rq-1'))
    expect(stableHash('fleetfile:rq-1')).not.toBe(stableHash('fleetfile:rq-2'))
    // 抽检判定只依赖 id 与 rate（跨重启稳定，不依赖随机态）
    expect(shouldSpotCheck('id-x', 0.2)).toBe(shouldSpotCheck('id-x', 0.2))
  })

  it('shouldSpotCheck 边界：rate<=0 全不抽；>=1 全抽；(0,1) 确定性部分命中', async () => {
    const { shouldSpotCheck } = await import('../autopass')
    expect(shouldSpotCheck('a', 0)).toBe(false)
    expect(shouldSpotCheck('a', 1)).toBe(true)
    let hit = 0
    for (let i = 0; i < 200; i++) if (shouldSpotCheck(`id-${i}`, 0.2)) hit++
    expect(hit).toBeGreaterThan(10)
    expect(hit).toBeLessThan(60)
  })

  it('isAutopassCandidate：仅命令类 + low 档 + 过宽限期', async () => {
    process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS = '1000'
    const { isAutopassCandidate } = await import('../autopass')
    const now = 1_000_000
    expect(isAutopassCandidate({ kind: 'command', risk: 'low', createdAt: now - 2000 }, now)).toBe(true)
    expect(isAutopassCandidate({ kind: 'command', risk: 'low', createdAt: now - 500 }, now)).toBe(false)
    expect(isAutopassCandidate({ kind: 'command', risk: 'medium', createdAt: now - 9999 }, now)).toBe(false)
    expect(isAutopassCandidate({ kind: 'command', risk: 'high', createdAt: now - 9999 }, now)).toBe(false)
    expect(isAutopassCandidate({ kind: 'review', risk: 'low', createdAt: now - 9999 }, now)).toBe(false)
    delete process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS
  })
})

describe('抽检器 REST（V4.1 §七）：低风险自动放行 + 抽检处置', () => {
  let base: string
  let server: ReturnType<typeof createServer>
  let queueDir: string

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()))
    if (ENV_BEFORE.LOG) process.env.HERMES_APPROVALS_LOG_FILE = ENV_BEFORE.LOG; else delete process.env.HERMES_APPROVALS_LOG_FILE
    if (ENV_BEFORE.QUEUE) process.env.HERMES_APPROVALS_QUEUE_DIR = ENV_BEFORE.QUEUE; else delete process.env.HERMES_APPROVALS_QUEUE_DIR
    if (ENV_BEFORE.SPOT) process.env.HERMES_APPROVALS_SPOTCHECK_FILE = ENV_BEFORE.SPOT; else delete process.env.HERMES_APPROVALS_SPOTCHECK_FILE
    if (ENV_BEFORE.GRACE) process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS = ENV_BEFORE.GRACE; else delete process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS
    if (ENV_BEFORE.RATE) process.env.HERMES_APPROVALS_SPOTCHECK_RATE = ENV_BEFORE.RATE; else delete process.env.HERMES_APPROVALS_SPOTCHECK_RATE
    if (ENV_BEFORE.ENABLE) process.env.HERMES_APPROVALS_AUTOPASS = ENV_BEFORE.ENABLE; else delete process.env.HERMES_APPROVALS_AUTOPASS
  })

  beforeEach(async () => {
    const uniq = `${process.pid}-${Date.now()}`
    process.env.HERMES_APPROVALS_LOG_FILE = `/tmp/v41-autopass-log-${uniq}.json`
    queueDir = `/tmp/v41-autopass-queue-${uniq}`
    process.env.HERMES_APPROVALS_QUEUE_DIR = queueDir
    process.env.HERMES_APPROVALS_SPOTCHECK_FILE = `/tmp/v41-autopass-spot-${uniq}.json`
    process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS = '0'
    process.env.HERMES_APPROVALS_SPOTCHECK_RATE = '1'
    delete process.env.HERMES_APPROVALS_AUTOPASS
    mkdirSync(queueDir, { recursive: true })
    const { approvalsRoutes, _resetAutopassScanThrottleForTests } = await import('../pending-controller')
    _resetAutopassScanThrottleForTests()
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

  /** 入队一条文件队列审批（unattended worker 传输源；追加写，多次入队共存）。 */
  function enqueue(requestId: string, command: string, ageMs = 10_000): void {
    const entry = {
      request_id: requestId, digest: `dg-${requestId}`, command,
      allowed_choices: ['once', 'deny'], timeout_seconds: 300,
      enqueued_at: Date.now() - ageMs, surface: 'unattended:single_query',
    }
    writeFileSync(join(queueDir, 'queue.jsonl'), JSON.stringify(entry) + '\n', { flag: 'a' })
  }

  it('低风险只读命令自动放行：pending 不在列 + 台账 auto_pass + 响应文件 once；高危仍在列人审', async () => {
    enqueue('rq-low', 'ls -la /tmp/pay-demo')
    enqueue('rq-high', 'rm -rf /tmp/pay-live-demo')
    const pending = await fetchJson(base, '/api/approvals/pending')
    const ids = (pending.body.items as Array<{ id: string; risk: string }>).map(i => i.id)
    expect(ids).not.toContain('fleetfile:rq-low')
    expect(ids).toContain('fleetfile:rq-high')
    // 文件队列源档位真分类：ls=low（已放行不可见），rm=high
    const high = (pending.body.items as Array<{ id: string; risk: string }>).find(i => i.id === 'fleetfile:rq-high')!
    expect(high.risk).toBe('high')

    const hist = await fetchJson(base, '/api/approvals/history')
    const auto = (hist.body.entries as Array<{ decision: string; actor: string; risk?: string; targetId: string }>)
      .find(e => e.targetId === 'fleetfile:rq-low')
    expect(auto?.decision).toBe('auto_pass')
    expect(auto?.actor).toBe('system')
    expect(auto?.risk).toBe('low')

    const respPath = join(queueDir, 'responses', 'rq-low.json')
    expect(existsSync(respPath)).toBe(true)
    expect((JSON.parse(readFileSync(respPath, 'utf8')) as { choice: string; actor: string }).choice).toBe('once')
  })

  it('抽检链：rate=1 全量入队 → GET /spotcheck 在列 → veto 落台账回灌 → 一次定音 404', async () => {
    enqueue('rq-veto', 'git status')
    await fetchJson(base, '/api/approvals/pending')  // 触发放行 + 入抽检队列
    const open = await fetchJson(base, '/api/approvals/spotcheck')
    const items = open.body.items as Array<{ id: string; verdict?: string }>
    expect(items.some(i => i.id === 'fleetfile:rq-veto' && !i.verdict)).toBe(true)

    const bad = await fetchJson(base, `/api/approvals/spotcheck/${encodeURIComponent('fleetfile:rq-veto')}/resolve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verdict: 'maybe' }),
    })
    expect(bad.status).toBe(400)

    const veto = await fetchJson(base, `/api/approvals/spotcheck/${encodeURIComponent('fleetfile:rq-veto')}/resolve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verdict: 'veto', note: '此命令不该自动放行' }),
    })
    expect(veto.status).toBe(200)
    expect((veto.body.item as { verdict: string }).verdict).toBe('vetoed')

    const hist = await fetchJson(base, '/api/approvals/history')
    const entries = hist.body.entries as Array<{ decision: string; targetId: string; actor: string }>
    expect(entries.some(e => e.decision === 'spotcheck_veto' && e.targetId === 'fleetfile:rq-veto' && e.actor === 'qa-lead')).toBe(true)
    expect(entries.some(e => e.decision === 'auto_pass' && e.targetId === 'fleetfile:rq-veto')).toBe(true)

    const again = await fetchJson(base, `/api/approvals/spotcheck/${encodeURIComponent('fleetfile:rq-veto')}/resolve`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verdict: 'confirm' }),
    })
    expect(again.status).toBe(404)

    const after = await fetchJson(base, '/api/approvals/spotcheck')
    expect(((after.body.items) as unknown[]).some(i => (i as { id: string }).id === 'fleetfile:rq-veto')).toBe(false)
  })

  it('开关：HERMES_APPROVALS_AUTOPASS=0 时低风险项留在 pending 人审（不自动放行）', async () => {
    process.env.HERMES_APPROVALS_AUTOPASS = '0'
    const { _resetAutopassScanThrottleForTests } = await import('../pending-controller')
    _resetAutopassScanThrottleForTests()
    enqueue('rq-frozen', 'cat /tmp/pay-config.yaml')
    const pending = await fetchJson(base, '/api/approvals/pending')
    const ids = (pending.body.items as Array<{ id: string }>).map(i => i.id)
    expect(ids).toContain('fleetfile:rq-frozen')
    const respPath = join(queueDir, 'responses', 'rq-frozen.json')
    expect(existsSync(respPath)).toBe(false)
  })
})
