// FIBO 金融域对齐包守门（2026-10-21 深调研）：
//   1. 每个 FIBO 概念的 IRI 必须落在其声明模块的 base 下（防「名义 FIBO」）；
//   2. FIBO 已迁移到 OMG Commons 的 Party/Identifier 标 origin=commons；
//   3. Authorization/Capture 全仓无对应类，必须标 local-extension 且不得带 FIBO IRI；
//   4. 包 T-Box 通过 validateSpec（继承/引用/IRI 唯一）；
//   5. 导出保留真实 IRI 与 dct:source；
//   6. 合并增量、幂等、冲突整批不写，且不破坏既有实例。
import { describe, expect, it } from 'vitest'
import {
  FIBO_PACK_NAMESPACE, FIBO_SOURCE, fiboPackApplied, fiboPackSpec, fiboPackSummary, mergeFiboPack,
} from '../ontology-fibo'
import { seedInstances, seedSpec } from '../ontology-seed'
import { validateInstances, validateSpec } from '../ontology-validate'
import { toJSONLD, toShaclShapes, toTurtle } from '../ontology-export'
import type { OntologySpec } from '../ontology-types'

const FIBO_PREFIX = 'https://spec.edmcouncil.org/fibo/ontology/'
const COMMONS_PREFIX = 'https://www.omg.org/spec/Commons/'

describe('FIBO 包元数据', () => {
  it('版本/取证日期/许可固定为 master_2026Q3 实锚', () => {
    expect(FIBO_SOURCE.repo).toBe('https://github.com/edmcouncil/fibo')
    expect(FIBO_SOURCE.release).toBe('master_2026Q3')
    expect(FIBO_SOURCE.releasedAt).toBe('2026-10-20')
    expect(FIBO_SOURCE.retrievedAt).toBe('2026-10-21')
    expect(FIBO_SOURCE.license).toBe('MIT')
  })

  it('固定 release commit，并使用官方 FIBO OWL 页面', () => {
    expect(FIBO_SOURCE.commit).toBe('2d73435a4419b66b7c9f44cb9763e35fe8ac7890')
    expect(FIBO_SOURCE.spec).toBe('https://spec.edmcouncil.org/fibo/page/owl')
  })

  it('FIBO 概念逐条带固定 tag 的源码文件链接', () => {
    for (const c of fiboPackSummary().concepts.filter((x) => x.origin === 'fibo')) {
      expect(c.sourceUrl).toBe(`https://github.com/edmcouncil/fibo/blob/master_2026Q3/${c.module}.rdf`)
    }
    for (const c of fiboPackSummary().concepts.filter((x) => x.origin !== 'fibo')) {
      expect(c.sourceUrl).toBeUndefined()
    }
  })

  it('概念/属性/公理计数与分档', () => {
    const pack = fiboPackSummary()
    expect(pack.counts.concepts).toBe(37)
    expect(pack.counts.fibo + pack.counts.commons + pack.counts.localExtensions).toBe(pack.counts.concepts)
    expect(pack.counts.fibo).toBe(33)
    expect(pack.counts.commons).toBe(2)
    expect(pack.counts.localExtensions).toBe(2)
    expect(pack.counts.objectProperties).toBe(21)
    expect(pack.counts.axioms).toBe(16)
  })
})

