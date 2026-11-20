// overlay[outcome/comparison]（批二 T6）：同口径结果对照投影（spec §五）。
//
// 语义（纯投影不写账）：当前结果（evaluation）与最近一个同口径已结算基线
// （baseline＝measureId＋definition 逐字相同的其他 settled 合同）逐度量并排；
// effect 恒三态 improved|degraded|unknown——不足两个同口径已结算结果、或口径
// （measureId/definition）不一致时恒 unknown 且带缺口说明。「已注入」永不等于
// 「有效」，本投影不消费召回留痕（那是事实，不是效果）。
import type { OutcomeContract, OutcomeMeasurement } from './types'

/** 对照入参的已结算方（控制器装配：合同＋当前版本测量＋最新结算）。 */
export interface SettledOutcomeForComparison {
  contract: OutcomeContract
  measurements: OutcomeMeasurement[]
  settlement: { settlementId: string; verdict: string; signedAt: number }
}

export interface ComparisonRow {
  measureId: string
  name: string
  definition: string
  target: number
  operator: string
  baseline: { outcomeId: string; actual: number | null; availability: string } | null
  evaluation: { outcomeId: string; actual: number | null; availability: string } | null
}

export type ComparisonEffect = 'improved' | 'degraded' | 'unknown'

export interface OutcomeComparison {
  evaluationOutcomeId: string
  baselineOutcomeId: string | null
  effect: ComparisonEffect
  gapNote: string
  rows: ComparisonRow[]
}

/** 度量口径键：measureId＋definition 逐字（口径漂移即不同度量，不勉强对比）。 */
function caliberKey(m: { measureId: string; definition: string }): string {
  return `${m.measureId}::${m.definition}`
}

/** 某 measure 的当前版本最新测量（contractVersion 过滤与 settlement 同源纪律）。 */
function latestFor(measureId: string, o: SettledOutcomeForComparison): OutcomeMeasurement | null {
  const hits = o.measurements
    .filter((m) => m.measureId === measureId && m.contractVersion === o.contract.version)
    .sort((a, b) => b.observedAt - a.observedAt)
  return hits[0] ?? null
}

function metCount(o: SettledOutcomeForComparison): { met: number; decided: number } {
  let met = 0
  let decided = 0
  for (const m of o.contract.measures) {
    const latest = latestFor(m.measureId, o)
    if (!latest || latest.availability !== 'available' || latest.actual === null) continue
    decided += 1
    const ok = m.operator === 'gte' ? latest.actual >= m.target
      : m.operator === 'lte' ? latest.actual <= m.target
      : latest.actual === m.target
    if (ok) met += 1
  }
  return { met, decided }
}

/** 选基线：其他 settled 合同中与 evaluation 至少一个度量同口径者，取 signedAt 最新。 */
export function pickBaseline(evaluation: SettledOutcomeForComparison, others: SettledOutcomeForComparison[]): SettledOutcomeForComparison | null {
  const evalKeys = new Set(evaluation.contract.measures.map(caliberKey))
  const candidates = others
    .filter((o) => o.contract.outcomeId !== evaluation.contract.outcomeId)
    .filter((o) => o.contract.measures.some((m) => evalKeys.has(caliberKey(m))))
    .sort((a, b) => b.settlement.signedAt - a.settlement.signedAt)
  return candidates[0] ?? null
}

/** 对照投影主函数（纯函数）。 */
export function buildOutcomeComparison(
  evaluation: SettledOutcomeForComparison,
  others: SettledOutcomeForComparison[],
): OutcomeComparison {
  const baseline = pickBaseline(evaluation, others)
  const rows: ComparisonRow[] = evaluation.contract.measures.map((m) => {
    const evalLatest = latestFor(m.measureId, evaluation)
    // 基线行只填同口径度量（measureId＋definition 逐字相同）；不同口径列 null
    const sameCaliber = baseline?.contract.measures.find(
      (b) => caliberKey(b) === caliberKey(m) && b.measureId === m.measureId,
    )
    const baseLatest = sameCaliber && baseline ? latestFor(m.measureId, baseline) : null
    return {
      measureId: m.measureId,
      name: m.name,
      definition: m.definition,
      target: m.target,
      operator: m.operator,
      baseline: baseline && sameCaliber && baseLatest
        ? { outcomeId: baseline.contract.outcomeId, actual: baseLatest.actual, availability: baseLatest.availability }
        : null,
      evaluation: evalLatest
        ? { outcomeId: evaluation.contract.outcomeId, actual: evalLatest.actual, availability: evalLatest.availability }
        : null,
    }
  })

  if (!baseline) {
    return {
      evaluationOutcomeId: evaluation.contract.outcomeId,
      baselineOutcomeId: null,
      effect: 'unknown',
      gapNote: `不足两个同口径已结算结果（现仅 ${others.length + 1} 个已结算，且无与本次度量定义一致的其他结果）——效果恒未知，不宣称改善（spec §五）`,
      rows,
    }
  }
  const evalStat = metCount(evaluation)
  const baseStat = metCount(baseline)
  // 同口径可判度量数（双方都有 available 测量的共有度量）不足→unknown
  const comparable = rows.filter((r) => r.baseline !== null && r.evaluation?.availability === 'available' && r.baseline.availability === 'available')
  if (comparable.length === 0) {
    return {
      evaluationOutcomeId: evaluation.contract.outcomeId,
      baselineOutcomeId: baseline.contract.outcomeId,
      effect: 'unknown',
      gapNote: '基线与本次无双方均可判的同口径度量（测量缺口），效果恒未知',
      rows,
    }
  }
  // 判据：可判度量上达成数严格多为 improved、严格少为 degraded；相等＝无变化，
  // 不构成「有改善迹象」→ unknown（保守：宁 unknown 不宣称）。
  const evalMet = comparable.filter((r) => {
    const m = evaluation.contract.measures.find((x) => x.measureId === r.measureId)!
    const v = r.evaluation!.actual!
    return m.operator === 'gte' ? v >= m.target : m.operator === 'lte' ? v <= m.target : v === m.target
  }).length
  const baseMet = comparable.filter((r) => {
    const m = baseline.contract.measures.find((x) => x.measureId === r.measureId)
    if (!m) return false
    const v = r.baseline!.actual!
    return m.operator === 'gte' ? v >= m.target : m.operator === 'lte' ? v <= m.target : v === m.target
  }).length
  const effect: ComparisonEffect = evalMet > baseMet ? 'improved' : evalMet < baseMet ? 'degraded' : 'unknown'
  const gapNote = effect === 'unknown'
    ? `达成数持平（${evalMet}/${comparable.length} vs 基线 ${baseMet}/${comparable.length}）——无变化不构成改善迹象，效果恒未知`
    : `可判同口径度量 ${comparable.length} 项：本次达成 ${evalMet} vs 基线 ${baseMet}`
  void evalStat; void baseStat
  return {
    evaluationOutcomeId: evaluation.contract.outcomeId,
    baselineOutcomeId: baseline.contract.outcomeId,
    effect,
    gapNote,
    rows,
  }
}
