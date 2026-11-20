// overlay/custom/client/kanban/api/outcome.ts
// Outcome 域 REST 客户端（批一 Task 13）：authFetch 封装照 ide/api/workitem.ts
// 范式，DTO 自持（不 import custom/server——客户端不依赖服务端模块）。
// 服务端正身：custom/server/outcome/outcome-controller.ts（响应形状以它为准）。
//
// 契约要点：
// - 功能门：OUTCOME_WORKBENCH≠1 → 全端点 404 {code:'outcome_workbench_disabled'}，
//   本模块抛 OutcomeWorkbenchDisabledError，组件据此整段不渲染（不报错）。
// - 客户端不传身份面（signedBy/actor/recordedBy）——服务端一律取登录态，
//   白名单外的键被静默丢弃（见控制器 CONTRACT_INPUT_FIELDS 注释）。
// - 幂等键（eventId/measurementId/settlementId）由本模块生成 uuid 后缀，
//   网络重试同键落账不重复；作用域组合（actor:键）由服务端落账时拼接。
// - 读侧边界（fail-soft 不造假）：批一后端只有合同列表/详情与快照列表读端点，
//   无测量/结算读端点——「最新测量」「结算摘要」仅能由本会话提交响应回显，
//   面板如实标注，不猜数。
import { authFetch } from '@/custom/shared/http'

export type OutcomeStatus = 'draft' | 'active' | 'observing' | 'settled' | 'cancelled'
export type OutcomeVerdict = 'achieved' | 'partial' | 'missed' | 'unknown'
export type MeasureAvailability = 'available' | 'pending' | 'unavailable'
export type MeasureOperator = 'gte' | 'lte' | 'eq'

export interface OutcomeMeasure {
  measureId: string
  name: string
  definition: string
  unit: string
  operator: MeasureOperator
  /** null=合法未知（不得自动补零） */
  baseline: number | null
  target: number
  sourceRef: string
}

export interface OutcomeContract {
  schemaVersion: 1
  outcomeId: string
  rootTaskId: string
  version: number
  title: string
  valueStatement: string
  ownerPersonId: string
  measures: OutcomeMeasure[]
  acceptance: { statements: string[]; requiredEvidenceKinds: string[] }
  scope: { included: string[]; excluded: string[] }
  riskTier: 'low' | 'medium' | 'high'
  defaultReversibility: 'reversible' | 'costly' | 'one-way' | 'unknown'
  verificationOwnerId: string
  contextPolicy: { allowedScopes: string[]; excludedSourceKinds: string[] }
  learningOptIn: boolean
  status: OutcomeStatus
  createdAt: number
  updatedAt: number
}

export interface OutcomeMeasurement {
  measurementId: string
  outcomeId: string
  measureId: string
  contractVersion: number
  /** null=合法未知（availability 非 available 时） */
  actual: number | null
  availability: MeasureAvailability
  evidenceRefs: string[]
  observedAt: number
  recordedBy: string
  recordedAt: number
}

export interface OutcomeSettlement {
  settlementId: string
  outcomeId: string
  contractVersion: number
  verdict: OutcomeVerdict
  rationale: string
  measurementIds: string[]
  gapNote?: string
  nextReviewAt?: number
  signedBy: string
  signedAt: number
}

export interface OutcomeSnapshotSummary {
  snapshotId: string
  contractVersion: number
  createdAt: number
  sha256: string
}

/** 功能门关闭专用错误：组件按 instanceof 整段隐藏本区（不显示报错）。 */
export class OutcomeWorkbenchDisabledError extends Error {
  readonly code = 'outcome_workbench_disabled'
  constructor() {
    super('结果工作台未启用（需 OUTCOME_WORKBENCH=1）')
    this.name = 'OutcomeWorkbenchDisabledError'
  }
}

