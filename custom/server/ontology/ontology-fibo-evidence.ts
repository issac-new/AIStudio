/**
 * FIBO 报告证据（P1-1，2026-10-21）。
 *
 * 报告生成器只消费本端点返回值，不自算覆盖率：发布版本、覆盖度、校验三档、
 * 版本锁、门禁索引引用一次取齐。未导入时如实写「未导入」，不写 0。
 * markdown 字段可直接嵌进报告「本体证据面」小节。
 */
import {
  FIBO_SOURCE, fiboPackApplied, fiboPackSummary,
} from './ontology-fibo'
import { fiboLockReport, type FiboLockReport } from './ontology-fibo-lock'
import type { OntologyInstance, OntologySpec } from './ontology-types'
import { validateInstances, violationSummary } from './ontology-validate'

export interface FiboEvidence {
  generatedAt: string
  source: {
    repo: string
    release: string
    releasedAt: string
    retrievedAt: string
    license: string
    commit: string
  }
  coverage: {
    applied: number
    total: number
    ratio: string
    fibo: number
    commons: number
    localExtensions: number
    imported: boolean
  }
  health: { error: number; warning: number; info: number }
  lock: FiboLockReport
  gate: {
    index: string
    concepts: number
    consistency: 'verified-by-test'
    test: string
  }
  markdown: string
}

function buildMarkdown(input: {
  coverage: FiboEvidence['coverage']
  health: FiboEvidence['health']
  lock: FiboLockReport
}): string {
  const { coverage, health, lock } = input
  const lines = [
    '### FIBO 覆盖',
    `- 发布：${FIBO_SOURCE.release}（${FIBO_SOURCE.releasedAt}，commit ${lock.commit.slice(0, 8)}）`,
    coverage.imported
      ? `- 覆盖：${coverage.applied}/${coverage.total}（FIBO ${coverage.fibo} / Commons ${coverage.commons} / 工程扩展 ${coverage.localExtensions}）`
      : `- 覆盖：未导入（可导入 ${coverage.total} 个概念）`,
    `- 校验：error ${health.error} / warning ${health.warning} / info ${health.info}`,
    '- 门禁索引：18 概念，一致性由 ontology-fibo-gate-consistency.test.ts 守门',
    `- 版本锁：${lock.ok ? 'OK' : 'DRIFT'}（${lock.moduleCount} 模块）`,
  ]
  if (!lock.ok) {
    for (const d of lock.drift.slice(0, 5)) lines.push(`  - 漂移 ${d.module}：${d.reason}`)
  }
  return lines.join('\n')
}

export function fiboEvidence(
  spec: OntologySpec,
  instances: OntologyInstance[],
  now = Date.now(),
): FiboEvidence {
  const pack = fiboPackSummary()
  const applied = fiboPackApplied(spec)
  const health = violationSummary(validateInstances(spec, instances))
  const lock = fiboLockReport()
  const coverage: FiboEvidence['coverage'] = {
    applied: applied.concepts,
    total: applied.total,
    ratio: `${applied.concepts}/${applied.total}`,
    fibo: pack.counts.fibo,
    commons: pack.counts.commons,
    localExtensions: pack.counts.localExtensions,
    imported: applied.concepts > 0,
  }
  return {
    generatedAt: new Date(now).toISOString(),
    source: {
      repo: FIBO_SOURCE.repo,
      release: FIBO_SOURCE.release,
      releasedAt: FIBO_SOURCE.releasedAt,
      retrievedAt: FIBO_SOURCE.retrievedAt,
      license: FIBO_SOURCE.license,
      commit: lock.commit,
    },
    coverage,
    health,
    lock,
    gate: {
      index: 'custom/qgate/gate-packs/ontology/data/fibo-mini.json',
      concepts: 18,
      consistency: 'verified-by-test',
      test: 'ontology-fibo-gate-consistency.test.ts',
    },
    markdown: buildMarkdown({ coverage, health, lock }),
  }
}
