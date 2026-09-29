// 4A 治理层运行态守门（spec 2026-09-29 §8 第二期 ②③④⑥）——消费关系/SLO/成本/审计四件。
//
// 全部走夹具（tmp sqlite/JSON/JSONL + 注入依赖），不碰主机真实 kanban.db/usage-store；
// 环境变量在逐例内 set/restore（HERMES_HOME/HERMES_PRICING_TABLE/HERMES_APPROVALS_LOG_FILE/
// GOVERNANCE_REPO/GOVERNANCE_SLO_BUDGET）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectAssigneeStats, collectSquadStats, deriveUsage, computeSloReport, costSummary,
} from '../governance-analytics'
import { auditLog } from '../governance-audit'
import { checkDispatchBudget, BudgetExhaustedError, resetBudgetCacheForTests } from '../governance-budget'
import type { LedgerDoc, MetricsDoc } from '../governance-ledger'

const NOW_S = 1_800_000_000

async function makeKanbanHome(rows: Array<Record<string, unknown>>): Promise<string> {
  const home = mkdtempSync(join(tmpdir(), 'gov-kanban-'))
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(home, 'kanban.db'))
  db.exec(`CREATE TABLE tasks (
    id TEXT PRIMARY KEY, title TEXT, body TEXT, assignee TEXT, status TEXT NOT NULL,
    priority INTEGER DEFAULT 0, created_by TEXT, created_at INTEGER NOT NULL,
    started_at INTEGER, completed_at INTEGER)`)
  const ins = db.prepare('INSERT INTO tasks (id, title, assignee, status, created_at, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  for (const [i, r] of rows.entries()) {
    ins.run(`t${i}`, 'x', r.assignee ?? null, r.status, r.created_at ?? NOW_S - 1000, r.started_at ?? null, r.completed_at ?? null)
  }
  db.close()
  return home
}

function makeSquadDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gov-squad-'))
  writeFileSync(join(dir, 'evaluations-0d45f5fd462b8c70.json'), JSON.stringify({
    squad: 'core',
    records: [
      { squad: 'core', leader: 'zcode', verdict: 'action', reason: 'r1', at: 1 },
      { squad: 'core', leader: 'zcode', verdict: 'no_action', reason: 'r2', at: 2 },
    ],
  }))
  return dir
}

const LEDGER: LedgerDoc = {
  version: 1,
  reviewedAt: '2026-09-29',
  domains: [{ id: 'engineering', name: '开发实现', owner: 'cuishi' }],
  capabilities: [{ id: 'eng.implement', domain: 'engineering', name: '卡片实现', object: '任务卡', action: '实现', importance: 'core', maturity: 'high' }],
  units: [
    { id: 'zcode', capability: 'eng.implement', primary: true, kind: 'coding-agent', owner: 'cuishi', lifecycle: 'active', sloTier: 'core', skills: [], reviewedAt: '2026-09-29' },
    { id: 'squad-core', capability: 'eng.implement', primary: false, kind: 'squad', owner: 'cuishi', lifecycle: 'active', sloTier: 'important', skills: [], reviewedAt: '2026-09-29' },
    { id: 'dev-crafter', capability: 'eng.implement', primary: false, kind: 'lane-specialist', owner: 'cuishi', lifecycle: 'active', sloTier: 'core', skills: [], reviewedAt: '2026-09-29' },
  ],
}

const METRICS: MetricsDoc = {
  version: 1,
  reviewedAt: '2026-09-29',
  verdicts: [],
  metrics: [],
  ...( { sloTargets: {
    core: { successRate: 0.95, windowDays: 30, minSamples: 3, budgetAction: 'freeze' },
    important: { successRate: 0.90, windowDays: 30, minSamples: 3, budgetAction: 'warn' },
  } } as object),
} as MetricsDoc