describe('IRI 实锚（防名义 FIBO）', () => {
  it('每个 fibo 概念的 IRI 落在其声明模块 base 下，并有 versionIRI 与英文原定义', () => {
    for (const c of fiboPackSummary().concepts.filter((x) => x.origin === 'fibo')) {
      expect(c.iri.startsWith(`${FIBO_PREFIX}${c.module}/`), `${c.id} → ${c.iri} ∉ ${c.module}`).toBe(true)
      expect(c.versionIri, `${c.id} 缺 versionIRI`).toBeTruthy()
      expect(c.maturity, `${c.id} 缺成熟度`).toBeTruthy()
      expect(c.definitionEn.length, `${c.id} 缺英文原定义`).toBeGreaterThan(10)
    }
  })

  it('Commons 概念用 cmns 命名空间，不冒充 fibo-', () => {
    const commons = fiboPackSummary().concepts.filter((c) => c.origin === 'commons')
    expect(commons.map((c) => c.id).sort()).toEqual(['Identifier', 'Party'])
    for (const c of commons) {
      expect(c.iri.startsWith(COMMONS_PREFIX)).toBe(true)
      expect(c.iri.startsWith(FIBO_PREFIX)).toBe(false)
      expect(c.definitionEn.length).toBeGreaterThan(5)
    }
  })

  it('Authorization / Capture 全仓无对应类：标 local-extension 且不带 FIBO IRI', () => {
    const local = fiboPackSummary().concepts.filter((c) => c.origin === 'local-extension')
    expect(local.map((c) => c.id).sort()).toEqual(['Authorization', 'Capture'])
    for (const c of local) {
      expect(c.iri.startsWith(FIBO_PACK_NAMESPACE)).toBe(true)
      expect(c.iri.startsWith(FIBO_PREFIX)).toBe(false)
      expect(c.note ?? '').toContain('无')
    }
  })

  it('FIBO 无裸 Transaction/Status：以 MarketTransaction / LifecycleStatus 诚实兜底', () => {
    const byId = new Map(fiboPackSummary().concepts.map((c) => [c.id, c]))
    expect(byId.has('Transaction')).toBe(false)
    expect(byId.has('Status')).toBe(false)
    expect(byId.get('MarketTransaction')?.maturity).toBe('Informative')
    expect(byId.get('LifecycleStatus')?.definitionEn).toContain('life-cycle')
  })

  it('对象属性 IRI 与 Domain/Range 全部实锚', () => {
    const pack = fiboPackSummary()
    const typeIds = new Set(pack.concepts.map((c) => c.id))
    for (const p of pack.objectProperties) {
      expect(p.iri.startsWith(`${FIBO_PREFIX}${p.module}/`) || p.iri.startsWith(COMMONS_PREFIX), `${p.id} → ${p.iri}`).toBe(true)
      for (const d of p.domain) expect(typeIds.has(d), `${p.id} domain ${d}`).toBe(true)
      for (const r of p.range) expect(typeIds.has(r), `${p.id} range ${r}`).toBe(true)
    }
  })
})

describe('包 T-Box 自检与层级', () => {
  const spec = fiboPackSpec(0)

  it('validateSpec 零违规（继承/引用/IRI 唯一/公理引用）', () => {
    expect(validateSpec(spec)).toEqual([])
  })

  it('parent 引用存在且无环', () => {
    const byId = new Map(spec.entityTypes.map((t) => [t.id, t]))
    for (const t of spec.entityTypes) {
      if (!t.parent) continue
      expect(byId.has(t.parent), `${t.id} parent ${t.parent}`).toBe(true)
      const seen = new Set<string>([t.id])
      let cur = t.parent
      while (cur) {
        expect(seen.has(cur), `${t.id} parent 链成环于 ${cur}`).toBe(false)
        seen.add(cur)
        cur = byId.get(cur)?.parent
      }
    }
  })

  it('FIBO restriction 派生的基数落到对象属性上', () => {
    const byId = new Map(spec.objectProperties.map((p) => [p.id, p]))
    expect(byId.get('hasCurrency')?.cardinality).toEqual({ min: 1, max: 1 })
    expect(byId.get('appliesToAccount')?.cardinality).toEqual({ min: 1, max: 1 })
    expect(byId.get('hasPaymentAmount')?.cardinality).toEqual({ min: 1 })
  })
})

describe('导出保留真实 IRI 与出处', () => {
  const spec = fiboPackSpec(0)

  it('JSON-LD：真实 IRI + dct:source + owl:imports', () => {
    const doc = toJSONLD(spec, []) as unknown as { '@graph': Array<Record<string, unknown>> }
    const payment = doc['@graph'].find((n) => n['@id'] === `${FIBO_PREFIX}FND/ProductsAndServices/PaymentsAndSchedules/Payment`)
    expect(payment).toBeTruthy()
    expect(payment!['dct:source']).toEqual({ '@id': `${FIBO_PREFIX}FND/ProductsAndServices/PaymentsAndSchedules/Payment` })
    const ontology = doc['@graph'].find((n) => n['@type'] === 'owl:Ontology')
    expect(Array.isArray(ontology!['owl:imports'])).toBe(true)
  })

  it('Turtle：外部 IRI 用 <...> 原样写出', () => {
    const ttl = toTurtle(spec, [])
    expect(ttl).toContain(`<${FIBO_PREFIX}FND/ProductsAndServices/PaymentsAndSchedules/Payment>`)
    expect(ttl).toContain('@prefix fibo-fnd-pas-psch:')
    expect(ttl).toContain('owl:imports')
  })

  it('SHACL：targetClass 用真实 IRI', () => {
    const doc = toShaclShapes(spec, 0) as unknown as { '@graph': Array<Record<string, unknown>> }
    const shape = doc['@graph'].find((n) => n['@id']?.toString().endsWith('PaymentShape'))
    expect(shape).toBeTruthy()
    expect(shape!['sh:targetClass']).toEqual({ '@id': `${FIBO_PREFIX}FND/ProductsAndServices/PaymentsAndSchedules/Payment` })
  })
})

