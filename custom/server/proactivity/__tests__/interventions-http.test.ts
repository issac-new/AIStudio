// 介入治理 HTTP 契约：偏好读写、干预列表、反馈流转、计分卡、同步降级。
// 隔离：台账/偏好/govbus 全落临时目录；看板根显式指向不存在的路径 → sync 走 available:false。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'

describe('介入治理 REST', () => {
  let dir: string
  let server: import('node:http').Server | undefined
  let base: string

  beforeEach(async () => {
    server?.close()
    dir = mkdtempSync(join(tmpdir(), 'iv-http-'))
    process.env.HERMES_GOAL_ALIGNMENT_DIR = dir
    process.env.HERMES_GOV_EVENT_DIR = join(dir, 'govbus')
    process.env.INTERVENTION_LEDGER_PATH = join(dir, 'interventions.json')
    process.env.ATTENTION_PREFS_PATH = join(dir, 'attention.json')
    process.env.DELIVERY_KANBAN_HOME = join(dir, 'no-kanban-here')
    delete process.env.HERMES_KANBAN_HOME
    // 主检出可能挂着真实 sim-mux：显式钉住观察面 SIM 根为空，sync 才稳定走 available:false
    process.env.OBS_SIM_ROOT = join(dir, 'no-sim-root')
    process.env.SIM_OBSERVER_ROOT = join(dir, 'no-sim-root')
    process.env.SIM_ROOT = join(dir, 'no-sim-root')
    delete process.env.HERMES_HOME
    const bodyParser = (await import('@koa/bodyparser')).default
    const Koa = (await import('koa')).default
    const { proactivityRouter } = await import('../proactivity-controller')
    const app = new Koa()
    app.use(bodyParser())
    app.use(proactivityRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hermes/proactivity`
  })

  afterAll(() => {
    for (const k of ['HERMES_GOAL_ALIGNMENT_DIR', 'HERMES_GOV_EVENT_DIR', 'INTERVENTION_LEDGER_PATH', 'ATTENTION_PREFS_PATH', 'DELIVERY_KANBAN_HOME', 'OBS_SIM_ROOT', 'SIM_OBSERVER_ROOT', 'SIM_ROOT']) {
      delete process.env[k]
    }
    server?.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('GET /attention 返回缺省；PUT 校验并落盘', async () => {
    const g = await fetch(`${base}/attention`).then((r) => r.json() as Promise<{ prefs: { dailyBudget: number }; defaults: { dailyBudget: number } }>)
    expect(g.prefs.dailyBudget).toBe(8)
    expect(g.defaults.hourlyBudget).toBe(3)

    const bad = await fetch(`${base}/attention`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dailyBudget: -1, quietHours: { startHour: 99, endHour: 8 } }),
    })
    expect(bad.status).toBe(400)
    const badBody = (await bad.json()) as { ok: boolean; problems: string[] }
    expect(badBody.ok).toBe(false)
    expect(badBody.problems.length).toBeGreaterThanOrEqual(2)

    const good = await fetch(`${base}/attention`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dailyBudget: 4, hourlyBudget: 2, quietHours: { startHour: 21, endHour: 7 } }),
    })
    expect(good.status).toBe(200)
    const saved = (await good.json()) as { prefs: { dailyBudget: number; quietHours: { startHour: number } } }
    expect(saved.prefs.dailyBudget).toBe(4)
    expect(saved.prefs.quietHours.startHour).toBe(21)
    const reread = await fetch(`${base}/attention`).then((r) => r.json() as Promise<{ prefs: { dailyBudget: number } }>)
    expect(reread.prefs.dailyBudget).toBe(4)
  })

  it('POST /interventions/sync：空看板根可用但零候选（不造数）', async () => {
    // 空 boards 目录：available:true 而 suggestions 为空——断言不凭缺席编造干预
    const home = join(dir, 'kanban-home')
    mkdirSync(join(home, 'kanban', 'boards'), { recursive: true })
    process.env.DELIVERY_KANBAN_HOME = home
    const res = await fetch(`${base}/interventions/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; available: boolean; created: number }
    expect(body.ok).toBe(true)
    expect(body.available).toBe(true)
    expect(body.created).toBe(0)
  })

  it('干预列表与反馈流转：追加记录→列表可见→反馈落账→计分卡读数变化', async () => {
    const L = await import('../intervention-ledger')
    L._resetLedgerForTests()
    L.appendIntervention({
      id: 'iv-http-1',
      surface: 'suggestion',
      severity: 'attention',
      audience: 'human',
      urgency: 'normal',
      topicKey: 'unblock-blocked:c1',
      summary: '卡点任务待确认',
      benefit: 0.7,
      cost: 0.2,
      decision: 'deliver',
      reasonCode: 'budget_ok',
      reasons: ['放行'],
      score: 0.5,
      decidedAtMs: Date.now() - 60_000,
    })

    const list = await fetch(`${base}/interventions?status=pending`).then((r) => r.json() as Promise<{ interventions: Array<{ id: string }> }>)
    expect(list.interventions.map((x) => x.id)).toContain('iv-http-1')

    const fb = await fetch(`${base}/interventions/iv-http-1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'accepted', note: '照做' }),
    })
    expect(fb.status).toBe(200)

    const bad = await fetch(`${base}/interventions/iv-http-1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'whatever' }),
    })
    expect(bad.status).toBe(400)

    const card = await fetch(`${base}/scorecard`).then((r) => r.json() as Promise<{ scorecard: { user: { interruptions: number; accepted: number; acceptanceRate: number } } }>)
    expect(card.scorecard.user.interruptions).toBe(1)
    expect(card.scorecard.user.accepted).toBe(1)
    expect(card.scorecard.user.acceptanceRate).toBe(1)
  })

  it('反馈未知干预 → 400（不静默造记录）', async () => {
    const res = await fetch(`${base}/interventions/ghost/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ outcome: 'ignored' }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { problems: string[] }
    expect(body.problems[0]).toContain('未知干预')
  })
})