const ENV_KEYS = ['HERMES_HOME', 'HERMES_PRICING_TABLE', 'HERMES_APPROVALS_LOG_FILE', 'GOVERNANCE_REPO', 'GOVERNANCE_SLO_BUDGET'] as const
let savedEnv: Record<string, string | undefined> = {}
let tmpDirs: string[] = []

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  resetBudgetCacheForTests()
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('② 消费关系：kanban 实耗聚合与零调用候选', () => {
  it('collectAssigneeStats 聚合状态/时长/最近活动（root+boards 双库）', async () => {
    const home = await makeKanbanHome([
      { assignee: 'zcode', status: 'done', started_at: NOW_S - 900, completed_at: NOW_S - 100 },
      { assignee: 'zcode', status: 'blocked', created_at: NOW_S - 50 },
      { assignee: 'ghost-agent', status: 'archived', created_at: NOW_S - 90000, completed_at: NOW_S - 80000 },
    ])
    tmpDirs.push(home)
    // 分板库再挂一条（boards/* 聚合语义）
    mkdirSync(join(home, 'kanban', 'boards', 'b1'), { recursive: true })
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(home, 'kanban', 'boards', 'b1', 'kanban.db'))
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, body TEXT, assignee TEXT, status TEXT NOT NULL, priority INTEGER DEFAULT 0, created_by TEXT, created_at INTEGER NOT NULL, started_at INTEGER, completed_at INTEGER)')
    db.prepare('INSERT INTO tasks (id, title, assignee, status, created_at, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('b1t1', 'x', 'zcode', 'done', NOW_S - 5000, NOW_S - 4000, NOW_S - 3000)
    db.close()

    const stats = await collectAssigneeStats(home)
    const z = stats.get('zcode')
    expect(z?.total).toBe(3)
    expect(z?.done).toBe(2)
    expect(z?.blocked).toBe(1)
    expect(z?.durationsS.length).toBe(2)
    expect(stats.get('ghost-agent')?.archived).toBe(1)
  })

  it('deriveUsage 映射 coding-agent/squad/lane-specialist 三类并给零调用候选', async () => {
    const home = await makeKanbanHome([
      { assignee: 'zcode', status: 'done', started_at: NOW_S - 200, completed_at: NOW_S - 100 },
    ])
    tmpDirs.push(home)
    const squadDir = makeSquadDir()
    tmpDirs.push(squadDir)
    const assignee = await collectAssigneeStats(home)
    const squads = collectSquadStats(squadDir)
    const report = deriveUsage(LEDGER, assignee, squads, { now: NOW_S * 1000 })
    const z = report.perUnit.find((u) => u.unitId === 'zcode')
    expect(z?.mapped).toBe(true)
    expect(z?.source).toBe('kanban-assignee')
    expect(z?.lastUsedAt).toBe((NOW_S - 100) * 1000)
    const sq = report.perUnit.find((u) => u.unitId === 'squad-core')
    expect(sq?.source).toBe('squad-ledger')
    expect(sq?.lastUsedAt).toBeGreaterThan(0)
    const dc = report.perUnit.find((u) => u.unitId === 'dev-crafter')
    expect(dc?.mapped).toBe(false)
    expect(dc?.source).toBe('untracked')
    expect(report.zeroUseCandidates.map((u) => u.unitId)).not.toContain('zcode')
  })

  it('超 90 天未用入零调用候选；名册外活跃 assignee 入 unmappedAssignees', async () => {
    const home = await makeKanbanHome([
      { assignee: 'zcode', status: 'done', created_at: NOW_S - 100 * 86400, started_at: NOW_S - 100 * 86400, completed_at: NOW_S - 99 * 86400 },
      { assignee: 'orchestrator', status: 'done', started_at: NOW_S - 200, completed_at: NOW_S - 100 },
    ])
    tmpDirs.push(home)
    const report = deriveUsage(LEDGER, await collectAssigneeStats(home), new Map(), { now: NOW_S * 1000 })
    expect(report.zeroUseCandidates.map((u) => u.unitId)).toContain('zcode')
    expect(report.unmappedAssignees.map((a) => a.assignee)).toContain('orchestrator')
  })
})

