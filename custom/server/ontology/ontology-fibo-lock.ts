/**
 * FIBO 版本锁（P2-3 季度漂移检查，2026-10-21）。
 *
 * 包固定到 Q3 2026 正式发布，逐模块记录 owl:versionIRI。任何一次升级先改这里，
 * 再改 ontology-fibo.ts；两边不一致时 fiboLockReport() 返回 drift，证据端点如实呈现。
 * 季度升级脚本 scripts/fibo/check-upstream.mjs 用它和 GitHub 最新 release 对账。
 */
import { FIBO_MODULES, FIBO_SOURCE } from './ontology-fibo'

export const FIBO_LOCK = {
  tag: 'master_2026Q3',
  commit: '2d73435a4419b66b7c9f44cb9763e35fe8ac7890',
  releasedAt: '2026-10-20T20:02:05Z',
  modules: {
    payments: 'https://spec.edmcouncil.org/fibo/ontology/FND/20250701/ProductsAndServices/PaymentsAndSchedules/',
    pas: 'https://spec.edmcouncil.org/fibo/ontology/FND/20251201/ProductsAndServices/ProductsAndServices/',
    currency: 'https://spec.edmcouncil.org/fibo/ontology/FND/20260701/Accounting/CurrencyAmount/',
    accounts: 'https://spec.edmcouncil.org/fibo/ontology/FBC/20261001/ProductsAndServices/ClientsAndAccounts/',
    settlement: 'https://spec.edmcouncil.org/fibo/ontology/FBC/20250301/FinancialInstruments/Settlement/',
    fpas: 'https://spec.edmcouncil.org/fibo/ontology/FBC/20260701/ProductsAndServices/FinancialProductsAndServices/',
    contracts: 'https://spec.edmcouncil.org/fibo/ontology/FND/20260601/Agreements/Contracts/',
    agreements: 'https://spec.edmcouncil.org/fibo/ontology/FND/20260601/Agreements/Agreements/',
    legal: 'https://spec.edmcouncil.org/fibo/ontology/FND/20251201/Law/LegalCapacity/',
    occurrences: 'https://spec.edmcouncil.org/fibo/ontology/FND/20250301/DatesAndTimes/Occurrences/',
    relations: 'https://spec.edmcouncil.org/fibo/ontology/FND/20260701/Relations/Relations/',
    lifecycles: 'https://spec.edmcouncil.org/fibo/ontology/FND/20240101/Arrangements/Lifecycles/',
    beEntities: 'https://spec.edmcouncil.org/fibo/ontology/BE/20260701/FunctionalEntities/FunctionalEntities/',
    marketTx: 'https://spec.edmcouncil.org/fibo/ontology/FND/TransactionsExt/MarketTransactions/',
    commonsParties: 'https://www.omg.org/spec/Commons/20250801/PartiesAndSituations/',
    commonsIds: 'https://www.omg.org/spec/Commons/20221101/Identifiers/',
    commonsContext: '',
    commonsOrgs: '',
    commonsRegistration: '',
  },
} as const

export interface FiboLockDrift {
  module: string
  expected: string
  actual: string
  reason: string
}

export interface FiboLockReport {
  ok: boolean
  tag: string
  commit: string
  releasedAt: string
  sourceMatches: boolean
  moduleCount: number
  drift: FiboLockDrift[]
}

/** 包内模块 versionIRI 与锁文件对账；sourceMatches=包声明的 release 与锁 tag 一致。 */
export function fiboLockReport(): FiboLockReport {
  const drift: FiboLockDrift[] = []
  for (const [key, m] of Object.entries(FIBO_MODULES)) {
    const expected = (FIBO_LOCK.modules as Record<string, string>)[key]
    if (expected === undefined) {
      drift.push({ module: key, expected: '(lock 无此模块)', actual: m.versionIri, reason: '锁文件缺模块' })
      continue
    }
    if (expected !== m.versionIri) {
      drift.push({ module: key, expected, actual: m.versionIri, reason: 'versionIRI 不一致' })
    }
  }
  return {
    ok: drift.length === 0 && FIBO_SOURCE.release === FIBO_LOCK.tag,
    tag: FIBO_LOCK.tag,
    commit: FIBO_LOCK.commit,
    releasedAt: FIBO_LOCK.releasedAt,
    sourceMatches: FIBO_SOURCE.release === FIBO_LOCK.tag,
    moduleCount: Object.keys(FIBO_MODULES).length,
    drift,
  }
}
