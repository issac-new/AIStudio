// B4 八工程原语守门：静态定义完整性（八原语/四属性/锚点非空）、覆盖矩阵汇总口径、
// 活体计数（tmpdir fixture：板库/会话库/rules.json/gate-packs）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HARNESS_PRIMITIVES, COVERAGE_ATTRIBUTES } from '../primitives'
import type { PrimitiveCounts } from '../primitives'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-pri-'))
  process.env.HERMES_HOME = join(dir, 'home', '.hermes')
})
afterEach(() => {
  for (const k of ['HERMES_HOME', 'HARNESS_STUDIO_DB', 'HERMES_APPROVAL_RULES_FILE', 'GOVERNANCE_QGATE_GATE_PACKS', 'HERMES_MCP_CONFIG_DIR', 'HERMES_SKILLS_DIR', 'GOVERNANCE_REPO']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

function fakeCounts(): PrimitiveCounts {
  return { task: 10, session: 20, state: null, tool: 30, memory: null, permission: 5, evaluation: 16, audit: 99 }
}

describe('静态定义：八原语四属性锚点齐全', () => {
  it('恰八原语，key 唯一，属性枚举合法，锚点非空', () => {
    expect(HARNESS_PRIMITIVES.length).toBe(8)
    expect(new Set(HARNESS_PRIMITIVES.map((p) => p.key)).size).toBe(8)
    expect(HARNESS_PRIMITIVES.map((p) => p.key)).toEqual([
      'task', 'session', 'state', 'tool', 'memory', 'permission', 'evaluation', 'audit',
    ])
    for (const p of HARNESS_PRIMITIVES) {
      expect(p.anchors.length, `${p.key} 锚点`).toBeGreaterThan(0)
      expect(p.lifecycle.length, `${p.key} 生命周期`).toBeGreaterThan(0)
      for (const attr of COVERAGE_ATTRIBUTES) {
        expect(['有', '部分', '缺'], `${p.key}.${attr}`).toContain(p.coverage[attr])
      }
    }
  })

  it('版本属性是当前最大缺口面（报告四要素批评的如实呈现）', () => {
    // 现实归纳：八原语无一个版本属性为「有」——这是缺口报告价值所在，不是断言理想态
    expect(HARNESS_PRIMITIVES.every((p) => p.coverage.version !== '有')).toBe(true)
    expect(HARNESS_PRIMITIVES.filter((p) => p.coverage.version === '缺').length).toBeGreaterThanOrEqual(4)
  })
})

describe('覆盖矩阵：buildPrimitivesReport', () => {
  it('每属性三态计数和=8；fullyCovered 口径=四属性全「有」', async () => {
    const { buildPrimitivesReport } = await import('../primitives')
    const report = buildPrimitivesReport(fakeCounts())
    expect(report.primitives.length).toBe(8)
    for (const attr of COVERAGE_ATTRIBUTES) {
      const b = report.matrix.byAttribute[attr]
      expect(b['有'] + b['部分'] + b['缺'], `${attr} 三态和`).toBe(8)
    }
    const expectedFull = HARNESS_PRIMITIVES.filter(
      (p) => COVERAGE_ATTRIBUTES.every((attr) => p.coverage[attr] === '有'),
    ).length
    expect(report.matrix.fullyCovered).toBe(expectedFull)
    // 活体计数挂行 + 缺席行有 note
    expect(report.primitives.find((p) => p.key === 'task')!.liveCount).toBe(10)
    expect(report.primitives.find((p) => p.key === 'state')!.liveCountNote).toBeTruthy()
  })
})

describe('活体计数收集器（tmpdir fixture）', () => {
  it('板库任务数 + 会话库数 + rules 数 + gate-packs 数（_ 前缀不计）', async () => {
    // 板库 2 个板共 3 任务
    for (const [slug, n] of [['b1', 2], ['b2', 1]] as const) {
      const boardDir = join(dir, 'home', '.hermes', 'kanban', 'boards', slug)
      mkdirSync(boardDir, { recursive: true })
      const db = new DatabaseSync(join(boardDir, 'kanban.db'))
      db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER)')
      for (let i = 0; i < n; i++) db.prepare('INSERT INTO tasks VALUES (?,?,?,?,1,1,2)').run(`${slug}-t${i}`, 'x', 'a', 'done')
      db.close()
    }
    // 会话库 2 会话
    const dbFile = join(dir, 'studio.db')
    const sdb = new DatabaseSync(dbFile)
    sdb.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY)')
    sdb.prepare('INSERT INTO sessions VALUES (?)').run('s1')
    sdb.prepare('INSERT INTO sessions VALUES (?)').run('s2')
    sdb.close()
    process.env.HARNESS_STUDIO_DB = dbFile
    // rules 2 条
    const rules = join(dir, 'rules.json')
    writeFileSync(rules, JSON.stringify({ defaultMode: 'ask', rules: [{ tool: 'a' }, { tool: 'b' }] }))
    process.env.HERMES_APPROVAL_RULES_FILE = rules
    // gate-packs：2 包 + _profiles + 散文件
    const packs = join(dir, 'gate-packs')
    mkdirSync(join(packs, 'llm'), { recursive: true })
    mkdirSync(join(packs, 'ops'))
    mkdirSync(join(packs, '_profiles'))
    writeFileSync(join(packs, 'README.md'), 'x')
    process.env.GOVERNANCE_QGATE_GATE_PACKS = packs
    // 三系缺席 → 工具数 0（目录聚合可用但空）
    process.env.HERMES_MCP_CONFIG_DIR = join(dir, 'no-mcp')
    process.env.HERMES_SKILLS_DIR = join(dir, 'no-skills')
    process.env.GOVERNANCE_REPO = join(dir, 'no-repo')

    const { collectPrimitiveCounts, countGatePacks, countApprovalRules } = await import('../primitives')
    expect(countGatePacks()).toBe(2)
    expect(countApprovalRules()).toBe(2)
    const { counts, notes } = await collectPrimitiveCounts()
    expect(counts.task).toBe(3)
    expect(counts.session).toBe(2)
    expect(counts.permission).toBe(2)
    expect(counts.evaluation).toBe(2)
    expect(counts.tool).toBe(0)
    expect(counts.state).toBeNull()
    expect(counts.memory).toBeNull()
    expect(notes.state).toBeTruthy()
    expect(notes.memory).toBeTruthy()
    expect(notes.audit).toBeTruthy() // 采样口径 note 恒在
  })

  it('rules.json 缺席：计数 0（在档为零）而非 null；gate-packs 缺席同', async () => {
    const { countApprovalRules, countGatePacks } = await import('../primitives')
    process.env.HERMES_APPROVAL_RULES_FILE = join(dir, 'nope-rules.json')
    process.env.GOVERNANCE_QGATE_GATE_PACKS = join(dir, 'nope-packs')
    expect(countApprovalRules()).toBe(0)
    expect(countGatePacks()).toBe(0)
  })
})
