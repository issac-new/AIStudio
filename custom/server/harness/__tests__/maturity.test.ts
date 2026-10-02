// B3 L1-L5 成熟度自检守门：分级达成判定（纯函数）、指标缺数据不造数（null+note）、
// 证据必须引用实收数字；收集器在 tmpdir fixture 下逐源取数。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MaturityInputs } from '../maturity'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-mat-'))
})
afterEach(() => {
  for (const k of ['HERMES_HOME', 'HARNESS_STUDIO_DB', 'GOVERNANCE_DISPATCH_LEDGER', 'CHANGE_GOV_DB', 'HERMES_APPROVAL_RULES_FILE', 'GOVERNANCE_QGATE_GATE_PACKS', 'HERMES_MCP_CONFIG_DIR', 'HERMES_SKILLS_DIR', 'GOVERNANCE_REPO']) {
    delete process.env[k]
  }
  rmSync(dir, { recursive: true, force: true })
})

/** 全空输入（所有源缺席）——自检不许造数 */
function emptyInputs(): MaturityInputs {
  return {
    days: 7,
    capability: null,
    sessionsCount: null,
    dispatch: null,
    interventionsCount: null,
    auditSourcesAvailable: null,
    tokenTotal: null,
    tasksDoneInWindow: null,
    approvalRulesCount: null,
    changeRequestsCount: null,
    freezeWindowsTotal: null,
    gatePacksCount: null,
    reworkHours: null,
  }
}

/** 满配输入（数字全在档，L1-L3 必达、L4 介入率 10% 达标） */
function fullInputs(): MaturityInputs {
  return {
    days: 7,
    capability: { total: 12, bySource: { mcpcatalog: 4, extmarket: 5, 'registry-admin': 3 } },
    sessionsCount: 42,
    dispatch: { dispatched: 100, deliveredRate: 0.9, failedRate: 0.05 },
    interventionsCount: 10,
    auditSourcesAvailable: 4,
    tokenTotal: 100000,
    tasksDoneInWindow: 20,
    approvalRulesCount: 6,
    changeRequestsCount: 8,
    freezeWindowsTotal: 2,
    gatePacksCount: 16,
    reworkHours: 4.5,
  }
}

