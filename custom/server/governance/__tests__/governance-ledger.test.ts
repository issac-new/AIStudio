// 4A 治理层一致性守门（spec 2026-09-29 §3.3）——能力台账与语义指标层的跨制品对账。
//
// 断言分两级（沿用 enforce 分级先例）：
//   strict（红即不过）：schema 完整、主承载唯一、columns/squads/roster 引用全入账、
//     标签词法对齐协议、判定词表与 qgate 六态一致。
//   warn（只提醒不挡）：reviewedAt 超 90 天保鲜清单、active 条目无任何 refs 锚点。
// 校验逻辑单一事实源在 ../governance-ledger.ts（运行时 REST 投影与本文共用），
// 本文只承载跨制品对账（columns.yaml/squads.yaml/patch 404/qgate 词表）。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import {
  loadCapabilityLedger,
  loadMetricsDefs,
  deriveLedgerStats,
} from '../governance-ledger'

const ROOT = resolve(__dirname, '../../../..')

function parseYamlFile(rel: string): unknown {
  const { parse } = require('yaml') as typeof import('yaml')
  return parse(readFileSync(resolve(ROOT, rel), 'utf8'))
}

const ledgerRes = loadCapabilityLedger()
const metricsRes = loadMetricsDefs()

describe('4A 治理层：能力台账 schema 与红线（strict 1/2/6/8）', () => {
  it('台账存在且零 problems（含主承载唯一/词表/标签词法/refs 实物存在）', () => {
    expect(ledgerRes.exists, 'capability-ledger.yaml 未找到').toBe(true)
    expect(ledgerRes.problems, `台账校验问题：\n${ledgerRes.problems.join('\n')}`).toEqual([])
  })

  it('指标层存在且零 problems', () => {
    expect(metricsRes.exists, 'metrics.yaml 未找到').toBe(true)
    expect(metricsRes.problems, `指标层校验问题：\n${metricsRes.problems.join('\n')}`).toEqual([])
  })
})

describe('4A 治理层：columns.yaml 列编排引用全入账（strict 3）', () => {
  it('每个 step.specialist 标签在台账有同名 L3 条目', () => {
    const columns = parseYamlFile('runtime/roster/columns.yaml') as {
      columns?: Record<string, { steps?: Array<{ specialist?: string }> }>
    }
    const labels = new Set<string>()
    for (const col of Object.values(columns?.columns ?? {})) {
      for (const step of col?.steps ?? []) {
        if (step.specialist) labels.add(step.specialist)
      }
    }
    expect(labels.size, 'columns.yaml 未解析到任何 specialist').toBeGreaterThan(0)
    const unitIds = new Set((ledgerRes.doc?.units ?? []).map((u) => u.id))
    for (const label of labels) {
      expect(unitIds.has(label), `列编排 specialist「${label}」未入能力台账`).toBe(true)
    }
  })
})

describe('4A 治理层：squads.yaml 成员全入账（strict 4）', () => {
  it('每个 squad leader 与 member 在台账有 L3 条目', () => {
    const squads = parseYamlFile('runtime/roster/squads.yaml') as {
      squads?: Record<string, { leader?: string; members?: string[] }>
    }
    const members = new Set<string>()
    for (const s of Object.values(squads?.squads ?? {})) {
      if (s.leader) members.add(s.leader)
      for (const m of s.members ?? []) members.add(m)
    }
    expect(members.size, 'squads.yaml 未解析到任何成员').toBeGreaterThan(0)
    const unitIds = new Set((ledgerRes.doc?.units ?? []).map((u) => u.id))
    for (const m of members) {
      expect(unitIds.has(m), `squad 成员「${m}」未入能力台账`).toBe(true)
    }
  })
})

describe('4A 治理层：agent-roster 角色目录全入账（strict 5）', () => {
  it('patch 404 DEFAULT_ROLE_CATALOG 每个角色有 role-<名> 条目', () => {
    const patchPath = resolve(ROOT, 'patches/404-agent-roster-config-layer.patch')
    expect(existsSync(patchPath), 'patch 404 不存在——角色目录单一事实源丢失').toBe(true)
    const text = readFileSync(patchPath, 'utf8')
    const m = text.match(/DEFAULT_ROLE_CATALOG[^()]*\(([^)]*)\)/s)
    expect(m, 'patch 404 中未找到 DEFAULT_ROLE_CATALOG 元组（结构变更须同步本守门）').toBeTruthy()
    const roles = [...m![1].matchAll(/"([a-z-]+)"/g)].map((r) => r[1])
    expect(roles.length, '角色目录解析为空').toBeGreaterThanOrEqual(9)
    const unitIds = new Set((ledgerRes.doc?.units ?? []).map((u) => u.id))
    for (const role of roles) {
      expect(unitIds.has(`role-${role}`), `名册角色「${role}」未入能力台账（期望条目 role-${role}）`).toBe(true)
    }
  })
})

