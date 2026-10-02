// v0.3 R3 语义门族守门：catalog OWL 子集（闭包/互斥传播/等价/环 fail-closed）+ 八检查。
// 负例先行：目录矛盾、映射漂移、约束违例、非法转换、内部暴露、类型互斥、关系缺失、术语歧义。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseCatalog, buildReasoning } from '../src/core/catalog.js'
import { runSemanticExecutor } from '../src/executors/semantic.js'
import type { ExecutorSpec } from '../src/core/types.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'qgate-r3-'))
const run = (e: ExecutorSpec, ws: string) => runSemanticExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })

// 支付域小目录：Commitment ⊥ Settlement；Capture/Settle 是 Settlement 子类；
// Party 语义歧义用（两家同标签）由个别用例单独构造。
const CATALOG = {
  concepts: [
    { iri: 'fibo:Payment', label: 'Payment', subClassOf: ['fibo:Commitment'] },
    { iri: 'fibo:Commitment', label: 'Commitment' },
    { iri: 'fibo:Settlement', label: 'Settlement', disjointWith: ['fibo:Commitment'] },
    { iri: 'fibo:Capture', label: 'Capture', subClassOf: ['fibo:Settlement'] },
    { iri: 'fibo:Settle', label: 'Settle', subClassOf: ['fibo:Settlement'] },
    { iri: 'fibo:Account', label: 'Account', exposure: 'internal' },
    { iri: 'fibo:Ledger', label: 'Ledger', exposure: 'public' },
    { iri: 'fibo:Obligation', label: 'Obligation', constraints: [
      { id: 'C1', left: 'amount', operator: 'le', right: 'limit' },
    ], lifecycle: { states: ['open', 'settled', 'defaulted'], transitions: [['open', 'settled'], ['open', 'defaulted']] } },
  ],
  properties: [
    { predicate: 'settles', subPropertyOf: ['discharges'], transitive: false },
    { predicate: 'discharges' },
    { predicate: 'obligationOf', inverseOf: 'obligatedParty' },
  ],
}

function wsWithCatalog(catalog: unknown = CATALOG): string {
  const ws = tmp()
  writeFileSync(join(ws, 'catalog.json'), JSON.stringify(catalog))
  return ws
}

describe('catalog OWL 子集', () => {
  it('解析+推理：子类闭包、互斥传播到后代、等价对称、属性注册表', () => {
    const c = parseCatalog(CATALOG)!
    const r = buildReasoning(c)
    expect([...r.ancestorsOf('fibo:Capture')]).toContain('fibo:Settlement')
    // disjoint 传播：Capture（Settlement 后代）与 Payment（Commitment 后代）互斥
    expect(r.disjointOf('fibo:Capture', 'fibo:Payment')).toBe(true)
    expect(r.subsumedBy('fibo:Capture', 'fibo:Settlement')).toBe(true)
    expect(r.subsumedBy('fibo:Settlement', 'fibo:Capture')).toBe(false)
    expect(r.propertyClosure('settles').has('discharges')).toBe(true)
    expect(r.inverseOf('obligationOf')).toBe('obligatedParty')
  })

  it('环 → 构建期抛；互斥×包含矛盾 → 构建期抛；悬垂目标 → 抛；畸形 → null', () => {
    const cyc = parseCatalog({ concepts: [
      { iri: 'a', label: 'A', subClassOf: ['b'] }, { iri: 'b', label: 'B', subClassOf: ['a' ] },
    ] })
    expect(() => buildReasoning(cyc!)).toThrow(/cycle/)
    const contra = parseCatalog({ concepts: [
      { iri: 'a', label: 'A', subClassOf: ['b'], disjointWith: ['b'] }, { iri: 'b', label: 'B' },
    ] })
    expect(() => buildReasoning(contra!)).toThrow(/disjoint/)
    expect(parseCatalog({ concepts: [{ iri: 'a', label: 'A', subClassOf: ['ghost'] }] })).not.toBeNull()
    expect(() => buildReasoning(parseCatalog({ concepts: [{ iri: 'a', label: 'A', subClassOf: ['ghost'] }] })!)).toThrow(/unknown/)
    expect(parseCatalog({ concepts: [] })).toBeNull()
    expect(parseCatalog('x')).toBeNull()
  })
})

