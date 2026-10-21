// FIBO 单一事实源一致性守门（2026-10-21 SSOT 合并轮）：
// 正本 = ontology-fibo.ts 的 fiboQgateIndex()；派生产物 = qgate 的 fibo-mini.json。
// 本测试两侧对账——改正本不跑 `npm run fibo:sync` 再生成 = 红；手改派生 JSON = 红。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { fiboQgateIndex } from '../ontology-fibo'

const here = dirname(fileURLToPath(import.meta.url))
const derivedPath = join(here, '..', '..', '..', 'qgate', 'gate-packs', 'ontology', 'data', 'fibo-mini.json')

describe('FIBO SSOT（正本 → qgate 派生索引）', () => {
  it('派生产物与正本投影逐字节一致（改任一侧未同步即漂移）', () => {
    const expected = JSON.stringify(fiboQgateIndex(), null, 2) + '\n'
    const onDisk = readFileSync(derivedPath, 'utf8')
    expect(onDisk).toBe(expected)
  })

  it('投影结构合法：37 概念 / id 唯一 / aliases 非空去重', () => {
    const idx = fiboQgateIndex()
    expect(idx.schemaVersion).toBe(1)
    expect(idx.provider).toBe('fibo')
    expect(idx.concepts).toHaveLength(37)
    const ids = idx.concepts.map((c) => c.id)
    expect(new Set(ids).size).toBe(37)
    for (const c of idx.concepts) {
      expect(c.aliases.length).toBeGreaterThan(0)
      expect(new Set(c.aliases).size).toBe(c.aliases.length)
      expect(c.id).toMatch(/^fibo-[a-z0-9-]+$/)
    }
  })

  it('锚定纪律：fibo/commons 概念必须带真实 IRI；工程近似不得带 IRI 且 source 如实标注', () => {
    const idx = fiboQgateIndex()
    for (const c of idx.concepts) {
      if (c.source === 'engineering-approximation') {
        expect(c.iri, `${c.id} 工程近似不得冒充有锚`).toBeUndefined()
      } else {
        expect(c.iri, `${c.id} 缺真实 IRI`).toMatch(/^https:\/\/(spec\.edmcouncil\.org\/fibo|www\.omg\.org\/spec\/Commons)\//)
        expect(c.source).toMatch(/^(FIBO |OMG Commons )/)
      }
    }
    const approx = idx.concepts.filter((c) => c.source === 'engineering-approximation').map((c) => c.id)
    expect(approx).toEqual(['fibo-authorization', 'fibo-capture'])
  })

  it('TransactionEvent（FND 泛化交易锚）在册且与 Payment/Settlement 互斥；Payee/Payer 互斥', () => {
    const idx = fiboQgateIndex()
    const tx = idx.concepts.find((c) => c.id === 'fibo-transaction-event')
    expect(tx?.iri).toBe('https://spec.edmcouncil.org/fibo/ontology/FND/ProductsAndServices/ProductsAndServices/TransactionEvent')
    expect(tx?.definition).toContain('any sale, assignment, lease, license, loan, advance, contribution')
    expect(tx?.distinctFrom).toEqual(['fibo-payment', 'fibo-settlement'])
    expect(idx.concepts.find((c) => c.id === 'fibo-payer')?.distinctFrom).toEqual(['fibo-payee'])
  })

  it('qgate 不变量约束随投影下发（3 条工程候选，非 FIBO 断言）', () => {
    const idx = fiboQgateIndex()
    expect(idx.constraints.map((c) => c.id)).toEqual(['amount-refund-bound', 'amount-settle-bound', 'debit-credit-balance'])
  })
})
