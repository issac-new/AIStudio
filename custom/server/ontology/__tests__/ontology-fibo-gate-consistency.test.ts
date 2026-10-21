// qgate FIBO 索引 × 36 概念包一致性守门（2026-10-21 产品落地）：
//   qgate 的 18 概念轻量索引与 Ontology Studio 的 36 概念可导入包必须同锚，
//   否则同一个「Payment」在语义门与工作台会指向不同 IRI。本测试只读 qgate JSON，
//   不修改 qgate 代码；任何一侧漂移都会在这里亮红。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fiboPackSummary } from '../ontology-fibo'

interface GateConcept { id: string; label: string; iri?: string; source?: string }
interface GateIndex { schemaVersion: number; provider: string; concepts: GateConcept[] }

const GATE_INDEX = resolve(process.cwd(), 'custom/qgate/gate-packs/ontology/data/fibo-mini.json')

/**
 * 已登记例外：qgate 用 TransactionEvent 做事件类目兜底，36 概念包未收录它
 * （支付/账户/结算三域裁剪面内没有这个父类）。后续包升级时二选一：
 * 补入 TransactionEvent，或把 qgate 改为 MarketTransaction。改任一侧都要更新本表。
 */
const DOCUMENTED_EXCEPTIONS: Record<string, { iri: string; reason: string }> = {
  'fibo-transaction': {
    iri: 'https://spec.edmcouncil.org/fibo/ontology/FND/ProductsAndServices/ProductsAndServices/TransactionEvent',
    reason: '36 概念包未收录 TransactionEvent（PaymentEvent 的父类，不在三域裁剪面内）',
  },
}

describe('qgate FIBO 索引 × 36 概念包一致性', () => {
  const pack = fiboPackSummary()
  const byIri = new Map(pack.concepts.map((c) => [c.iri, c]))
  const gate = JSON.parse(readFileSync(GATE_INDEX, 'utf8')) as GateIndex

  it('schema/provider/概念数与 18 概念校准轮一致', () => {
    expect(gate.schemaVersion).toBe(1)
    expect(gate.provider).toBe('fibo')
    expect(gate.concepts).toHaveLength(18)
  })

  it('每个 FIBO/Commons 锚点都能在 36 概念包找到同 IRI 概念（仅登记例外）', () => {
    const anchored = gate.concepts.filter((c) => c.iri
      && (c.iri.startsWith('https://spec.edmcouncil.org/fibo/ontology/') || c.iri.startsWith('https://www.omg.org/spec/Commons/')))
    expect(anchored).toHaveLength(16) // 18 - Authorization/Capture（工程近似，无 IRI）
    for (const c of anchored) {
      const exception = DOCUMENTED_EXCEPTIONS[c.id]
      if (exception) {
        expect(c.iri).toBe(exception.iri)
        expect(byIri.has(c.iri!), `${c.id} 是登记例外，不应已在包内`).toBe(false)
        continue
      }
      expect(byIri.has(c.iri!), `${c.id} → ${c.iri} 不在 36 概念包中`).toBe(true)
    }
  })

  it('Authorization/Capture 两端都标工程近似，不冒充 FIBO', () => {
    const approx = gate.concepts.filter((c) => !c.iri)
    expect(approx.map((c) => c.label).sort()).toEqual(['Authorization', 'Capture'])
    for (const c of approx) {
      expect(c.source ?? '').toContain('engineering-approximation')
      const local = pack.concepts.find((p) => p.label.toLowerCase() === c.label.toLowerCase() && p.origin === 'local-extension')
      expect(local, `${c.id} 在 36 概念包缺本地扩展对应`).toBeTruthy()
    }
  })

  it('例外登记仍指向 TransactionEvent（漂移即红）', () => {
    const c = gate.concepts.find((x) => x.id === 'fibo-transaction')
    expect(c).toBeTruthy()
    expect(c!.iri).toBe(DOCUMENTED_EXCEPTIONS['fibo-transaction'].iri)
    expect(pack.concepts.some((p) => p.iri === c!.iri)).toBe(false)
  })
})
