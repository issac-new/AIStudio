// custom/server/outcome/settlement.ts
// 结算建议与结算入参校验（spec 2026-11-19-ai-native-operating-model-design.md
// §4.2 Settlement；Task 4）。纯函数：无 IO、无时间依赖——签署落账（settlement_signed
// 事件、signedBy/signedAt）归 Task 7 控制器组装，本模块只做机器侧裁决与把关。
//
// 版本绑定语义（spec §4.1「定义改变后旧测量只作历史」）：每个 measure 只认
// contractVersion === contract.version 的最新一条测量——旧版本记录即使
// observedAt 更新也不参与选取，防止用改版前的口径给新版合同判绿。
import { OUTCOME_VERDICTS } from './types'
import type {
  MeasureOperator,
  OutcomeContract,
  OutcomeMeasurement,
  OutcomeVerdict,
} from './types'

/** 单 measure 机器判定：met=null 表示「有测量但值不可用」（actual 未知或
 *  availability 非 available），与「缺当前版本测量」分开表达——前者是证据缺口，
 *  后者是绑定失败，missingMeasureIds 只收后者。 */
export interface PerMeasureMet {
  measureId: string
  met: boolean | null
}

/** 单度量的基线对照读数（B5 2026-11-28）：合同自带 baseline 与当前版本实测的并排。
 *  只读披露，不参与 verdict 判定（判定只看 actual vs target，spec §4.2 口径不变）。
 *  方向说明按算子翻转：gte 下 actual≥基线为优于，lte 下 actual≤基线为优于；eq 无方向语义。 */
export interface MeasureBaselineReading {
  measureId: string
  name: string
  /** 合同自带基线；null=未登记（合法未知，不补零造对照） */
  baseline: number | null
  /** 当前版本最新实测；null=测量缺席或不可用 */
  actual: number | null
  operator: MeasureOperator
  /** actual − baseline；eq 或任一侧为 null 时为 null */
  deltaFromBaseline: number | null
  /** 人读说明（含「未登记基线」「测量缺席」的缺口态） */
  note: string
}

export interface SuggestVerdictResult {
  verdict: OutcomeVerdict
  /** 与 contract.measures 同序同长（含缺失位 met=null），供签署人逐条核对。 */
  perMeasure: PerMeasureMet[]
  /** 无任何当前版本测量记录的 measureId（合同序）；非空则 verdict 恒为 unknown。 */
  missingMeasureIds: string[]
  /** 基线对照读数（合同序；B5 2026-11-28，签署人核对时「比起点进步多少」的依据面） */
  baselineReadings: MeasureBaselineReading[]
}

/** operator 与 target 精确比较（spec §4.2 裁决口径；gte/lte 含等、eq 严格相等，
 *  不做容差——IEEE 浮点相等即字面相等，模糊达标须在合同侧改 target/操作符）。 */
function metBy(operator: MeasureOperator, actual: number, target: number): boolean {
  if (operator === 'gte') return actual >= target
  if (operator === 'lte') return actual <= target
  return actual === target
}

/** 选取某 measure 的当前版本最新测量：observedAt 最大者；平局取数组中后出现者
 *  （后写覆盖前写）。只看版本与 measureId 双匹配，outcomeId 不符视同无记录（fail-closed）。
 *  导出供读端点复用（Task 15 GET /:id/measurements 的 latest 摘要同一绑定口径：
 *  单一事实源——「每 measure 最新一条」不得另写一套版本过滤）。 */
export function latestCurrentMeasurement(
  contract: OutcomeContract,
  measurements: OutcomeMeasurement[],
  measureId: string,
): OutcomeMeasurement | null {
  let latest: OutcomeMeasurement | null = null
  for (const m of measurements) {
    if (m.outcomeId !== contract.outcomeId) continue
    if (m.contractVersion !== contract.version || m.measureId !== measureId) continue
    if (latest === null || m.observedAt >= latest.observedAt) latest = m
  }
  return latest
}

/** 机器侧裁决建议：按当前合同版本绑定测量并给出 verdict。
 *  任一 measure 缺当前版本测量（missingMeasureIds 非空）或任一判定值为 null
 *  （actual 未知/数据源不可用）→ unknown——证据不齐不是绿色通过（types.ts
 *  §3.2 注）；全有值才进 achieved/partial/missed 三分支。零度量合同（仅定性
 *  验收）无量化依据，同样判 unknown 交签署人裁量，不作空泛 achieved。 */
export function suggestVerdict(
  contract: OutcomeContract,
  measurements: OutcomeMeasurement[],
): SuggestVerdictResult {
  const measures = Array.isArray(contract?.measures) ? contract.measures : []
  const pool = Array.isArray(measurements) ? measurements : []

  const perMeasure: PerMeasureMet[] = []
  const missingMeasureIds: string[] = []

  for (const measure of measures) {
    const latest = latestCurrentMeasurement(contract, pool, measure.measureId)
    if (latest === null) {
      missingMeasureIds.push(measure.measureId)
      perMeasure.push({ measureId: measure.measureId, met: null })
      continue
    }
    if (latest.actual === null || latest.availability !== 'available') {
      perMeasure.push({ measureId: measure.measureId, met: null })
      continue
    }
    perMeasure.push({
      measureId: measure.measureId,
      met: metBy(measure.operator, latest.actual, measure.target),
    })
  }

  let verdict: OutcomeVerdict
  if (measures.length === 0 || missingMeasureIds.length > 0 || perMeasure.some((p) => p.met === null)) {
    verdict = 'unknown'
  } else if (perMeasure.every((p) => p.met === true)) verdict = 'achieved'
  else if (perMeasure.every((p) => p.met === false)) verdict = 'missed'
  else verdict = 'partial'

  // 基线对照读数（B5 2026-11-28）：只读披露，不改判定。与 perMeasure 同序，缺失测量照列。
  const baselineReadings: MeasureBaselineReading[] = measures.map((m) => {
    const latest = latestCurrentMeasurement(contract, pool, m.measureId)
    const actual = latest !== null && latest.availability === 'available' ? latest.actual : null
    const baseline = m.baseline
    const delta = baseline !== null && actual !== null && m.operator !== 'eq' ? actual - baseline : null
    let note: string
    if (baseline === null) note = '合同未登记基线，无从对照起点（不补零造对照）'
    else if (actual === null) note = '当前版本测量缺席或不可用，无实际值可比'
    else if (m.operator === 'eq') note = `基线 ${baseline}，实际 ${actual}（eq 算子无方向语义，只列两值）`
    else {
      const better = m.operator === 'gte' ? actual >= baseline : actual <= baseline
      note = `基线 ${baseline}，实际 ${actual}：${better ? '优于基线' : '劣于基线'}（${m.operator === 'gte' ? '越高越好' : '越低越好'}）`
    }
    return {
      measureId: m.measureId,
      name: m.name,
      baseline,
      actual,
      operator: m.operator,
      deltaFromBaseline: delta,
      note,
    }
  })

  return { verdict, perMeasure, missingMeasureIds, baselineReadings }
}