describe('增量合并', () => {
  it('种子 + FIBO 包：无冲突、validateSpec 零违规、种子实例仍合法', () => {
    const before = seedSpec(0)
    const merged = mergeFiboPack(before, 0)
    expect(merged.ok).toBe(true)
    expect(merged.collisions).toEqual([])
    expect(merged.added.types).toBe(37)
    expect(merged.added.objectProperties).toBe(21)
    expect(merged.added.axioms).toBe(16)
    const spec = merged.spec as OntologySpec
    expect(validateSpec(spec)).toEqual([])
    expect(validateInstances(spec, seedInstances(0))).toEqual([])
    expect(fiboPackApplied(spec)).toMatchObject({ concepts: 37, total: 37 })
  })

  it('二次合并幂等：新增 0、跳过全量', () => {
    const first = mergeFiboPack(seedSpec(0), 0).spec as OntologySpec
    const second = mergeFiboPack(first, 1)
    expect(second.ok).toBe(true)
    expect(second.added).toEqual({ types: 0, objectProperties: 0, axioms: 0 })
    expect(second.skipped.types).toBe(37)
    expect(second.skipped.objectProperties).toBe(21)
    expect(second.skipped.axioms).toBe(16)
  })

  it('同 id 不同 IRI：整批不写并如实报冲突（不静默覆盖本地术语）', () => {
    const local = seedSpec(0)
    local.entityTypes.push({
      id: 'Payment', label: '本地支付', category: '本地', modality: 'shall',
      dataProperties: [{ id: 'title', label: '标题', datatype: 'string', modality: 'shall' }],
    })
    const r = mergeFiboPack(local, 0)
    expect(r.ok).toBe(false)
    expect(r.spec).toBeUndefined()
    expect(r.collisions.some((c) => c.kind === 'type' && c.id === 'Payment')).toBe(true)
    expect(r.added).toEqual({ types: 0, objectProperties: 0, axioms: 0 })
  })
})

describe('FIBO 官方参照目录', () => {
  it('显示 12 个域，八个核心域完整且 MD 明示 Provisional', () => {
    const domains = fiboPackSummary().reference.domains
    expect(domains).toHaveLength(12)
    expect(domains.map((d) => d.code)).toEqual(expect.arrayContaining([
      'FND', 'BE', 'FBC', 'LOAN', 'SEC', 'DER', 'IND', 'MD',
    ]))
    const md = domains.find((d) => d.code === 'MD')
    expect(md?.maturityNote).toContain('Provisional')
    expect(md?.maturityNoteEn).toContain('Provisional')
  })

  it('域与场景来源全部固定 tag，场景关系端点闭合', () => {
    const reference = fiboPackSummary().reference
    const sourceUrls = [
      ...reference.domains.map((d) => d.sourceUrl),
      ...reference.scenarios.flatMap((s) => [
        ...s.edges.map((e) => e.sourceUrl),
        ...s.facts.map((f) => f.sourceUrl),
      ]),
    ]
    expect(sourceUrls.length).toBeGreaterThan(20)
    for (const url of sourceUrls) expect(url).toContain('/master_2026Q3/')
    for (const scenario of reference.scenarios) {
      const nodeIds = new Set(scenario.nodes.map((n) => n.id))
      expect(nodeIds.size).toBe(scenario.nodes.length)
      for (const node of scenario.nodes) expect(Number.isInteger(node.level) && node.level >= 0).toBe(true)
      for (const edge of scenario.edges) {
        expect(nodeIds.has(edge.source), `${scenario.id} source ${edge.source}`).toBe(true)
        expect(nodeIds.has(edge.target), `${scenario.id} target ${edge.target}`).toBe(true)
      }
    }
  })

  it('四条场景保留官方 EXMP 或 Schema 的关键事实', () => {
    const scenarios = fiboPackSummary().reference.scenarios
    expect(scenarios.map((s) => s.id)).toEqual([
      'apple-listed-share', 'djia-equity-index', 'fixed-float-ir-swap', 'mortgage-security-agreement',
    ])
    const apple = scenarios[0]
    expect(apple.edges.some((e) => e.property === 'fnd-rel:isIssuedBy'
      && e.source === 'AppleIncCommonStock' && e.target === 'AppleIncEquityIssuer')).toBe(true)
    expect(apple.edges.some((e) => e.property === 'sec-lst:hasHomeExchange'
      && e.target === 'Facility-XNAS')).toBe(true)
    const swap = scenarios[2]
    expect(swap.facts.map((f) => f.textZh).join(' ')).toContain('1.0579')
    expect(swap.facts.map((f) => f.textZh).join(' ')).toContain('0.309')
    expect(swap.facts.map((f) => f.textZh).join(' ')).toContain('1286805')
    expect(swap.caveat).toContain('sample')
    expect(scenarios[3].nodes.every((n) => n.kind === 'class')).toBe(true)
  })
})
