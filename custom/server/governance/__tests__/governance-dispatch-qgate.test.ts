// 4A 治理层第三期守门——派发结果台账/派发统计/门禁通过率/成本能力维度/派单契约块。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  deriveUsage, dispatchStats, dedupeDispatchEntries, collectQgateRuns, costSummary,
} from '../governance-analytics'
import {
  appendDispatchOutcome, readDispatchLedger, dispatchLedgerPath,
  type DispatchLedgerEntry,
} from '../dispatch-ledger'
import type { LedgerDoc } from '../governance-ledger'

const ENV_KEYS = ['GOVERNANCE_DISPATCH_LEDGER', 'GOVERNANCE_QGATE_RUNS'] as const
let savedEnv: Record<string, string | undefined> = {}
let tmpDirs: string[] = []

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const LEDGER: LedgerDoc = {
  version: 1, reviewedAt: '2026-09-29',
  domains: [{ id: 'engineering', name: '开发实现', owner: 'cuishi' }],
  capabilities: [
    { id: 'eng.implement', domain: 'engineering', name: '卡片实现', object: '任务卡', action: '实现', importance: 'core', maturity: 'high' },
    { id: 'quality.review', domain: 'engineering', name: '代码评审', object: '变更', action: '评审', importance: 'core', maturity: 'high' },
  ],
  units: [
    { id: 'zcode', capability: 'eng.implement', primary: true, kind: 'coding-agent', owner: 'cuishi', lifecycle: 'active', sloTier: 'core', skills: [], reviewedAt: '2026-09-29' },
    { id: 'review-guard', capability: 'quality.review', primary: true, kind: 'lane-specialist', owner: 'cuishi', lifecycle: 'active', sloTier: 'core', skills: [], reviewedAt: '2026-09-29' },
  ],
}

function entry(partial: Partial<DispatchLedgerEntry> & { ts: number }): DispatchLedgerEntry {
  return { kind: 'mention', target: 'zcode', reason: 'queued', ...partial }
}

describe('派发结果台账（append-only + fail-soft + 覆盖路径）', () => {
  it('append→read 回读一致；坏行跳过；缺席文件空数组', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gov-dl-'))
    tmpDirs.push(dir)
    process.env.GOVERNANCE_DISPATCH_LEDGER = join(dir, 'ledger.jsonl')
    appendDispatchOutcome({ kind: 'mention', target: 'zcode', reason: 'queued', commandId: 'c1' })
    appendDispatchOutcome({ kind: 'column', target: 'zcode', specialist: 'review-guard', column: 'review', reason: 'coalesced', commandId: 'c1' })
    const entries = readDispatchLedger()
    expect(entries).toHaveLength(2)
    expect(entries[0].target).toBe('zcode')
    expect(entries[1].specialist).toBe('review-guard')
    // 坏行容忍
    writeFileSync(dispatchLedgerPath(), 'not-json\n' + entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
    expect(readDispatchLedger()).toHaveLength(2)
    // 缺席文件
    process.env.GOVERNANCE_DISPATCH_LEDGER = join(dir, 'absent.jsonl')
    expect(readDispatchLedger()).toEqual([])
  })

  it('写失败 fail-soft 不抛（不可写路径）', () => {
    process.env.GOVERNANCE_DISPATCH_LEDGER = '/nonexistent-root/x/ledger.jsonl'
    expect(() => appendDispatchOutcome({ kind: 'mention', target: 'zcode', reason: 'queued' })).not.toThrow()
  })
})

describe('派发统计（dispatchStats：去重/送达/暂缓/分单元）', () => {
  it('同 commandId 去重 column 优先 mention；queued/coalesced 计送达、deferred 计分母不计分子', () => {
    const entries = [
      entry({ ts: 1, kind: 'mention', target: 'zcode', commandId: 'c1', reason: 'queued' }),
      entry({ ts: 2, kind: 'column', target: 'zcode', specialist: 'review-guard', commandId: 'c1', reason: 'coalesced' }),
      entry({ ts: 3, kind: 'mention', target: 'zcode', commandId: 'c2', reason: 'engine_unreachable' }),
      entry({ ts: 4, kind: 'mention', target: 'zcode', commandId: 'c3', reason: 'deferred' }),
      entry({ ts: 5, kind: 'column', target: 'zcode', specialist: 'review-guard', reason: 'queued' }), // 无 commandId 保留
    ]
    const dedup = dedupeDispatchEntries(entries)
    expect(dedup.filter((e) => e.commandId === 'c1')).toHaveLength(1)
    expect(dedup.find((e) => e.commandId === 'c1')?.kind).toBe('column')
    const s = dispatchStats(entries)
    expect(s.dispatched).toBe(4) // c1(column)+c2+c3+无 id
    expect(s.delivered).toBe(2) // c1 coalesced + 无 id queued
    expect(s.deferred).toBe(1)
    expect(s.failed).toBe(1)
    expect(s.deliveredRate).toBeCloseTo(0.5, 5)
    const rg = s.byUnit.find((b) => b.key === 'review-guard')
    expect(rg?.dispatched).toBe(2)
    expect(rg?.delivered).toBe(2)
  })

  it('空台账零除保护（rate=null）', () => {
    const s = dispatchStats([])
    expect(s.deliveredRate).toBeNull()
    expect(s.dispatched).toBe(0)
  })
})