describe('③ SLO 实况：分档成功率与预算判定', () => {
  it('computeSloReport 分档聚合、p95、minSamples 挂起、耗尽判定', async () => {
    const rows = [
      // core（zcode）：3 闭 1 成 → 33% < 95% 且样本=3 ≥ minSamples → 耗尽
      { assignee: 'zcode', status: 'done', started_at: NOW_S - 1000, completed_at: NOW_S - 900 },
      { assignee: 'zcode', status: 'archived', created_at: NOW_S - 800, completed_at: NOW_S - 700 },
      { assignee: 'zcode', status: 'archived', created_at: NOW_S - 600, completed_at: NOW_S - 500 },
      // 名册外：orchestrator 全成 → unmapped 桶，不进 core 预算
      { assignee: 'orchestrator', status: 'done', started_at: NOW_S - 400, completed_at: NOW_S - 100 },
    ]
    const home = await makeKanbanHome(rows)
    tmpDirs.push(home)
    const report = computeSloReport(LEDGER, METRICS, await collectAssigneeStats(home))
    const core = report.tiers.find((t) => t.tier === 'core')
    expect(core?.closed).toBe(3)
    expect(core?.done).toBe(1)
    expect(core?.successRate).toBeCloseTo(1 / 3, 5)
    expect(core?.p95DurationS).toBe(100)
    expect(core?.exhausted).toBe(true)
    expect(report.unmapped.closed).toBe(1)
    expect(report.unmapped.assignees).toContain('orchestrator')
  })

  it('样本不足 minSamples 预算判定挂起（不耗尽）', async () => {
    const home = await makeKanbanHome([
      { assignee: 'zcode', status: 'archived', created_at: NOW_S - 100, completed_at: NOW_S - 50 },
    ])
    tmpDirs.push(home)
    const report = computeSloReport(LEDGER, METRICS, await collectAssigneeStats(home))
    const core = report.tiers.find((t) => t.tier === 'core')
    expect(core?.exhausted).toBe(false)
    expect(core?.note).toContain('样本')
  })

  it('预算闸三模式：off 放行 / warn 告警放行 / enforce 抛 BudgetExhaustedError', async () => {
    const exhaustedReport = {
      windowDays: 30,
      tiers: [{ tier: 'core', target: { successRate: 0.95, windowDays: 30, minSamples: 3, budgetAction: 'freeze' as const }, closed: 10, done: 5, successRate: 0.5, p95DurationS: 60, exhausted: true }],
      unmapped: { closed: 0, done: 0, successRate: null, assignees: [] },
      dataAvailable: true,
    }
    const deps = { sloReport: async () => exhaustedReport, unitTier: () => 'core' }

    process.env.GOVERNANCE_SLO_BUDGET = 'off'
    expect((await checkDispatchBudget('zcode', deps)).allowed).toBe(true)

    process.env.GOVERNANCE_SLO_BUDGET = 'warn'
    const warnRes = await checkDispatchBudget('zcode', deps)
    expect(warnRes.allowed).toBe(true)
    expect(warnRes.note).toContain('预算耗尽')

    process.env.GOVERNANCE_SLO_BUDGET = 'enforce'
    await expect(checkDispatchBudget('zcode', deps)).rejects.toThrow(BudgetExhaustedError)
  })

  it('metrics.yaml sloTargets 过校验器（词表/区间/freeze 仅 core）', async () => {
    const { validateMetrics } = await import('../governance-ledger')
    expect(validateMetrics(METRICS)).toEqual([])
    const bad = { ...METRICS, sloTargets: { general: { successRate: 1.5, windowDays: 30, minSamples: 3, budgetAction: 'freeze' } } } as unknown as MetricsDoc
    const problems = validateMetrics(bad)
    expect(problems.some((p) => p.includes('successRate'))).toBe(true)
    expect(problems.some((p) => p.includes('freeze'))).toBe(true)
  })
})

