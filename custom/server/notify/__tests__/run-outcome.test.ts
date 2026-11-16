// Run 收口三态守门（Always-on Agents 吸收 P1）：分类矩阵/校验/JSONL 环形/统计/REST。
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import {
  classifyGovernanceRound, readRunOutcomes, recordRunOutcome, runOutcomeLedgerPath, runOutcomeStats,
} from '../run-outcome'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'run-outcome-'))
  process.env.RUN_OUTCOME_LEDGER_PATH = join(dir, 'run-outcomes.jsonl')
})
afterEach(() => {
  delete process.env.RUN_OUTCOME_LEDGER_PATH
  rmSync(dir, { recursive: true, force: true })
})

describe('治理裁决 → 收口三态分类（纯函数）', () => {
  const cases: Array<[Array<{ decision: string; reasonCode?: string }>, string, string]> = [
    [[{ decision: 'deliver', reasonCode: 'budget_ok' }], 'outbox', 'delivered'],
    [[{ decision: 'escalate', reasonCode: 'irreversible_hold' }], 'outbox', 'delivered'],
    [[{ decision: 'batch', reasonCode: 'batch_backlog' }], 'outbox', 'delivered'],
    [[{ decision: 'clarify', reasonCode: 'clarify_first' }], 'deferred', 'deferred-approval'],
    [[{ decision: 'hold', reasonCode: 'irreversible_hold' }], 'deferred', 'deferred-approval'],
    [[{ decision: 'defer', reasonCode: 'breakpoint_wait' }], 'deferred', 'deferred-window'],
    [[{ decision: 'defer', reasonCode: 'deferral_aging' }], 'deferred', 'deferred-window'],
    [[{ decision: 'suppress', reasonCode: 'quiet_hours' }], 'silence', 'quiet-hours'],
    [[{ decision: 'suppress', reasonCode: 'daily_budget' }], 'silence', 'budget-capped'],
    [[{ decision: 'suppress', reasonCode: 'hourly_budget' }], 'silence', 'budget-capped'],
    [[{ decision: 'suppress', reasonCode: 'cooldown' }], 'silence', 'cooldown'],
    [[{ decision: 'suppress', reasonCode: 'rejection_backoff' }], 'silence', 'cooldown'],
    [[{ decision: 'suppress', reasonCode: 'below_threshold' }], 'silence', 'below-threshold'],
    [[], 'silence', 'nothing-new'],
    [[{ decision: 'suppress', reasonCode: 'unknown_code' }], 'silence', 'below-threshold'],
  ]
  for (const [decisions, outcome, reason] of cases) {
    it(`${JSON.stringify(decisions)} → ${outcome}/${reason}`, () => {
      expect(classifyGovernanceRound(decisions)).toEqual({ outcome, reasonCode: reason })
    })
  }

  it('混合轮次优先级：任一 deliver 压过 defer/suppress', () => {
    expect(classifyGovernanceRound([
      { decision: 'suppress', reasonCode: 'cooldown' },
      { decision: 'deliver', reasonCode: 'budget_ok' },
    ])).toEqual({ outcome: 'outbox', reasonCode: 'delivered' })
  })

  it('全 suppress 取出现最多的原因', () => {
    expect(classifyGovernanceRound([
      { decision: 'suppress', reasonCode: 'quiet_hours' },
      { decision: 'suppress', reasonCode: 'quiet_hours' },
      { decision: 'suppress', reasonCode: 'below_threshold' },
    ])).toEqual({ outcome: 'silence', reasonCode: 'quiet-hours' })
  })
})