describe('消费关系第三期：dispatch-ledger 信号源接入 deriveUsage', () => {
  it('lane-specialist/coding-agent 经派发台账从 untracked 转 mapped', () => {
    const entries = [
      entry({ ts: 5_000_000_000_000, kind: 'column', target: 'zcode', specialist: 'review-guard', reason: 'queued' }),
      entry({ ts: 4_000_000_000_000, kind: 'mention', target: 'zcode', reason: 'queued' }),
    ]
    const report = deriveUsage(LEDGER, new Map(), new Map(), { dispatchEntries: entries, now: 5_000_000_864_000_00 })
    const rg = report.perUnit.find((u) => u.unitId === 'review-guard')
    expect(rg?.source).toBe('dispatch-ledger')
    expect(rg?.mapped).toBe(true)
    expect(rg?.note).toContain('引擎派发 1 次')
    const z = report.perUnit.find((u) => u.unitId === 'zcode')
    expect(z?.source).toBe('dispatch-ledger')
    // 无派发记录的单元仍 untracked（不虚标）
    const report2 = deriveUsage(LEDGER, new Map(), new Map(), {})
    expect(report2.perUnit.find((u) => u.unitId === 'review-guard')?.source).toBe('untracked')
  })

  it('kanban-assignee 优先于 dispatch-ledger（信号源优先级）', async () => {
    const entries = [entry({ ts: 1, kind: 'mention', target: 'zcode', reason: 'queued' })]
    const assignee = new Map([['zcode', {
      assignee: 'zcode', total: 3, done: 3, archived: 0, blocked: 0, inFlight: 0,
      lastActiveAt: 9_000_000_000_000, durationsS: [],
    }]])
    const report = deriveUsage(LEDGER, assignee, new Map(), { dispatchEntries: entries })
    expect(report.perUnit.find((u) => u.unitId === 'zcode')?.source).toBe('kanban-assignee')
  })
})

describe('门禁通过率（collectQgateRuns：.qgate/runs 扫描）', () => {
  it('多根扫描+六态归一小写+passRate 口径（NA 双侧剔除、conditional 计分母）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gov-qgate-'))
    tmpDirs.push(dir)
    const mk = (name: string, verdict: string, endedAt: number) =>
      writeFileSync(join(dir, name), JSON.stringify({ runId: name, verdict, endedAt }))
    mk('run-1.json', 'PASS', 2000)
    mk('run-2.json', 'PASS', 3000)
    mk('run-3.json', 'CONDITIONAL', 4000)
    mk('run-4.json', 'FAIL', 5000)
    mk('run-5.json', 'NOT_APPLICABLE', 6000)
    writeFileSync(join(dir, 'not-run.txt'), 'x')
    const stats = collectQgateRuns([dir])
    expect(stats.runs).toBe(5)
    expect(stats.byVerdict['pass']).toBe(2)
    expect(stats.byVerdict['conditional']).toBe(1)
    expect(stats.passRate).toBeCloseTo(2 / 4, 5) // NA 剔除：分母 4
    expect(stats.lastAt).toBe(6000)
    expect(stats.roots).toEqual([dir])
  })

  it('零 run 时 passRate=null（不虚报 100%）', () => {
    const stats = collectQgateRuns(['/nonexistent'])
    expect(stats.runs).toBe(0)
    expect(stats.passRate).toBeNull()
  })

  it('吸收轮：sourceDistribution 分桶（旧 run 无 sourceSignal 不入桶）+ advisoryRuns 计数', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gov-qgate31-'))
    tmpDirs.push(dir)
    const mk = (name: string, verdict: string, endedAt: number, extra?: Record<string, unknown>) =>
      writeFileSync(join(dir, name), JSON.stringify({ runId: name, verdict, endedAt, ...extra }))
    mk('run-1.json', 'PASS', 1000, { sourceSignal: { labels: ['verified'], bucket: 'verified' } })
    mk('run-2.json', 'PASS', 2000, { sourceSignal: { labels: ['declared'], bucket: 'declared' } })
    mk('run-3.json', 'PASS', 3000, { sourceSignal: { labels: ['degraded', 'verified'], bucket: 'degraded' } })
    mk('run-4.json', 'PASS', 4000, { sourceSignal: { labels: [], bucket: 'none' } })
    mk('run-5.json', 'CONDITIONAL', 5000, { sourceSignal: { labels: ['verified'], bucket: 'verified' } })
    mk('run-6.json', 'PASS', 6000) // 旧 run：无 sourceSignal
    mk('run-7.json', 'FAIL', 7000) // 非 PASS：不入桶
    const stats = collectQgateRuns([dir])
    expect(stats.sourceDistribution).toEqual({ verified: 2, declared: 1, degraded: 1, none: 1 })
    expect(stats.advisoryRuns).toBe(1)
  })
})