describe('4A 治理层：判定词表与 qgate 六态对齐（strict 7）', () => {
  const CANONICAL = ['pass', 'fail', 'conditional', 'inconclusive', 'waived', 'not_applicable']

  it('metrics.yaml verdicts 恰好为 qgate 六态', () => {
    const ids = (metricsRes.doc?.verdicts ?? []).map((v) => v.id).sort()
    expect(ids).toEqual([...CANONICAL].sort())
  })

  it('qgate SKILL.md 仍持六态词表（反向漂移守卫）', () => {
    const skillPath = resolve(ROOT, 'custom/qgate/plugin/skills/quality-gate/SKILL.md')
    expect(existsSync(skillPath), 'qgate SKILL.md 不存在').toBe(true)
    const text = readFileSync(skillPath, 'utf8')
    for (const id of CANONICAL) {
      expect(text, `qgate 词表缺 ${id.toUpperCase()}——若 qgate 改词表须同步 metrics.yaml`).toContain(id.toUpperCase())
    }
  })

  it('fail 语义含「词面相似不构成判定依据」（G5 误判复盘产物不回退）', () => {
    const fail = (metricsRes.doc?.verdicts ?? []).find((v) => v.id === 'fail')
    expect(fail?.semantics ?? '').toContain('词面相似不构成判定依据')
  })
})

describe('4A 治理层：保鲜与存量信号（warn 9/10，只提醒不挡）', () => {
  it('输出 reviewedAt 超期清单与无锚点条目（供治理批复核）', () => {
    if (!ledgerRes.doc) return
    const stats = deriveLedgerStats(ledgerRes.doc)
    if (stats.stale.length > 0) {
      console.warn(`[4A-warn] reviewedAt 超 ${90} 天条目 ${stats.stale.length} 个：${stats.stale.map((s) => `${s.id}(${s.days}d)`).join(', ')}`)
    }
    const anchorless = ledgerRes.doc.units.filter((u) => u.lifecycle === 'active' && !u.refs?.file && !u.refs?.note)
    if (anchorless.length > 0) {
      console.warn(`[4A-warn] active 但无任何 refs 锚点：${anchorless.map((u) => u.id).join(', ')}`)
    }
    expect(true).toBe(true)
  })
})

describe('4A 治理层：GOVERNANCE_DIR 覆盖（对齐 HERMES_COLUMNS_FILE 先例）', () => {
  it('环境变量指向即读指定目录（恢复后仍读仓内真源）', async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'gov-dir-'))
    writeFileSync(join(dir, 'capability-ledger.yaml'), 'version: 1\nreviewedAt: "2026-09-29"\ndomains: []\ncapabilities: []\nunits: []\n')
    process.env.GOVERNANCE_DIR = dir
    try {
      const { loadCapabilityLedger: loadFresh } = await import('../governance-ledger')
      const res = loadFresh()
      expect(res.exists).toBe(true)
      expect(res.path).toBe(join(dir, 'capability-ledger.yaml'))
      expect(res.doc?.units).toEqual([])
    } finally {
      delete process.env.GOVERNANCE_DIR
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('4A 治理层：REST 投影（HTTP 200 实证，同款 Koa 挂载模式）', () => {
  it('/api/governance/ledger 与 /api/governance/metrics-defs 返回实解内容', async () => {
    const { createServer } = await import('http')
    const Koa = (await import('koa')).default
    const { governanceRoutes } = await import('../governance-controller')
    const app = new Koa()
    app.use(governanceRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    try {
      const ledgerHttp = await fetch(`http://127.0.0.1:${port}/api/governance/ledger`)
      expect(ledgerHttp.status).toBe(200)
      const ledgerBody = await ledgerHttp.json() as { ok: boolean; doc: { units: unknown[] }; stats: { counts: { units: number } }; problems: string[] }
      expect(ledgerBody.ok).toBe(true)
      expect(ledgerBody.problems).toEqual([])
      expect(ledgerBody.doc.units.length).toBeGreaterThanOrEqual(27)
      expect(ledgerBody.stats.counts.units).toBe(ledgerBody.doc.units.length)

      const metricsHttp = await fetch(`http://127.0.0.1:${port}/api/governance/metrics-defs`)
      expect(metricsHttp.status).toBe(200)
      const metricsBody = await metricsHttp.json() as { ok: boolean; doc: { verdicts: Array<{ id: string }> } }
      expect(metricsBody.ok).toBe(true)
      expect(metricsBody.doc.verdicts.map((v) => v.id)).toContain('fail')
    } finally {
      server.close()
    }
  })
})