describe('④ 成本归集：session_usage 聚合与价目折算', () => {
  it('costSummary 按 provider/profile 分桶、未收录模型如实标注', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gov-cost-'))
    tmpDirs.push(dir)
    const dbFile = join(dir, 'hermes-web-ui.db')
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbFile)
    db.exec(`CREATE TABLE session_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL DEFAULT '', run_id TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '', agent TEXT NOT NULL DEFAULT '', usage_scope TEXT NOT NULL DEFAULT 'run',
      purpose TEXT NOT NULL DEFAULT '', api_calls INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_tokens INTEGER NOT NULL DEFAULT 0, model TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '',
      profile TEXT NOT NULL DEFAULT 'default', is_estimated INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0)`)
    const ins = db.prepare('INSERT INTO session_usage (provider, model, profile, api_calls, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    ins.run('bigmodel', 'glm-4.6', 'zcode', 2, 2_000_000, 1_000_000, NOW_S)
    ins.run('bigmodel', 'glm-4.6', 'zcode', 1, 1_000_000, 500_000, NOW_S)
    ins.run('anthropic', 'claude-x', 'codex', 1, 1_000_000, 100_000, NOW_S)
    ins.run('other', 'unpriced-model', 'zcode', 1, 10_000, 5_000, NOW_S)
    db.close()

    const priceFile = join(dir, 'models.yaml')
    writeFileSync(priceFile, [
      'currency: CNY',
      'models:',
      '  glm-4.6:',
      '    input: { idle: 1.0, peak: 2.0 }',
      '    output: { idle: 2.0, peak: 4.0 }',
      '  claude-x:',
      '    input: { idle: 10.0, peak: 20.0 }',
      '    output: { idle: 30.0, peak: 60.0 }',
    ].join('\n'))
    process.env.HERMES_PRICING_TABLE = priceFile
    const { resetPricingCacheForTests } = await import('../../tokens/pricing')
    resetPricingCacheForTests()

    const summary = await costSummary(30, dbFile)
    expect(summary.dbFound).toBe(true)
    expect(summary.rows).toBe(4)
    const bigmodel = summary.byProvider.find((b) => b.key === 'bigmodel')
    // glm-4.6：3M in ×1~2 + 1.5M out ×2~4 → idle 3+3=6，peak 6+6=12
    expect(bigmodel?.costIdle).toBeCloseTo(6, 5)
    expect(bigmodel?.costPeak).toBeCloseTo(12, 5)
    const zcode = summary.byProfile.find((b) => b.key === 'zcode')
    expect(zcode?.calls).toBe(4)
    expect(summary.pricingMissing).toContain('unpriced-model')
    expect(summary.total.unpricedRows).toBe(1)
    resetPricingCacheForTests()
  })
})

describe('⑥ 统一审计：四源归一与降级', () => {
  it('approvals/domain/kanban 三源归一排序；provider 缺席如实 available:false', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gov-audit-'))
    tmpDirs.push(dir)
    // approvals 源（HERMES_APPROVALS_LOG_FILE 覆盖）
    writeFileSync(join(dir, 'history.json'), JSON.stringify([
      { id: 'a1', ts: 3000, actor: 'admin', targetKind: 'review', targetId: 'r1', targetTitle: '评审 X', decision: 'approve' },
    ]))
    process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'history.json')
    // domain 源（GOVERNANCE_REPO 覆盖）
    mkdirSync(join(dir, 'docs', 'governance'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'governance', 'domain-audit.jsonl'),
      JSON.stringify({ run: 'run-1', domain: 'L1', verdict: 'pass', checkedAt: '2026-09-29T01:00:00Z', evidence: ['x'] }) + '\n')
    process.env.GOVERNANCE_REPO = dir
    // kanban 源（HERMES_HOME 覆盖）
    const home = mkdtempSync(join(tmpdir(), 'gov-audit-kb-'))
    tmpDirs.push(home)
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(join(home, 'kanban.db'))
    db.exec('CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, run_id INTEGER, kind TEXT NOT NULL, payload TEXT, created_at INTEGER NOT NULL)')
    db.prepare('INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?, ?, ?, ?)')
      .run('t1', 'status_change', JSON.stringify({ to: 'done' }), 4000)
    db.close()
    process.env.HERMES_HOME = home

    const result = await auditLog({ limit: 50 })
    expect(result.ok).toBe(true)
    const sources = Object.fromEntries(result.sources.map((s) => [s.id, s.available]))
    expect(sources.approvals).toBe(true)
    expect(sources.domain).toBe(true)
    expect(sources.kanban).toBe(true)
    expect(sources.provider).toBe(false)
    // 归一排序按 ts 降序：domain(2026 真实日期) > kanban(4000s) > approvals(3000ms)
    expect(result.events[0]?.source).toBe('domain')
    const kanbanIdx = result.events.findIndex((e) => e.source === 'kanban')
    const approvalsIdx = result.events.findIndex((e) => e.source === 'approvals')
    expect(kanbanIdx).toBeGreaterThanOrEqual(0)
    expect(approvalsIdx).toBeGreaterThan(kanbanIdx)
    expect(result.events.some((e) => e.source === 'approvals' && e.result === 'approve')).toBe(true)
    // q 过滤
    const filtered = await auditLog({ q: '评审', limit: 50 })
    expect(filtered.events.every((e) => `${e.actor}${e.action}${e.target}${e.result}`.includes('评审'))).toBe(true)
  })
})
