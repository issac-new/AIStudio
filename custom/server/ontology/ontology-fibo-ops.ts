/**
 * FIBO 运营快照（P4，2026-10-21）。
 *
 * 治理面一次取齐：报告证据、术语表计数、数据源映射计数、域目录计数、版本锁、
 * 门禁就绪与字段级权限试点。只读，不写本体。
 */
import { FIBO_FIELD_POLICIES } from './ontology-field-policy'
import { fiboDomains } from './ontology-fibo-domains'
import { fiboEvidence, type FiboEvidence } from './ontology-fibo-evidence'
import { fiboGlossary } from './ontology-fibo-glossary'
import { fiboLockReport, type FiboLockReport } from './ontology-fibo-lock'
import { fiboMappings } from './ontology-fibo-mapping'
import type { OntologyInstance, OntologySpec } from './ontology-types'

export interface FiboOpsSnapshot {
  generatedAt: string
  evidence: FiboEvidence
  glossary: { terms: number; aliased: number; reportTerms: number; mappedReportTerms: number }
  mappings: { total: number; mapped: number; unmapped: number }
  domains: { domains: number; concepts: number; ids: string[] }
  lock: FiboLockReport
  gate: FiboEvidence['gate']
  permissions: { policies: number; fields: string[] }
}

export function fiboOpsSnapshot(
  spec: OntologySpec,
  instances: OntologyInstance[],
  now = Date.now(),
): FiboOpsSnapshot {
  const evidence = fiboEvidence(spec, instances, now)
  const glossary = fiboGlossary()
  const mappings = fiboMappings()
  const domains = fiboDomains()
  const lock = fiboLockReport()
  return {
    generatedAt: new Date(now).toISOString(),
    evidence,
    glossary: glossary.counts,
    mappings: mappings.counts,
    domains: {
      domains: domains.length,
      concepts: domains.reduce((n, d) => n + d.concepts.length, 0),
      ids: domains.map((d) => d.id),
    },
    lock,
    gate: evidence.gate,
    permissions: {
      policies: FIBO_FIELD_POLICIES.length,
      fields: FIBO_FIELD_POLICIES.map((p) => `${p.type}.${p.field}`),
    },
  }
}