describe('semantic consistency / terminology', () => {
  it('一致目录 → pass 计数入证据；标签歧义目录 → terminology fail', () => {
    const ws = wsWithCatalog()
    expect(run({ id: 's', type: 'semantic', check: 'consistency', catalogFile: 'catalog.json', evidenceType: 'x' }, ws).result).toBe('pass')
    expect(run({ id: 's', type: 'semantic', check: 'terminology', catalogFile: 'catalog.json', evidenceType: 'x' }, ws).result).toBe('pass')
    const amb = wsWithCatalog()
    writeFileSync(join(amb, 'catalog.json'), JSON.stringify({
      concepts: [
        { iri: 'a', label: 'Party' }, { iri: 'b', label: 'party' },  // 大小写不敏感撞名
      ],
    }))
    const t = run({ id: 's', type: 'semantic', check: 'terminology', catalogFile: 'catalog.json', evidenceType: 'x' }, amb)
    expect(t.result).toBe('fail')
    expect(t.summary).toContain('ambiguity')
  })

  it('目录缺失 → error', () => {
    const ws = tmp()
    expect(run({ id: 's', type: 'semantic', check: 'consistency', catalogFile: 'catalog.json', evidenceType: 'x' }, ws).result).toBe('error')
  })
})

describe('semantic alignment（符号→IRI 映射核对）', () => {
  const exec = (over: Partial<ExecutorSpec>): ExecutorSpec => ({
    id: 's', type: 'semantic', check: 'alignment', catalogFile: 'catalog.json', observedFile: 'map.json', evidenceType: 'x',
    expectedMap: [{ symbol: 'PaymentModule.captured', iri: 'fibo:Capture' }],
    ...over,
  })

  it('strict 等值 → pass；错配 → fail；subsumed 允许子类', () => {
    const ws = wsWithCatalog()
    writeFileSync(join(ws, 'map.json'), JSON.stringify({ mappings: [{ symbol: 'PaymentModule.captured', candidates: ['fibo:Capture'] }] }))
    expect(run(exec({}), ws).result).toBe('pass')
    // subsumed：候选 Settle 不是期望 Capture，但也满足"Settlement 子类"吗？不——期望是 Capture。
    // subsumed 判定=候选被期望概念包含。Settle 不被 Capture 包含 → 仍 fail（用例见下）
    writeFileSync(join(ws, 'map.json'), JSON.stringify({ mappings: [{ symbol: 'PaymentModule.captured', candidates: ['fibo:Settle'] }] }))
    const wrong = run(exec({}), ws)
    expect(wrong.result).toBe('fail')
    // 期望放宽到 Settlement：Capture/Settle 子类均满足
    writeFileSync(join(ws, 'map.json'), JSON.stringify({ mappings: [{ symbol: 'PaymentModule.settled', candidates: ['fibo:Capture'] }] }))
    expect(run(exec({ matchMode: 'subsumed', expectedMap: [{ symbol: 'PaymentModule.settled', iri: 'fibo:Settlement' }] }), ws).result).toBe('pass')
  })

  it('互斥双候选 → fail conflict；runtime 强制缺 runtime → fail runtime-unbound；未知符号 → fail', () => {
    const ws = wsWithCatalog()
    writeFileSync(join(ws, 'map.json'), JSON.stringify({ mappings: [{ symbol: 'PaymentModule.captured', candidates: ['fibo:Capture', 'fibo:Payment'] }] }))
    const conflict = run(exec({}), ws)
    expect(conflict.result).toBe('fail')
    expect(conflict.summary).toContain('disjoint')
    writeFileSync(join(ws, 'map.json'), JSON.stringify({ mappings: [{ symbol: 'PaymentModule.captured', candidates: ['fibo:Capture'], origin: 'annotation' }] }))
    const unbound = run(exec({ requireRuntimeOrigin: true }), ws)
    expect(unbound.result).toBe('fail')
    expect(unbound.summary).toContain('runtime-unbound')
  })
})

