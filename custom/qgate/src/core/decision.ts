// Decision Engine（设计 §5.1 decision.ts）：evidence → verdict。
// 纪律：No Evidence ≠ PASS（v0.1 §4.2）；仅 exercised 级可支撑 PASS（设计 §4.2）。

import { supportsPass } from './align.js'
import type { Evidence, EvidenceResult, GateSpec, GateVerdict } from './types.js'

export interface Decision {
  verdict: GateVerdict
  /** CONDITIONAL 必填解除条件；FAIL/INCONCLUSIVE 附原因摘要（explain 消费）。 */
  conditions?: string[]
  failureSummary?: string
  /** evidence type → 覆盖情况（缺什么一目了然）。 */
  coverage: Record<string, 'pass' | 'fail' | 'conditional' | 'error' | 'missing' | 'not-exercised'>
}

function coverageOf(evidence: readonly Evidence[], type: string): Decision['coverage'][string] {
  const matching = evidence.filter((e) => e.type === type)
  const latest = matching.length === 0 ? undefined : matching.reduce((a, b) => (b.provenance.startedAt >= a.provenance.startedAt ? b : a))
  if (!latest) return 'missing'
  if (latest.result === 'error') return 'error'
  if (latest.result === 'skipped') return 'missing'
  if (!supportsPass(latest.execution)) return 'not-exercised'
  return latest.result === 'fail' ? 'fail' : (latest.result === 'conditional' ? 'conditional' : 'pass')
}

export function decide(spec: GateSpec, evidence: readonly Evidence[]): Decision {
  const coverage: Decision['coverage'] = {}
  for (const type of spec.spec.evidence.required) coverage[type] = coverageOf(evidence, type)

  const entries = Object.entries(coverage) as [string, Decision['coverage'][string]][]
  const failed = entries.filter(([, v]) => v === 'fail')
  // Framework ERROR ≠ Gate FAIL（v0.1 §69）：executor 跑不起来 = 证据不可得 → INCONCLUSIVE
  const missing = entries.filter(([, v]) => v === 'missing' || v === 'not-exercised' || v === 'error')
  const conditional = entries.filter(([, v]) => v === 'conditional')

  // 1) 明确反驳 → FAIL；policy.warn 把 FAIL 降级为 CONDITIONAL（带解除条件）
  if (failed.length > 0) {
    const parts = failed.map(([t, v]) => `${t}:${v}`)
    if (spec.spec.policy.failure === 'warn') {
      return {
        verdict: 'CONDITIONAL',
        conditions: [`failing evidence accepted under warn policy: ${parts.join(', ')} — must be cleared before release`],
        coverage,
      }
    }
    return { verdict: 'FAIL', failureSummary: parts.join(', '), coverage }
  }

  // 2) 证据不足 → INCONCLUSIVE（不能 PASS）
  if (missing.length > 0) {
    const parts = missing.map(([t, v]) => `${t}:${v}`)
    if (spec.spec.policy.inconclusive === 'warn') {
      return {
        verdict: 'CONDITIONAL',
        conditions: [`insufficient evidence accepted under warn policy: ${parts.join(', ')}`],
        coverage,
      }
    }
    return { verdict: 'INCONCLUSIVE', failureSummary: parts.join(', '), coverage }
  }

  // 3) 条件型证据 → CONDITIONAL（解除条件 = 各证据条件汇总）
  if (conditional.length > 0) {
    const conds = conditional.map(([t]) => `evidence ${t} is conditional; clear its condition and re-run`)
    return { verdict: 'CONDITIONAL', conditions: conds, coverage }
  }

  return { verdict: 'PASS', coverage }
}

/** evidence result 的通用换算说明（explain 用，供 CLI 拼装人话）。 */
export function describeResult(result: EvidenceResult): string {
  switch (result) {
    case 'pass': return 'executor ran and asserted OK'
    case 'fail': return 'executor ran and assertion failed'
    case 'conditional': return 'executor ran with tolerated findings'
    case 'error': return 'executor could not run (framework error → not evidence)'
    case 'skipped': return 'executor skipped (not evidence)'
  }
}