describe('qgate 逐门最新判定（collectQgateVerdicts：吸收轮判定流数据面）', () => {
  it('逐门取 endedAt 最新；六态→交付三态；domain/来源桶/条件透传；坏文件跳过', async () => {
    const { collectQgateVerdicts } = await import('../governance-analytics')
    const dir = mkdtempSync(join(tmpdir(), 'gov-qgatev-'))
    tmpDirs.push(dir)
    const mk = (name: string, row: Record<string, unknown>) =>
      writeFileSync(join(dir, name), JSON.stringify({ runId: name.replace(/\.json$/, ''), ...row }))
    // 同门两轮：新者胜
    mk('run-a1.json', { gateId: 'engineering.lint', domain: 'L1', verdict: 'FAIL', endedAt: 1000 })
    mk('run-a2.json', { gateId: 'engineering.lint', domain: 'L1', verdict: 'PASS', endedAt: 9000, sourceSignal: { labels: ['verified'], bucket: 'verified' } })
    mk('run-b.json', { gateId: 'l0.requirement-trace', domain: 'L0', verdict: 'CONDITIONAL', endedAt: 5000, conditions: ['clear it'] })
    mk('run-c.json', { gateId: 'delivery.debt', domain: 'L5', verdict: 'WAIVED', endedAt: 4000 })
    writeFileSync(join(dir, 'run-bad.json'), '{not json')
    const rows = collectQgateVerdicts([dir])
    expect(rows).toHaveLength(3)
    const lint = rows.find((r) => r.gateId === 'engineering.lint')!
    expect(lint.verdict).toBe('PASS')
    expect(lint.deliveryVerdict).toBe('pass')
    expect(lint.sourceBucket).toBe('verified')
    expect(lint.endedAt).toBe(9000)
    const rtm = rows.find((r) => r.gateId === 'l0.requirement-trace')!
    expect(rtm.deliveryVerdict).toBe('conditional')
    expect(rtm.conditions).toEqual(['clear it'])
    const waived = rows.find((r) => r.gateId === 'delivery.debt')!
    expect(waived.deliveryVerdict).toBe('conditional') // WAIVED≠pass，不洗白
    // 排序：endedAt 降序
    expect(rows[0].gateId).toBe('engineering.lint')
  })

  it('无 run → 空数组（如实，不编造）', async () => {
    const { collectQgateVerdicts } = await import('../governance-analytics')
    expect(collectQgateVerdicts(['/nonexistent'])).toEqual([])
  })
})

describe('成本能力维度归集（byCapability：profile→unit→capability）', () => {
  it('映射档入 capability 桶、未映射如实入 (未映射)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gov-cost3-'))
    tmpDirs.push(dir)
    const dbFile = join(dir, 'hermes-web-ui.db')
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbFile)
    db.exec(`CREATE TABLE session_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT DEFAULT '', run_id TEXT DEFAULT '', source TEXT DEFAULT '', agent TEXT DEFAULT '', usage_scope TEXT DEFAULT 'run', purpose TEXT DEFAULT '', api_calls INTEGER DEFAULT 0, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0, reasoning_tokens INTEGER DEFAULT 0, model TEXT DEFAULT '', provider TEXT DEFAULT '', profile TEXT DEFAULT 'default', is_estimated INTEGER DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0)`)
    const ins = db.prepare('INSERT INTO session_usage (provider, model, profile, api_calls, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const nowS = Math.floor(Date.now() / 1000)
    ins.run('bigmodel', 'glm-4.6', 'zcode', 2, 1_000_000, 500_000, nowS)
    ins.run('bigmodel', 'glm-4.6', 'default', 1, 500_000, 0, nowS)
    db.close()
    const summary = await costSummary(3650, dbFile, LEDGER)
    const impl = summary.byCapability.find((b) => b.key === 'eng.implement')
    expect(impl?.calls).toBe(2)
    expect(impl?.inputTokens).toBe(1_000_000)
    const unmapped = summary.byCapability.find((b) => b.key === '(未映射)')
    expect(unmapped?.calls).toBe(1)
  })
})