/** 结算签署入参（控制器 Task 7 组装 Settlement 正身前的把关面；spec §4.2
 *  Settlement 至少含合同快照/measurementIds/verdict/rationale 等，快照与签署
 *  字段由控制器补，此处只校人给的三项＋unknown 缺口字段）。 */
export interface SettlementSignInput {
  verdict: OutcomeVerdict
  rationale: string
  /** 本次引用的测量记录 id（OutcomeMeasurement.measurementId，非 measureId）。 */
  measurementIds: string[]
  /** verdict='unknown' 必填：证据缺口说明（缺哪个口径/为何无法判定）。 */
  gapNote?: string
  /** verdict='unknown' 必填：下次复审时间戳（ms epoch）。 */
  nextReviewAt?: number
}

export interface SettlementValidation {
  /** 空数组=输入可接受；与 validateContractInput 同契约（不抛异常）。 */
  problems: string[]
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')
const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** rationale 下限：trim 后至少 20 字——结算是对外承诺的正式收口，一句话理由
 *  不足以复核（简报裁决「19 字拒」的对称面）。 */
export const SETTLEMENT_RATIONALE_MIN = 20

/** 结算入参校验：verdict 形状、rationale 长度、measurementIds ⊆ 当前版本测量
 *  id 集（旧版本/伪造 id 一律拒——引用集须能逐条对回本版合同口径）；
 *  合同存在任一当前版本测量时 measurementIds 不得为空（终审 I-2：空引用集
 *  断链——测量在账而结算不引用，裁决失去证据锚点；纯定性合同无任何当前
 *  版本测量，空数组仍放行）；verdict='unknown' 追加 gapNote 非空＋
 *  nextReviewAt 合法时间戳（正有限数值）。非 unknown 不强制缺口字段
 *  （不禁止携带，签署人自愿补充复审计划不作 problem）。 */
export function validateSettlementInput(
  input: unknown,
  contract: OutcomeContract,
  measurements: OutcomeMeasurement[],
): SettlementValidation {
  const problems: string[] = []
  const s = asRecord(input)
  if (!s) return { problems: ['输入须为 SettlementSignInput 对象'] }

  if (!(OUTCOME_VERDICTS as readonly string[]).includes(s.verdict as string))
    problems.push(`verdict 须为 ${OUTCOME_VERDICTS.join('|')} 之一`)

  const rationale = typeof s.rationale === 'string' ? s.rationale.trim() : ''
  if (rationale.length < SETTLEMENT_RATIONALE_MIN)
    problems.push(`rationale trim 后须至少 ${SETTLEMENT_RATIONALE_MIN} 字（现 ${rationale.length} 字）`)

  if (!isStrArray(s.measurementIds)) problems.push('measurementIds 须为字符串数组')
  else {
    // 合法引用集：仅当前版本测量（spec §4.1 旧测量只作历史）；outcomeId 同合同。
    const pool = Array.isArray(measurements) ? measurements : []
    const validIds = new Set(
      pool
        .filter(
          (m) =>
            contract && m.outcomeId === contract.outcomeId && m.contractVersion === contract.version,
        )
        .map((m) => m.measurementId),
    )
    const foreign = s.measurementIds.filter((id) => !validIds.has(id))
    if (foreign.length)
      problems.push(
        `measurementIds 含当前版本（v${contract?.version ?? '?'}）测量之外的 id：${foreign.join('、')}`,
      )
    // 终审 I-2：测量在账而结算引用集为空＝证据链断链——有当前版本测量时
    // 空数组拒（引用集至少含一条在账测量）；无任何当前版本测量（纯定性合同
    // 或全缺口合同）不设此门，空数组合法。
    else if (s.measurementIds.length === 0 && validIds.size > 0)
      problems.push(
        `measurementIds 不得为空：当前版本（v${contract?.version ?? '?'}）已有 ${validIds.size} 条在账测量，结算引用集须包含至少一条（纯定性结算仅适用于无任何当前版本测量的合同）`,
      )
  }

  if (s.verdict === 'unknown') {
    if (!nonEmpty(s.gapNote)) problems.push('verdict=unknown 必须携带非空 gapNote（证据缺口说明）')
    if (
      typeof s.nextReviewAt !== 'number' ||
      !Number.isFinite(s.nextReviewAt) ||
      s.nextReviewAt <= 0
    )
      problems.push('verdict=unknown 必须携带合法 nextReviewAt 时间戳（正有限数值，ms epoch）')
  }

  return { problems }
}