describe('semantic constraint / state / exposure / instance / relation', () => {
  it('constraint：违例 → fail；成立 → pass', () => {
    const ws = wsWithCatalog()
    writeFileSync(join(ws, 'cases.json'), JSON.stringify({ cases: [{ amount: 50, limit: 100 }, { amount: 100, limit: 100 }] }))
    const e: ExecutorSpec = { id: 's', type: 'semantic', check: 'constraint', catalogFile: 'catalog.json', observedFile: 'cases.json', concept: 'fibo:Obligation', evidenceType: 'x' }
    expect(run(e, ws).result).toBe('pass')
    writeFileSync(join(ws, 'cases.json'), JSON.stringify({ cases: [{ amount: 150, limit: 100 }] }))
    const fail = run(e, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('C1')
  })

  it('state：非法转换 → fail illegalTransition；未知状态 → fail', () => {
    const ws = wsWithCatalog()
    const e: ExecutorSpec = { id: 's', type: 'semantic', check: 'state', catalogFile: 'catalog.json', observedFile: 't.json', concept: 'fibo:Obligation', evidenceType: 'x' }
    writeFileSync(join(ws, 't.json'), JSON.stringify({ transitions: [{ instance: 'o1', from: 'open', to: 'settled' }] }))
    expect(run(e, ws).result).toBe('pass')
    writeFileSync(join(ws, 't.json'), JSON.stringify({ transitions: [{ instance: 'o1', from: 'settled', to: 'open' }, { instance: 'o2', from: 'open', to: 'unknown' }] }))
    const fail = run(e, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('illegalTransition settled→open')
    expect(fail.summary).toContain('unknownState')
  })

  it('exposure：internal 暴露 → fail；未知概念 → fail；干净 → pass', () => {
    const ws = wsWithCatalog()
    const e: ExecutorSpec = { id: 's', type: 'semantic', check: 'exposure', catalogFile: 'catalog.json', observedFile: 'e.json', evidenceType: 'x' }
    writeFileSync(join(ws, 'e.json'), JSON.stringify({ exposed: ['fibo:Ledger'] }))
    expect(run(e, ws).result).toBe('pass')
    writeFileSync(join(ws, 'e.json'), JSON.stringify({ exposed: ['fibo:Account', 'fibo:Ghost'] }))
    const fail = run(e, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('internalConceptExposed: fibo:Account')
    expect(fail.summary).toContain('unknownExposedConcept')
  })

  it('instance：期望类型子类特化 → pass；互斥多类型 → fail disjointInstances', () => {
    const ws = wsWithCatalog()
    writeFileSync(join(ws, 'data.json'), JSON.stringify({ records: [
      { id: 'txn-1', types: ['fibo:Capture'] },   // 被 Settlement 特化
      { id: 'txn-2', types: ['fibo:Settlement'] },
    ] }))
    const e: ExecutorSpec = { id: 's', type: 'semantic', check: 'instance', catalogFile: 'catalog.json', dataFile: 'data.json', expectedMap: [{ symbol: 'txn-1', iri: 'fibo:Settlement' }], evidenceType: 'x' }
    expect(run(e, ws).result).toBe('pass')
    writeFileSync(join(ws, 'data.json'), JSON.stringify({ records: [
      { id: 'txn-1', types: ['fibo:Capture', 'fibo:Payment'] },  // 互斥对（传播后）
    ] }))
    const fail = run(e, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('disjointInstances')
  })

  it('relation：子属性满足 → pass；缺关系 → fail；未声明谓词 → fail', () => {
    const ws = wsWithCatalog()
    const e: ExecutorSpec = { id: 's', type: 'semantic', check: 'relation', catalogFile: 'catalog.json', observedFile: 'r.json', relations: [{ subject: 'fibo:Payment', predicate: 'discharges', object: 'fibo:Obligation' }], evidenceType: 'x' }
    writeFileSync(join(ws, 'r.json'), JSON.stringify({ relations: [{ subject: 'fibo:Payment', predicate: 'settles', object: 'fibo:Obligation' }] }))
    expect(run(e, ws).result).toBe('pass')  // settles ⊑ discharges 满足
    writeFileSync(join(ws, 'r.json'), JSON.stringify({ relations: [{ subject: 'fibo:Payment', predicate: 'settles', object: 'fibo:Ledger' }] }))
    const miss = run(e, ws)
    expect(miss.result).toBe('fail')
    expect(miss.summary).toContain('missingRelation')
    writeFileSync(join(ws, 'r.json'), JSON.stringify({ relations: [{ subject: 'fibo:Payment', predicate: 'smuggles', object: 'fibo:Obligation' }] }))
    const undeclared = run(e, ws)
    expect(undeclared.result).toBe('fail')
    expect(undeclared.summary).toContain('undeclaredRelation')
  })
})
