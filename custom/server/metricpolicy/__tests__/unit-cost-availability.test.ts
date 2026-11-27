// 单位成本可得率读数守门（批 C，2026-11-28）：可估出成本的 Studio 会话占比。
// 口径限定（spec D13）：Studio 会话（session_usage）——看板任务的执行用量不进
// Studio 用量表，本读数不覆盖看板任务；定义原文写明，不假称全量。
// 夹具：tmp SQLite，session_id 与 cost_usd 两列造「可估／不可估」混合。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unitCostAvailability } from '../derive'

let dir = ''
let dbFile = ''
const nowS = Math.floor(Date.now() / 1000)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unit-cost-avail-'))
  dbFile = join(dir, 'hermes-web-ui.db')
  process.env.HARNESS_STUDIO_DB = dbFile
})

afterEach(() => {
  delete process.env.HARNESS_STUDIO_DB
  rmSync(dir, { recursive: true, force: true })
})

function makeDb(rows: Array<{ sessionId: string | null; costUsd: number | null; agoS: number }>): void {
  const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(dbFile)
  db.exec(`CREATE TABLE session_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, profile TEXT, model TEXT,
    input_tokens INTEGER, output_tokens INTEGER, created_at INTEGER,
    is_estimated INTEGER NOT NULL DEFAULT 0, cost_usd REAL, cost_source TEXT NOT NULL DEFAULT 'unknown'
  )`)
  const ins = db.prepare('INSERT INTO session_usage (session_id, profile, model, input_tokens, output_tokens, created_at, cost_usd, cost_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const r of rows) {
    ins.run(r.sessionId, 'p1', 'm1', 100, 50, nowS - r.agoS, r.costUsd, r.costUsd === null ? 'unknown' : 'priced')
  }
  db.close()
}

describe('measure/unit-cost-availability（批 C）', () => {
  it('定义与来源如实：Studio 会话口径，写明看板任务不在内', () => {
    const r = unitCostAvailability()
    expect(r.definition).toContain('Studio 会话')
    expect(r.definition).toContain('看板任务')
    expect(r.sources.join()).toContain('session_usage')
  })

  it('可估会话 2 / 总会话 4 = 0.5；样本 4 低于下限 5 → unavailable（不给小样本比例）', () => {
    makeDb([
      { sessionId: 's1', costUsd: 0.01, agoS: 100 },
      { sessionId: 's1', costUsd: 0.02, agoS: 90 },
      { sessionId: 's2', costUsd: null, agoS: 80 },
      { sessionId: 's3', costUsd: 0.03, agoS: 70 },
      { sessionId: 's4', costUsd: null, agoS: 60 },
    ])
    const r = unitCostAvailability()
    expect(r.available).toBe(false)
    expect(r.value).toBeNull()
    expect(r.sample).toBe(4)
    expect(r.gap).toContain('样本')
  })

  it('样本足 5：3/5 可估 = 0.6', () => {
    makeDb([
      { sessionId: 's1', costUsd: 0.01, agoS: 100 },
      { sessionId: 's2', costUsd: 0.02, agoS: 90 },
      { sessionId: 's3', costUsd: 0.03, agoS: 80 },
      { sessionId: 's4', costUsd: null, agoS: 70 },
      { sessionId: 's5', costUsd: null, agoS: 60 },
    ])
    const r = unitCostAvailability()
    expect(r.available).toBe(true)
    expect(r.value).toBe(0.6)
    expect(r.sample).toBe(5)
  })

  it('全部会话都不可估：算得出 0% 且如实提示（0% 是真实结论，不是缺席）', () => {
    makeDb([
      { sessionId: 's1', costUsd: null, agoS: 100 },
      { sessionId: 's2', costUsd: null, agoS: 90 },
      { sessionId: 's3', costUsd: null, agoS: 80 },
      { sessionId: 's4', costUsd: null, agoS: 70 },
      { sessionId: 's5', costUsd: null, agoS: 60 },
    ])
    const r = unitCostAvailability()
    expect(r.available).toBe(true)
    expect(r.value).toBe(0)
    expect(r.gap).toContain('0%')
  })

  it('用量库缺席：unavailable 并写明，不写 0%', () => {
    process.env.HARNESS_STUDIO_DB = join(dir, 'no-such.db')
    const r = unitCostAvailability()
    expect(r.available).toBe(false)
    expect(r.value).toBeNull()
    expect(r.gap).toContain('读不到')
  })

  it('表结构不认（缺 cost_usd 列）：unavailable 并写明，不抛错', () => {
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
    const db = new DatabaseSync(dbFile)
    db.exec('CREATE TABLE session_usage (id INTEGER PRIMARY KEY, session_id TEXT, created_at INTEGER)')
    db.close()
    const r = unitCostAvailability()
    expect(r.available).toBe(false)
    expect(r.gap).toContain('读不到')
  })

  it('窗口过滤：老会话（窗外）不进分母', () => {
    makeDb([
      { sessionId: 's1', costUsd: 0.01, agoS: 100 },
      { sessionId: 's2', costUsd: 0.02, agoS: 100 },
      { sessionId: 's3', costUsd: null, agoS: 100 },
      { sessionId: 's4', costUsd: null, agoS: 100 },
      { sessionId: 's5', costUsd: null, agoS: 100 },
      { sessionId: 'old', costUsd: null, agoS: 40 * 86_400 },
    ])
    const r = unitCostAvailability(7)
    expect(r.available).toBe(true)
    expect(r.sample).toBe(5)
  })
})
