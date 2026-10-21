// qgate FIBO 索引 × 正本包一致性守门（2026-10-21 产品落地；SSOT 合并后 37 概念）。
//   qgate 的 37 概念索引是 ontology-fibo.ts 的派生投影；本测试做语义对账：
//   每个 FIBO/Commons 锚点都能在正本找到同 IRI 概念；Authorization/Capture 两端
//   都是工程近似；TransactionEvent 已并入正本，原登记例外关闭。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fiboPackSummary } from '../ontology-fibo'

interface GateConcept { id: string; label: string; iri?: string; source?: string }
interface GateIndex { schemaVersion: number; provider: string; concepts: GateConcept[] }

const GATE_INDEX = resolve(process.cwd(), 'custom/qgate/gate-packs/ontology/data/fibo-mini.json')

describe('qgate FIBO 索引 × 正本包一致性', () => {
  const pack = fiboPackSummary()
  const byIri = new Map(pack.concepts.map((c) => [c.iri, c]))
  const gate = JSON.parse(readFileSync(GATE_INDEX, 'utf8')) as GateIndex

  it('schema/provider/概念数与 SSOT 正本一致（37）', () => {
    expect(gate.schemaVersion).toBe(1)
    expect(gate.provider).toBe('fibo')
    expect(gate.concepts).toHaveLength(37)
    expect(pack.counts.concepts).toBe(37)
    expect(pack.counts.fibo).toBe(33)
    expect(pack.counts.commons).toBe(2)
    expect(pack.counts.localExtensions).toBe(2)
  })

  it('每个 FIBO/Commons 锚点都能在正本找到同 IRI 概念（35/35，无例外）', () => {
    const anchored = gate.concepts.filter((c) => c.iri
      && (c.iri.startsWith('https://spec.edmcouncil.org/fibo/ontology/') || c.iri.startsWith('https://www.omg.org/spec/Commons/')))
    expect(anchored).toHaveLength(35)
    for (const c of anchored) {
      expect(byIri.has(c.iri!), `${c.id} → ${c.iri} 不在正本包中`).toBe(true)
    }
  })

  it('Authorization/Capture 两端都标工程近似，不冒充 FIBO', () => {
    const approx = gate.concepts.filter((c) => !c.iri)
    expect(approx.map((c) => c.label).sort()).toEqual(['Authorization', 'Capture'])
    for (const c of approx) {
      expect(c.source ?? '').toContain('engineering-approximation')
      const local = pack.concepts.find((p) => p.label.toLowerCase() === c.label.toLowerCase() && p.origin === 'local-extension')
      expect(local, `${c.id} 在正本包缺本地扩展对应`).toBeTruthy()
    }
  })

  it('TransactionEvent 已并入正本，原例外关闭', () => {
    const c = gate.concepts.find((x) => x.id === 'fibo-transaction-event')
    expect(c).toBeTruthy()
    expect(c!.iri).toBe('https://spec.edmcouncil.org/fibo/ontology/FND/ProductsAndServices/ProductsAndServices/TransactionEvent')
    expect(byIri.has(c!.iri!)).toBe(true)
    expect(pack.concepts.find((p) => p.id === 'TransactionEvent')?.origin).toBe('fibo')
  })
})