describe('纯函数：assessMaturity 数据缺席不造数', () => {
  it('全空输入：五级 achieved 全 null（无法判定），指标 value 全 null 且带 unavailable note', async () => {
    const { assessMaturity } = await import('../maturity')
    const r = assessMaturity(emptyInputs())
    expect(r.levels.map((l) => l.key)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5'])
    expect(r.levels.every((l) => l.achieved === null)).toBe(true)
    expect(r.levels.every((l) => l.items.every((i) => i.passed === null))).toBe(true)
    for (const m of r.metrics) {
      expect(m.value, `${m.key} 缺数据必须 null`).toBeNull()
      expect(m.note, `${m.key} 必须带 unavailable 说明`).toBeTruthy()
    }
    const mttr = r.metrics.find((m) => m.key === 'mttr')!
    expect(mttr.note).toContain('不造数')
    expect(r.meta.note).toContain('自检清单非认证')
  })

  it('派发数为 0（分母无效）：介入率 null 不按 0 凑', async () => {
    const { assessMaturity } = await import('../maturity')
    const inputs = { ...fullInputs(), dispatch: { dispatched: 0, deliveredRate: null, failedRate: null } }
    const r = assessMaturity(inputs)
    const rate = r.metrics.find((m) => m.key === 'human-intervention-rate')!
    expect(rate.value).toBeNull()
    const l4 = r.levels.find((l) => l.key === 'L4')!
    expect(l4.items[0].passed).toBeNull()
  })
})

describe('纯函数：分级达成 + 证据', () => {
  it('满配输入：L1-L5 全达成，证据引用实收数字，指标值可复算', async () => {
    const { assessMaturity } = await import('../maturity')
    const r = assessMaturity(fullInputs())
    for (const lv of r.levels) expect(lv.achieved, `${lv.key} 应达成`).toBe(true)
    // 证据引用实收数字（抽样断言）
    const l1 = r.levels.find((l) => l.key === 'L1')!
    expect(l1.items[0].evidence).toContain('12')
    expect(l1.items[0].evidence).toContain('mcpcatalog 4')
    const l4 = r.levels.find((l) => l.key === 'L4')!
    expect(l4.items[0].metric).toBe('human-intervention-rate')
    expect(l4.items[0].evidence).toContain('10')
    // 指标复算
    const rate = r.metrics.find((m) => m.key === 'human-intervention-rate')!
    expect(rate.value).toBeCloseTo(0.1)
    const cost = r.metrics.find((m) => m.key === 'cost-per-task')!
    expect(cost.value).toBe(5000)
    const audit = r.metrics.find((m) => m.key === 'audit-completeness')!
    expect(audit.value).toBe(1)
  })

  it('高介入率/低送达率：L4 未达成（achieved=false），单级失败不牵连他级', async () => {
    const { assessMaturity } = await import('../maturity')
    const bad = {
      ...fullInputs(),
      interventionsCount: 80, // 80/100 = 80% > 30%
      dispatch: { dispatched: 100, deliveredRate: 0.5, failedRate: 0.4 },
    }
    const r = assessMaturity(bad)
    expect(r.levels.find((l) => l.key === 'L4')!.achieved).toBe(false)
    expect(r.levels.find((l) => l.key === 'L1')!.achieved).toBe(true)
  })
})

describe('收集器：collectMaturityInputs 逐源取数（tmpdir fixture）', () => {
  it('studio 假库 + 空派发台账 + 空 gate-packs + rules.json：字段逐一对上事实源', async () => {
    // studio db：2 会话 1000 tokens
    const dbFile = join(dir, 'studio.db')
    const db = new DatabaseSync(dbFile)
    db.exec(`CREATE TABLE sessions (
      id TEXT PRIMARY KEY, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0, last_active INTEGER DEFAULT 0)`)
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?)').run('s1', 600, 400, 0, 0, 0, Math.floor(Date.now() / 1000))
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,?)').run('s2', 0, 0, 0, 0, 0, Math.floor(Date.now() / 1000))
    db.close()
    process.env.HARNESS_STUDIO_DB = dbFile
    // 派发台账：空文件（窗口内 0 条 → dispatched 0）
    const ledger = join(dir, 'dispatch-ledger.jsonl')
    writeFileSync(ledger, '')
    process.env.GOVERNANCE_DISPATCH_LEDGER = ledger
    // approval rules：2 条
    const rules = join(dir, 'rules.json')
    writeFileSync(rules, JSON.stringify({ defaultMode: 'ask', rules: [{ tool: 'bash' }, { tool: 'edit' }] }))
    process.env.HERMES_APPROVAL_RULES_FILE = rules
    // gate-packs：2 个门禁包（_profiles 不计）
    const packs = join(dir, 'gate-packs')
    mkdirSync(join(packs, 'persistence'), { recursive: true })
    mkdirSync(join(packs, 'security'))
    mkdirSync(join(packs, '_profiles'))
    process.env.GOVERNANCE_QGATE_GATE_PACKS = packs
    // 三系缺席（HERMES_HOME 空目录 + 无 mcp/skills/registry）
    process.env.HERMES_HOME = join(dir, 'home', '.hermes')
    process.env.HERMES_MCP_CONFIG_DIR = join(dir, 'no-mcp')
    process.env.HERMES_SKILLS_DIR = join(dir, 'no-skills')
    process.env.GOVERNANCE_REPO = join(dir, 'no-repo')
    // change-gov：空库（走真 store 建库）
    process.env.CHANGE_GOV_DB = join(dir, 'cg.db')
    const store = await import('../../governance/change-governance-store')
    store.resetChangeGovDbForTest()
    store.listRequests({})

    const { collectMaturityInputs } = await import('../maturity')
    const inputs = await collectMaturityInputs(7)
    expect(inputs.sessionsCount).toBe(2)
    expect(inputs.tokenTotal).toBe(1000)
    expect(inputs.dispatch).toEqual({ dispatched: 0, deliveredRate: null, failedRate: null })
    expect(inputs.approvalRulesCount).toBe(2)
    expect(inputs.gatePacksCount).toBe(2)
    expect(inputs.changeRequestsCount).toBe(0)
    expect(inputs.capability?.total).toBe(0) // 三系缺席 → 目录空（可用但 0 条）
    // capability null 判定：三系聚合本身不炸（available:false 聚合仍返回）
    expect(inputs.capability).not.toBeNull()

    const { assessMaturity } = await import('../maturity')
    const r = assessMaturity(inputs)
    // 三系全空 → L1 未达成（目录 0 条），证据如实
    expect(r.levels.find((l) => l.key === 'L1')!.achieved).toBe(false)
    // mttr 恒 unavailable
    expect(r.metrics.find((m) => m.key === 'mttr')!.value).toBeNull()
  })
})
