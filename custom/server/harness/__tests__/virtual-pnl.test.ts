// overlay/custom/server/harness/__tests__/virtual-pnl.test.ts
// AI 虚拟损益表（六文调研轮 E）守门测试：单位产出成本拼装 + 异常检测 + 收益面诚实缺席。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildVirtualPnl, detectCostAnomalies } from '../virtual-pnl'

let home: string
let dbFile: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'vpl-'))
  mkdirSync(join(home, '.hermes', 'kanban', 'boards', 'b1'), { recursive: true })
  mkdirSync(join(home, 'data'), { recursive: true })
  dbFile = join(home, 'data', 'hermes-web-ui.db')
  process.env.HERMES_HOME = join(home, '.hermes')  // kanban 库根 = HERMES_HOME/kanban/boards/*
  process.env.HERMES_PL_DB = dbFile
  delete process.env.HERMES_PL_VALUE_MAP

  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(dbFile)
  db.exec(`
    CREATE TABLE session_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT, model TEXT, profile TEXT,
      api_calls INTEGER, input_tokens INTEGER, output_tokens INTEGER, created_at INTEGER
    );
  `)
  // coding-agent：窗内 3000+2000 tokens；模型名故意用未收录名 → unpricedRows 计数、成本 0
  const ins = db.prepare('INSERT INTO session_usage (provider, model, profile, api_calls, input_tokens, output_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const nowS = Math.floor(Date.now() / 1000)
  ins.run('p1', 'unpriced-model-x', 'coding-agent', 10, 3000, 2000, nowS - 100)
  // 另一 profile 无交付 → costPerDelivered=null 信号
  ins.run('p1', 'unpriced-model-x', 'idle-agent', 2, 100, 50, nowS - 50)
  db.close()

  // kanban 交付面：coding-agent done 4 archived 1 in-flight 2
  const kdb = new DatabaseSync(join(home, '.hermes', 'kanban', 'boards', 'b1', 'kanban.db'))
  kdb.exec('CREATE TABLE tasks (assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER)')
  const kins = kdb.prepare('INSERT INTO tasks (assignee, status, created_at, started_at, completed_at) VALUES (?, ?, ?, ?, ?)')
  for (let i = 0; i < 4; i++) kins.run('coding-agent', 'done', 1790000000, 1790000000, 1790003600)
  kins.run('coding-agent', 'archived', 1790000000, 1790000000, 1790003600)
  kins.run('coding-agent', 'todo', 1790000000, null, null)
  kins.run('coding-agent', 'doing', 1790000000, 1790000000, null)
  kdb.close()
})

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.HERMES_HOME
  delete process.env.HERMES_PL_DB
})

describe('virtual pnl', () => {
  it('行拼装：usage ∪ kanban 并集，交付计数与 token 面各归其位', async () => {
    const r = await buildVirtualPnl({ days: 30 })
    const coding = r.rows.find((x) => x.profile === 'coding-agent')
    expect(coding).toBeTruthy()
    expect(coding!.delivered).toBe(5)  // 4 done + 1 archived
    expect(coding!.inFlight).toBe(2)
    expect(coding!.tokens.input).toBe(3000)
    const idle = r.rows.find((x) => x.profile === 'idle-agent')
    expect(idle!.delivered).toBe(0)
    expect(idle!.costPerDeliveredIdle).toBeNull()  // 有花费无交付 → 不造单价
  })

  it('未收录模型：unpricedRows 计数、成本不计（不猜价）', async () => {
    const r = await buildVirtualPnl({ days: 30 })
    const coding = r.rows.find((x) => x.profile === 'coding-agent')!
    expect(coding.unpricedRows).toBeGreaterThan(0)
    expect(coding.costPeak).toBe(0)
  })

  it('收益面诚实缺席：未配置 HERMES_PL_VALUE_MAP 时不造 L 侧', async () => {
    const r = await buildVirtualPnl({ days: 30 })
    expect(r.benefitNote).toContain('不编造')
    expect(r.rows.every((x) => x.valueTotal === undefined)).toBe(true)
    expect(r._defs.value).toContain('HERMES_PL_VALUE_MAP')
  })

  it('口径字典齐备（可对账）', async () => {
    const r = await buildVirtualPnl({ days: 30 })
    for (const k of ['delivered', 'cost', 'unitCost', 'value', 'anomaly'] as const) {
      expect(r._defs[k].length).toBeGreaterThan(5)
    }
  })
})

describe('detectCostAnomalies（纯函数）', () => {
  it('8 日序列：末日 3× 均值 → 命中；平稳序列 → 无告警', () => {
    const flat = Array.from({ length: 8 }, (_, i) => ({ profile: 'a', day: `2026-10-0${i + 1}`, costPeak: 10 }))
    expect(detectCostAnomalies(flat)).toHaveLength(0)
    const spike = [...flat.slice(0, 7), { profile: 'a', day: '2026-10-08', costPeak: 30 }]
    const out = detectCostAnomalies(spike)
    expect(out).toHaveLength(1)
    expect(out[0].day).toBe('2026-10-08')
    expect(out[0].ratio).toBeCloseTo(3, 1)
  })

  it('前窗零成本（无基线）不算异常', () => {
    const series = [
      { profile: 'b', day: '2026-10-01', costPeak: 0 },
      { profile: 'b', day: '2026-10-02', costPeak: 0 },
      { profile: 'b', day: '2026-10-03', costPeak: 0 },
      { profile: 'b', day: '2026-10-04', costPeak: 0 },
      { profile: 'b', day: '2026-10-05', costPeak: 0 },
      { profile: 'b', day: '2026-10-06', costPeak: 0 },
      { profile: 'b', day: '2026-10-07', costPeak: 0 },
      { profile: 'b', day: '2026-10-08', costPeak: 100 },
    ]
    expect(detectCostAnomalies(series)).toHaveLength(0)
  })
})
