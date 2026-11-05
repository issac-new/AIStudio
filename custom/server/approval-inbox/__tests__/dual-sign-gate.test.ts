// 双签闸真拦守门（2026-11-05 收口）：高风险批准须两个不同签署人，或单操作员显式豁免。
// 走真实 decide 路由（approvalsRoutes），只 mock 掉不需要的外部面。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'

let dir = ''
let base = ''
let server: ReturnType<typeof createServer> | null = null
let currentActor = 'alice'

const ENV_KEYS = [
  'HERMES_AUTONOMY_GOV_DIR', 'HERMES_ENFORCE_APPROVALS_DIR', 'HERMES_APPROVALS_LOG_FILE',
  'HERMES_REVIEW_DIR', 'HERMES_APPROVALS_QUEUE_DIR', 'HUMAN_GATE_STORE', 'AUTONOMY_DUAL_SIGN',
] as const
const before: Record<string, string | undefined> = {}

function jsonBody(ctx: Koa.Context, next: () => Promise<void>): Promise<void> {
  if (ctx.method !== 'POST') return next()
  return (async () => {
    const chunks: Buffer[] = []
    for await (const c of ctx.req) chunks.push(c as Buffer)
    try { (ctx.request as { body?: unknown }).body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { (ctx.request as { body?: unknown }).body = {} }
    await next()
  })()
}

async function start(): Promise<void> {
  const { approvalsRoutes } = await import('../pending-controller')
  const app = new Koa()
  app.use(async (ctx, next) => {
    ;(ctx.state as { user?: { username?: string; role?: string } }).user = { username: currentActor, role: 'super_admin' }
    await next()
  })
  app.use(jsonBody)
  app.use(approvalsRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => (server as ReturnType<typeof createServer>).listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
}

async function decide(id: string, decision: string, waiver?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${base}/api/approvals/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, ...(waiver ? { waiver } : {}) }),
  })
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

async function makeHighRisk(id: string): Promise<string> {
  const { createEnforceApproval } = await import('../../toolpipeline/enforce-approvals')
  const rec = createEnforceApproval({
    callHash: `hash-${id}-${Date.now()}`,
    tool: 'terminal',
    inputPreview: 'rm -rf /tmp/x',
    profileId: 'worker-coder',
    rule: 'policy-require-approval',
    risk: 'high',
    requestedBy: 'system-agent',
  })
  return rec.id
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dualsign-'))
  for (const k of ENV_KEYS) before[k] = process.env[k]
  process.env.HERMES_AUTONOMY_GOV_DIR = join(dir, 'autonomygov')
  process.env.HERMES_ENFORCE_APPROVALS_DIR = join(dir, 'enforce')
  process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'approvals-log.json')
  process.env.HERMES_REVIEW_DIR = join(dir, 'review')
  process.env.HERMES_APPROVALS_QUEUE_DIR = join(dir, 'queue')
  process.env.HUMAN_GATE_STORE = join(dir, 'hgate.json')
  mkdirSync(process.env.HERMES_APPROVALS_QUEUE_DIR, { recursive: true })
  delete process.env.AUTONOMY_DUAL_SIGN
  currentActor = 'alice'
  await start()
})

afterEach(() => {
  server?.close()
  server = null
  for (const k of ENV_KEYS) {
    if (before[k] === undefined) delete process.env[k]
    else process.env[k] = before[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

describe('双签闸：高风险批准真拦', () => {
  it('第一签 409 并返回已签人；换人再签 200', async () => {
    const id = await makeHighRisk('a')
    const first = await decide(id, 'approve')
    expect(first.status).toBe(409)
    expect(first.body.code).toBe('dual-sign-required')
    expect(first.body.signers).toEqual(['alice'])
    expect(String(first.body.scope)).toContain('风险档可重算')

    currentActor = 'bob'
    const second = await decide(id, 'approve')
    expect(second.status).toBe(200)
  })

  it('同一人重复签不凑成双签（仍是 409）', async () => {
    const id = await makeHighRisk('b')
    expect((await decide(id, 'approve')).status).toBe(409)
    expect((await decide(id, 'approve')).status).toBe(409)
  })

  it('单操作员显式豁免放行，并落缺口记录', async () => {
    const id = await makeHighRisk('c')
    const r = await decide(id, 'approve', 'single-operator')
    expect(r.status).toBe(200)
    const { listDualSignGaps } = await import('../../autonomygov/store')
    const gaps = listDualSignGaps(10)
    expect(gaps.some((g) => g.changeId === id && g.source === 'approval-decide/waiver')).toBe(true)
  })

  it('非法 waiver 值不放行（开放字段等于没有闸）', async () => {
    const id = await makeHighRisk('d')
    const r = await decide(id, 'approve', 'whatever')
    expect(r.status).toBe(409)
  })

  it('否决不需要双签', async () => {
    const id = await makeHighRisk('e')
    const r = await decide(id, 'reject')
    expect(r.status).toBe(200)
  })

  it('中风险批准不适用双签（单签即放行）', async () => {
    const { createEnforceApproval } = await import('../../toolpipeline/enforce-approvals')
    const rec = createEnforceApproval({
      callHash: `hash-medium-${Date.now()}`,
      tool: 'write_file', inputPreview: 'w', profileId: 'worker-coder',
      rule: 'policy-require-approval', risk: 'medium', requestedBy: 'system-agent',
    })
    expect((await decide(rec.id, 'approve')).status).toBe(200)
  })

  it('AUTONOMY_DUAL_SIGN=off 时关闭闸（单签放行）', async () => {
    process.env.AUTONOMY_DUAL_SIGN = 'off'
    const id = await makeHighRisk('f')
    expect((await decide(id, 'approve')).status).toBe(200)
  })
})