/** 幂等键生成（服务端控制器同风格：前缀 + 时间 36 进制 + 随机尾巴）。 */
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 统一响应解析：门关 404 抛专用错误；其余失败拼 problems 成可读 Error。 */
async function requestOutcome(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await authFetch(path, init)
  let j: Record<string, unknown> | null = null
  try {
    j = (await res.json()) as Record<string, unknown>
  } catch {
    /* 非 JSON 体（网关错误页等）→ 走下面状态码分支 */
  }
  if (res.status === 404 && j?.code === 'outcome_workbench_disabled') {
    throw new OutcomeWorkbenchDisabledError()
  }
  if (!res.ok || j?.ok === false) {
    const problems = Array.isArray(j?.problems) ? (j.problems as string[]).join('；') : ''
    const base = typeof j?.error === 'string' ? j.error : `请求失败（HTTP ${res.status}）`
    throw new Error(problems ? `${base}：${problems}` : base)
  }
  return j ?? {}
}

/** 按根任务取合同（rootTaskId 冲突由服务端 409 保证唯一，取首条）；无合同=null。 */
export async function fetchOutcomeByRoot(rootTaskId: string): Promise<OutcomeContract | null> {
  const j = await requestOutcome(`/api/hermes/outcomes?rootTaskId=${encodeURIComponent(rootTaskId)}`)
  const items = Array.isArray(j.items) ? (j.items as OutcomeContract[]) : []
  return items.length > 0 ? items[0]! : null
}

/** 快照摘要列表（快照计数用；坏行服务端读侧已跳过）。 */
export async function fetchOutcomeSnapshots(outcomeId: string): Promise<OutcomeSnapshotSummary[]> {
  const j = await requestOutcome(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/context`)
  return Array.isArray(j.snapshots) ? (j.snapshots as OutcomeSnapshotSummary[]) : []
}

export interface TransitionInput {
  to: OutcomeStatus
  /** →cancelled 必填（服务端 reason_required 守卫）。 */
  reason?: string
}

/** 状态迁移（draft→active 激活 / active→observing / →cancelled 取消）。 */
export async function transitionOutcome(
  outcomeId: string,
  input: TransitionInput,
): Promise<OutcomeContract> {
  const j = await requestOutcome(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ to: input.to, ...(input.reason ? { reason: input.reason } : {}), eventId: genId('evt') }),
  })
  return j.contract as OutcomeContract
}

export interface MeasurementInput {
  measureId: string
  /** 须等于合同当前 version（服务端 stale_contract 409 守卫）。 */
  contractVersion: number
  /** availability 非 available 时可传 null（合法未知，不补零）。 */
  actual: number | null
  availability: MeasureAvailability
  /** 必填非空（服务端控制器把关：spec §4.6 无论来源必须附证据引用）。 */
  evidenceRefs: string[]
}

/** 测量提交（owner 或 verifier；幂等键 measurementId 由本模块生成）。 */
export async function submitMeasurement(
  outcomeId: string,
  input: MeasurementInput,
): Promise<OutcomeMeasurement> {
  const j = await requestOutcome(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/measurements`, {
    method: 'POST',
    body: JSON.stringify({ ...input, measurementId: genId('mea') }),
  })
  return j.measurement as OutcomeMeasurement
}

export interface SettlementInput {
  verdict: OutcomeVerdict
  /** trim 后 ≥20 字（服务端 SETTLEMENT_RATIONALE_MIN 同口径，前端先提示）。 */
  rationale: string
  measurementIds: string[]
  contractVersion: number
  /** verdict='unknown' 必填：证据缺口说明。 */
  gapNote?: string
  /** verdict='unknown' 必填：下次复审时间戳（ms epoch，须晚于签署时刻）。 */
  nextReviewAt?: number
}

/** 结算签署（owner only；仅 observing 合同可结算）。 */
export async function settleOutcome(
  outcomeId: string,
  input: SettlementInput,
): Promise<OutcomeSettlement> {
  const j = await requestOutcome(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/settlement`, {
    method: 'POST',
    body: JSON.stringify({ ...input, settlementId: genId('set') }),
  })
  return j.settlement as OutcomeSettlement
}