describe('记录校验与 JSONL 环形', () => {
  const valid = {
    runId: 'r1', runKind: 'kanban' as const, audience: 'human' as const,
    outcome: 'silence' as const, reasonCode: 'below-threshold' as const, refs: ['a'],
  }

  it('非法词表拒绝并给 problems（不抛）', () => {
    const bad = recordRunOutcome({ ...valid, runKind: 'nope' as never })
    expect(bad.recorded).toBe(false)
    expect(bad.problems.join()).toContain('runKind')
    const badReason = recordRunOutcome({ ...valid, reasonCode: 'made-up' as never })
    expect(badReason.recorded).toBe(false)
    expect(badReason.problems.join()).toContain('reasonCode')
    const badRefs = recordRunOutcome({ ...valid, refs: Array.from({ length: 21 }, (_, i) => `r${i}`) })
    expect(badRefs.recorded).toBe(false)
  })

  it('追加后可读回，坏行跳过并计数', () => {
    expect(recordRunOutcome(valid).recorded).toBe(true)
    expect(recordRunOutcome({ ...valid, runId: 'r2', outcome: 'outbox', reasonCode: 'delivered' }).recorded).toBe(true)
    writeFileSync(runOutcomeLedgerPath(), `${readFileSync(runOutcomeLedgerPath(), 'utf8')}{not json}\n`, 'utf8')
    const read = readRunOutcomes()
    expect(read.records.map((r) => r.runId)).toEqual(['r1', 'r2'])
    expect(read.badLines).toBe(1)
  })

  it('环形 2000 行：超限重写保留最近记录', () => {
    for (let i = 0; i < 2005; i += 1) recordRunOutcome({ ...valid, runId: `r${i}`, at: 1000 + i })
    const read = readRunOutcomes({ limit: 500 })
    expect(read.records.length).toBe(500)
    expect(read.records[read.records.length - 1].runId).toBe('r2004')
    const lines = readFileSync(runOutcomeLedgerPath(), 'utf8').split('\n').filter(Boolean)
    expect(lines.length).toBe(2000)
  })

  it('统计：沉默占比与原因分布；空账本 silenceShare=null', () => {
    expect(runOutcomeStats().silenceShare).toBeNull()
    recordRunOutcome(valid)
    recordRunOutcome({ ...valid, runId: 'r2', outcome: 'outbox', reasonCode: 'delivered' })
    recordRunOutcome({ ...valid, runId: 'r3', outcome: 'silence', reasonCode: 'quiet-hours' })
    const s = runOutcomeStats()
    expect(s.total).toBe(3)
    expect(s.byOutcome).toEqual({ silence: 2, outbox: 1 })
    expect(s.silenceShare).toBeCloseTo(2 / 3)
    expect(s.byReason['quiet-hours']).toBe(1)
  })
})

describe('Run 收口 REST', () => {
  let server: import('node:http').Server | undefined
  let base = ''
  beforeAll(async () => {
    const bodyParser = (await import('@koa/bodyparser')).default
    const Koa = (await import('koa')).default
    const { runOutcomeRouter } = await import('../run-outcome-controller')
    const app = new Koa()
    app.use(bodyParser())
    app.use(runOutcomeRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/hermes/run-outcome`
  })
  afterAll(() => { server?.close() })

  it('POST 词表外 400；合法 200；GET 过滤；stats', async () => {
    const bad = await fetch(base, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'x', runKind: 'bogus', audience: 'human', outcome: 'silence', reasonCode: 'below-threshold' }),
    })
    expect(bad.status).toBe(400)

    const ok = await fetch(base, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId: 'r1', runKind: 'loop', audience: 'human', outcome: 'deferred', reasonCode: 'deferred-window', refs: ['loop:1'] }),
    })
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { ok: boolean }).ok).toBe(true)

    const list = await fetch(`${base}?outcome=deferred`).then((r) => r.json() as Promise<{ records: Array<{ runId: string }> }>)
    expect(list.records.map((r) => r.runId)).toEqual(['r1'])
    const badFilter = await fetch(`${base}?outcome=bogus`)
    expect(badFilter.status).toBe(400)

    const stats = await fetch(`${base}/stats`).then((r) => r.json() as Promise<{ total: number; byOutcome: Record<string, number> }>)
    expect(stats.total).toBe(1)
    expect(stats.byOutcome.deferred).toBe(1)
  })
})
