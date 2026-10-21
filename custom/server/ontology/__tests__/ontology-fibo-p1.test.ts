// P1 基础件守门（2026-10-21）：版本锁、术语表、数据源映射、报告证据。
import { describe, expect, it } from 'vitest'
import { FIBO_MODULES, FIBO_SOURCE, fiboPackSummary, mergeFiboPack } from '../ontology-fibo'
import { fiboEvidence } from '../ontology-fibo-evidence'
import { fiboGlossary } from '../ontology-fibo-glossary'
import { FIBO_LOCK, fiboLockReport } from '../ontology-fibo-lock'
import { fiboMappings } from '../ontology-fibo-mapping'
import { seedInstances, seedSpec } from '../ontology-seed'

describe('P1 版本锁', () => {
  it('锁与包同版本，19 个模块零漂移', () => {
    const r = fiboLockReport()
    expect(r.ok).toBe(true)
    expect(r.sourceMatches).toBe(true)
    expect(r.drift).toEqual([])
    expect(r.tag).toBe(FIBO_SOURCE.release)
    expect(r.commit).toBe(FIBO_LOCK.commit)
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(r.moduleCount).toBe(Object.keys(FIBO_MODULES).length)
  })

  it('每个 FIBO 模块在锁文件里都有 versionIRI（Commons 允许空串）', () => {
    for (const key of Object.keys(FIBO_MODULES)) {
      expect((FIBO_LOCK.modules as Record<string, string>)[key], `锁缺 ${key}`).toBeDefined()
    }
  })
})

describe('P1 术语表', () => {
  const glossary = fiboGlossary()
  const pack = fiboPackSummary()

  it('37 个概念逐条在册，IRI 与包同锚', () => {
    expect(glossary.counts.terms).toBe(37)
    const iris = new Set(pack.concepts.map((c) => c.iri))
    for (const e of glossary.entries) expect(iris.has(e.iri), `${e.id} → ${e.iri}`).toBe(true)
  })

  it('Authorization/Capture 标工程扩展，不冒充 FIBO', () => {
    for (const id of ['Authorization', 'Capture']) {
      const e = glossary.entries.find((x) => x.id === id)
      expect(e?.origin).toBe('local-extension')
      expect(e?.iri.startsWith('https://swarm.studio/ns/')).toBe(true)
    }
  })

  it('别名非空且同一概念内不重复', () => {
    for (const e of glossary.entries) {
      expect(e.aliases.length).toBeGreaterThan(0)
      expect(new Set(e.aliases).size).toBe(e.aliases.length)
    }
  })

  it('报告词表只挑金融相关词条，映射/关联/未映射三档如实登记', () => {
    expect(glossary.reportTerms).toHaveLength(5)
    expect(glossary.counts.mappedReportTerms).toBe(2)
    expect(glossary.reportTerms.filter((t) => t.relation === 'unmapped')).toHaveLength(3)
    for (const t of glossary.reportTerms) {
      expect(t.note.length).toBeGreaterThan(5)
      if (t.relation !== 'unmapped') expect(t.conceptId).toBeTruthy()
    }
  })
})

describe('P1 数据源映射', () => {
  const mappings = fiboMappings()
  const pack = fiboPackSummary()

  it('37 个概念每个都有登记行', () => {
    expect(mappings.counts.total).toBe(37)
    const ids = new Set(mappings.rows.map((r) => r.conceptId))
    for (const c of pack.concepts) expect(ids.has(c.id), `缺映射行 ${c.id}`).toBe(true)
  })

  it('mapped 行至少一个物理载体；unmapped 行必须有原因', () => {
    for (const r of mappings.rows) {
      if (r.status === 'mapped') {
        expect(r.kanban.length + r.runs.length + r.reports.length + r.api.length).toBeGreaterThan(0)
      } else {
        expect(r.note?.length ?? 0).toBeGreaterThan(5)
      }
    }
    expect(mappings.counts.mapped).toBeGreaterThanOrEqual(15)
    expect(mappings.counts.mapped + mappings.counts.unmapped).toBe(37)
  })

  it('支付/账户/结算关键概念已接载体', () => {
    const byId = new Map(mappings.rows.map((r) => [r.conceptId, r]))
    for (const id of ['Payment', 'Account', 'IndividualTransaction', 'SettlementEvent', 'Authorization', 'Capture']) {
      expect(byId.get(id)?.status, `${id} 未映射`).toBe('mapped')
    }
  })
})

describe('P1 报告证据', () => {
  it('未导入时如实写「未导入」，不写 0/37', () => {
    const e = fiboEvidence(seedSpec(0), seedInstances(0), 0)
    expect(e.coverage.imported).toBe(false)
    expect(e.coverage.applied).toBe(0)
    expect(e.coverage.total).toBe(37)
    expect(e.markdown).toContain('未导入')
    expect(e.markdown).not.toContain('0/37')
    expect(e.lock.ok).toBe(true)
    expect(e.gate.concepts).toBe(37)
  })

  it('导入后写 37/37 与三档健康度', () => {
    const merged = mergeFiboPack(seedSpec(0), 0)
    const spec = merged.spec!
    const e = fiboEvidence(spec, seedInstances(0), 0)
    expect(e.coverage.imported).toBe(true)
    expect(e.coverage.ratio).toBe('37/37')
    expect(e.health).toEqual({ error: 0, warning: 0, info: 0 })
    expect(e.markdown).toContain('37/37')
    expect(e.markdown).toContain('master_2026Q3')
    expect(e.source.commit).toBe(FIBO_LOCK.commit)
  })
})
