// custom/server/outcome/validate.ts
// OutcomeContract 输入校验：纯函数、不读盘、不抛异常。problems 为空=输入可接受。
// 分离规则与责任卡同源（agentidentity/responsibility.ts 先例）：高风险强制
// verificationOwnerId 与 ownerPersonId 分离；低/中风险允许同人，但经
// separationNotice 返回「未分离」提示供人判断，不作为 problem 阻断。
import {
  MEASURE_OPERATORS,
  OUTCOME_STATUSES,
  REVERSIBILITY_LEVELS,
  RISK_TIERS,
} from './types'

export interface ContractValidation {
  problems: string[]
  /** 低/中风险结果责任人与验证责任人同人时的未分离提示；null=无提示。不阻断。 */
  separationNotice: string | null
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v)
const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const oneOf = <T extends string>(allowed: readonly T[], v: unknown): boolean =>
  (allowed as readonly string[]).includes(v as string)

/** rootTaskId 长度上限：任务 ID 是外部系统坐标，超长视为坐标失真直接拒绝。 */
const ROOT_TASK_ID_MAX = 128

export function validateContractInput(v: unknown): ContractValidation {
  const problems: string[] = []
  let separationNotice: string | null = null

  const c = asRecord(v)
  if (!c) return { problems: ['输入须为 OutcomeContract 对象'], separationNotice: null }

  if (c.schemaVersion !== 1) problems.push('schemaVersion 必须为 1')
  if (!nonEmpty(c.outcomeId)) problems.push('outcomeId 必填')
  if (!nonEmpty(c.rootTaskId)) problems.push('rootTaskId 必填')
  else if (c.rootTaskId.length > ROOT_TASK_ID_MAX)
    problems.push(`rootTaskId 不得超过 ${ROOT_TASK_ID_MAX} 字符`)
  if (typeof c.version !== 'number' || !Number.isInteger(c.version) || c.version < 1)
    problems.push('version 须为正整数')
  if (!nonEmpty(c.title)) problems.push('title 必填')
  if (!nonEmpty(c.valueStatement)) problems.push('valueStatement 必填')
  if (!nonEmpty(c.ownerPersonId)) problems.push('ownerPersonId 必填')

  const processRef = c.processRef
  if (processRef !== undefined) {
    const p = asRecord(processRef)
    if (!p) problems.push('processRef 须为对象')
    else {
      if (!nonEmpty(p.processId)) problems.push('processRef.processId 必填')
      if (!nonEmpty(p.definitionVersion)) problems.push('processRef.definitionVersion 必填')
    }
  }

  if (!Array.isArray(c.measures)) problems.push('measures 须为数组')
  else {
    // measureId 是测量记录的绑定键（spec §4.1：定义未变时按 measureId 追加观测），
    // 重复 ID 会让测量挂错定义，必须唯一。
    const seenMeasureIds = new Set<string>()
    c.measures.forEach((m, i) => {
      const mm = asRecord(m)
      if (!mm) {
        problems.push(`measures[${i}] 须为对象`)
        return
      }
      if (!nonEmpty(mm.measureId)) problems.push(`measures[${i}].measureId 必填`)
      else if (seenMeasureIds.has(mm.measureId))
        problems.push(`measures[${i}].measureId 重复（${mm.measureId}）`)
      else seenMeasureIds.add(mm.measureId)
      if (!nonEmpty(mm.name)) problems.push(`measures[${i}].name 必填`)
      if (!nonEmpty(mm.definition)) problems.push(`measures[${i}].definition 必填`)
      if (!nonEmpty(mm.unit)) problems.push(`measures[${i}].unit 必填`)
      if (!oneOf(MEASURE_OPERATORS, mm.operator))
        problems.push(`measures[${i}].operator 须为 gte|lte|eq`)
      // baseline=null 是合法未知；除此之外必须是有限数值（spec §4.1：不得自动补零）。
      if (mm.baseline !== null && !isFiniteNumber(mm.baseline))
        problems.push(`measures[${i}].baseline 须为有限数值或 null`)
      if (!isFiniteNumber(mm.target)) problems.push(`measures[${i}].target 须为有限数值`)
      if (!nonEmpty(mm.sourceRef)) problems.push(`measures[${i}].sourceRef 必填`)
    })
  }

  const acc = asRecord(c.acceptance)
  if (!acc) problems.push('acceptance 须为对象')
  else {
    if (!isStrArray(acc.statements)) problems.push('acceptance.statements 须为字符串数组')
    if (!isStrArray(acc.requiredEvidenceKinds))
      problems.push('acceptance.requiredEvidenceKinds 须为字符串数组')
  }

  // spec §4.1 规则：至少一个 measure 或一条定性验收陈述，两者都空不得离开 draft。
  const measuresEmpty = Array.isArray(c.measures) && c.measures.length === 0
  const statements = acc ? acc.statements : undefined
  const statementsEmpty =
    isStrArray(statements) && statements.every((s) => s.trim().length === 0)
  if (measuresEmpty && statementsEmpty)
    problems.push('measures 与 acceptance.statements 不得同时为空（至少一个度量或一条验收陈述）')

  const scope = asRecord(c.scope)
  if (!scope) problems.push('scope 须为对象')
  else {
    if (!isStrArray(scope.included)) problems.push('scope.included 须为字符串数组')
    if (!isStrArray(scope.excluded)) problems.push('scope.excluded 须为字符串数组')
  }

  if (!oneOf(RISK_TIERS, c.riskTier)) problems.push('riskTier 须为 low|medium|high')
  if (!oneOf(REVERSIBILITY_LEVELS, c.defaultReversibility))
    problems.push('defaultReversibility 须为 reversible|costly|one-way|unknown')

  if (!nonEmpty(c.verificationOwnerId)) problems.push('verificationOwnerId 必填')
  if (nonEmpty(c.ownerPersonId) && c.ownerPersonId === c.verificationOwnerId) {
    if (c.riskTier === 'high')
      problems.push('高风险合同 verificationOwnerId 不得与 ownerPersonId 为同一人')
    else if (c.riskTier === 'low' || c.riskTier === 'medium')
      separationNotice = '结果责任人与验证责任人为同一人（中低风险允许，但未分离）'
  }

  const contextPolicy = asRecord(c.contextPolicy)
  if (!contextPolicy) problems.push('contextPolicy 须为对象')
  else {
    if (!isStrArray(contextPolicy.allowedScopes))
      problems.push('contextPolicy.allowedScopes 须为字符串数组')
    if (!isStrArray(contextPolicy.excludedSourceKinds))
      problems.push('contextPolicy.excludedSourceKinds 须为字符串数组')
  }

  if (typeof c.learningOptIn !== 'boolean') problems.push('learningOptIn 须为布尔值')
  if (!oneOf(OUTCOME_STATUSES, c.status))
    problems.push('status 须为 draft|active|observing|settled|cancelled')
  if (!isFiniteNumber(c.createdAt)) problems.push('createdAt 须为有限数值')
  if (!isFiniteNumber(c.updatedAt)) problems.push('updatedAt 须为有限数值')

  return { problems, separationNotice }
}
