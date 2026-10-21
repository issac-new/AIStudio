// P2/P3 守门（2026-10-21）：支付样例摄取、SEC/DER/LOAN 域目录、运营快照。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fiboDomains } from '../ontology-fibo-domains'
import { ingestFiboDemo } from '../ontology-fibo-instances'
import { fiboOpsSnapshot } from '../ontology-fibo-ops'
import { mergeFiboPack } from '../ontology-fibo'
import { seedInstances, seedSpec } from '../ontology-seed'
import { loadInstances, loadSpec, saveSpec } from '../ontology-store'
import { validateInstances } from '../ontology-validate'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fibop2-'))
  process.env.ONTOLOGY_DIR = dir
})

afterEach(() => {
  delete process.env.ONTOLOGY_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('P2 支付样例实例摄取', () => {
  it('自动导入包 → 20 条实例全量校验零 error → 幂等重跑', () => {
    const first = ingestFiboDemo(0)
    expect(first.ok).toBe(true)
    expect(first.importedPack).toBe(true)
    expect(first.typesAdded).toBe(36)
    expect(first.instances).toBe(20)
    expect(first.applied.concepts).toBe(36)
    expect(first.summary.error).toBe(0)

    const all = loadInstances()
    expect(all.filter((i) => i.id.startsWith('fibo:'))).toHaveLength(20)
    const errors = validateInstances(loadSpec(), all).filter((v) => v.severity === 'error')
    expect(errors).toEqual([])

    const second = ingestFiboDemo(1)
    expect(second.ok).toBe(true)
    expect(second.importedPack).toBe(false)
    expect(second.typesAdded).toBe(0)
    expect(second.instances).toBe(20)
    expect(loadInstances().filter((i) => i.id.startsWith('fibo:'))).toHaveLength(20)
  })

  it('支付/账户/结算/授权/扣款五类实例都在，captured 与 settled 分开', () => {
    expect(ingestFiboDemo(0).ok).toBe(true)
    const ids = new Set(loadInstances().map((i) => i.id))
    for (const id of [
      'fibo:payment-1', 'fibo:account-1', 'fibo:settlement-event-1',
      'fibo:authorization-1', 'fibo:capture-1',
    ]) expect(ids.has(id), `缺 ${id}`).toBe(true)

    const byId = new Map(loadInstances().map((i) => [i.id, i]))
    expect(byId.get('fibo:authorization-1')?.data.status).toBe('authorized')
    expect(byId.get('fibo:capture-1')?.data.capturedAmount).toBe(100)
    expect(byId.get('fibo:settlement-event-1')?.type).toBe('SettlementEvent')
    expect(byId.get('fibo:account-1')?.data.accountNumber).toBe('ACC-1')
  })

  it('包未导入时先合并再写；包已导入时只写实例', () => {
    const merged = mergeFiboPack(seedSpec(0), 0)
    saveSpec(merged.spec!, 'test', 0)
    const r = ingestFiboDemo(0)
    expect(r.ok).toBe(true)
    expect(r.importedPack).toBe(false)
    expect(r.instances).toBe(20)
  })
})

describe('P3 SEC/DER/LOAN 域目录', () => {
  const domains = fiboDomains()

  it('3 个域各 6 个概念，IRI/版本/定义齐全', () => {
    expect(domains.map((d) => d.id)).toEqual(['SEC', 'DER', 'LOAN'])
    for (const d of domains) {
      expect(d.concepts).toHaveLength(6)
      for (const c of d.concepts) {
        expect(c.iri.startsWith('https://spec.edmcouncil.org/fibo/ontology/'), `${c.id} IRI`).toBe(true)
        expect(c.versionIri.startsWith('https://spec.edmcouncil.org/fibo/ontology/'), `${c.id} versionIRI`).toBe(true)
        expect(c.definitionEn.length, `${c.id} 定义`).toBeGreaterThan(10)
        expect(c.definitionZh.length, `${c.id} 中文定义`).toBeGreaterThan(5)
      }
    }
    expect(domains.reduce((n, d) => n + d.concepts.length, 0)).toBe(18)
  })

  it('域内父类引用存在，不跨域悬空', () => {
    for (const d of domains) {
      const ids = new Set(d.concepts.map((c) => c.id))
      for (const c of d.concepts) {
        if (c.parent) expect(ids.has(c.parent), `${d.id}.${c.id} parent ${c.parent}`).toBe(true)
      }
    }
  })

  it('关键锚点：上市证券、利率互换、抵押', () => {
    const all = domains.flatMap((d) => d.concepts)
    expect(all.find((c) => c.id === 'ListedSecurity')?.iri).toContain('/SEC/Securities/SecuritiesListings/ListedSecurity')
    expect(all.find((c) => c.id === 'InterestRateSwap')?.iri).toContain('/DER/RateDerivatives/IRSwaps/InterestRateSwap')
    expect(all.find((c) => c.id === 'Mortgage')?.iri).toContain('/LOAN/RealEstateLoans/Mortgages/Mortgage')
    expect(all.find((c) => c.id === 'Mortgage')?.parent).toBeUndefined()
    expect(all.find((c) => c.id === 'LoanSecuredByRealEstate')?.parent).toBe('CollateralizedLoan')
  })
})

describe('P4 运营快照', () => {
  it('未导入时覆盖 0/36，但锁/映射/术语/域/门禁/权限计数齐全', () => {
    const ops = fiboOpsSnapshot(seedSpec(0), seedInstances(0), 0)
    expect(ops.evidence.coverage.applied).toBe(0)
    expect(ops.evidence.coverage.total).toBe(36)
    expect(ops.glossary.terms).toBe(36)
    expect(ops.mappings.total).toBe(36)
    expect(ops.domains).toEqual({ domains: 3, concepts: 18, ids: ['SEC', 'DER', 'LOAN'] })
    expect(ops.lock.ok).toBe(true)
    expect(ops.gate.concepts).toBe(18)
    expect(ops.permissions).toEqual({ policies: 2, fields: ['Account.accountNumber', 'Payer.partyRef'] })
  })

  it('导入后运营快照覆盖 36/36', () => {
    const merged = mergeFiboPack(seedSpec(0), 0)
    const ops = fiboOpsSnapshot(merged.spec!, seedInstances(0), 0)
    expect(ops.evidence.coverage.applied).toBe(36)
    expect(ops.evidence.coverage.ratio).toBe('36/36')
    expect(ops.evidence.markdown).toContain('36/36')
  })
})
