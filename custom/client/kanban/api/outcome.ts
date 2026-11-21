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
// - 读面（Task 15 补齐）：GET /:id/measurements 与 GET /:id/settlement 已上线，
//   「最新实际值」「结算摘要」从服务端真实读取（latest 只认当前版本口径，
//   superseded 链如实下发）；读失败仍 fail-soft 回退会话内回显并标注。
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

/** 结构化失败（批四 T1）：携带 HTTP 状态、机器码与逐条 problems，供建模表单
 *  分形态展示（422 逐条列示/409 提示刷新）。message 保持既有拼接文案——
 *  既有消费面按 Error.message 显示，行为不变。 */
export class OutcomeApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly problems: string[]
  constructor(status: number, message: string, code: string | null = null, problems: string[] = []) {
    super(message)
    this.name = 'OutcomeApiError'
    this.status = status
    this.code = code
    this.problems = problems
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
    const problems = Array.isArray(j?.problems) ? (j.problems as string[]) : []
    const base = typeof j?.error === 'string' ? j.error : `请求失败（HTTP ${res.status}）`
    const code = typeof j?.code === 'string' ? j.code : null
    throw new OutcomeApiError(
      res.status,
      problems.length ? `${base}：${problems.join('；')}` : base,
      code,
      problems,
    )
  }
  return j ?? {}
}

/** 按根任务取合同（rootTaskId 冲突由服务端 409 保证唯一，取首条）；无合同=null。 */
export async function fetchOutcomeByRoot(rootTaskId: string): Promise<OutcomeContract | null> {
  const j = await requestOutcome(`/api/hermes/outcomes?rootTaskId=${encodeURIComponent(rootTaskId)}`)
  const items = Array.isArray(j.items) ? (j.items as OutcomeContract[]) : []
  return items.length > 0 ? items[0]! : null
}

// ---------- 建模创建（批四 T1：POST / 由 UI 接线） ----------
// 服务端控制器白名单（CONTRACT_INPUT_FIELDS）：schemaVersion/version/status/时间戳/
// outcomeId 由服务端定——客户端不传管理面字段；身份面（signedBy 等）一律不传。
export interface CreateOutcomeMeasureInput {
  measureId: string
  name: string
  definition: string
  unit: string
  operator: MeasureOperator
  /** null=合法未知（不得自动补零）；留空由表单转 null。 */
  baseline: number | null
  target: number
  sourceRef: string
}

export interface CreateOutcomeInput {
  /** 当前根卡 ID——表单自动携带，不暴露输入。 */
  rootTaskId: string
  title: string
  valueStatement: string
  ownerPersonId: string
  verificationOwnerId: string
  riskTier: 'low' | 'medium' | 'high'
  defaultReversibility: 'reversible' | 'costly' | 'one-way' | 'unknown'
  learningOptIn: boolean
  acceptance: { statements: string[]; requiredEvidenceKinds: string[] }
  scope: { included: string[]; excluded: string[] }
  contextPolicy: { allowedScopes: string[]; excludedSourceKinds: string[] }
  measures: CreateOutcomeMeasureInput[]
  /** 幂等键：由调用方（表单会话）生成一次、失败重试不换键；服务端按
   *  `${actor}:${clientRequestId}` 组合键落账查定（I2：异 actor 同键不命中）。 */
  clientRequestId: string
}

export interface CreateOutcomeResult {
  contract: OutcomeContract
  /** true=clientRequestId 命中重放，返回的是原合同（未新建）。 */
  replayed: boolean
}

/** 创建合同（POST /api/hermes/outcomes）。422 抛 OutcomeApiError（problems 逐条）、
 *  409 root_task_taken/outcome_exists 同抛 OutcomeApiError（code 可判）；门关抛
 *  OutcomeWorkbenchDisabledError。 */
export async function createOutcome(input: CreateOutcomeInput): Promise<CreateOutcomeResult> {
  const j = await requestOutcome('/api/hermes/outcomes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return {
    contract: j.contract as OutcomeContract,
    replayed: j.replayed === true,
  }
}

/** 快照摘要列表（快照计数用；坏行服务端读侧已跳过）。 */
export async function fetchOutcomeSnapshots(outcomeId: string): Promise<OutcomeSnapshotSummary[]> {
  const j = await requestOutcome(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/context`)
  return Array.isArray(j.snapshots) ? (j.snapshots as OutcomeSnapshotSummary[]) : []
}

/** 测量读面响应（Task 15）：measurements=当前版本优先全量；latest=每 measure 最新
 *  一条（服务端 settlement 同口径绑定：仅当前 contractVersion、observedAt 最大），
 *  无当前版本记录的 measure 不在 latest——旧口径只作历史（spec §4.1）。 */
export interface OutcomeMeasurementsRead {
  outcomeId: string
  contractVersion: number
  measurements: OutcomeMeasurement[]
  latest: Record<string, OutcomeMeasurement>
}

/** 读取测量（?measureId= 可选过滤）；门关抛 OutcomeWorkbenchDisabledError。 */
export async function fetchOutcomeMeasurements(
  outcomeId: string,
  measureId?: string,
): Promise<OutcomeMeasurementsRead> {
  const q = measureId ? `?measureId=${encodeURIComponent(measureId)}` : ''
  const j = await requestOutcome(
    `/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/measurements${q}`,
  )
  return {
    outcomeId: String(j.outcomeId ?? outcomeId),
    contractVersion: Number(j.contractVersion ?? 0),
    measurements: Array.isArray(j.measurements) ? (j.measurements as OutcomeMeasurement[]) : [],
    latest: (j.latest ?? {}) as Record<string, OutcomeMeasurement>,
  }
}

/** 历史取代链条目：settlement 正身在账上可查得时随行（孤儿 id 为 null）。 */
export interface OutcomeSettlementSuperseded {
  settlementId: string
  reason: string
  supersededAt: number
  settlement: OutcomeSettlement | null
}

/** 结算读面响应（Task 15）：settlement=最新有效结算（未被取代；全被取代=null）。 */
export interface OutcomeSettlementRead {
  outcomeId: string
  settlement: OutcomeSettlement | null
  superseded: OutcomeSettlementSuperseded[]
}

/** 读取结算（最新有效＋历史取代链）；门关抛 OutcomeWorkbenchDisabledError。 */
export async function fetchOutcomeSettlement(outcomeId: string): Promise<OutcomeSettlementRead> {
  const j = await requestOutcome(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/settlement`)
  return {
    outcomeId: String(j.outcomeId ?? outcomeId),
    settlement: (j.settlement ?? null) as OutcomeSettlement | null,
    superseded: Array.isArray(j.superseded) ? (j.superseded as OutcomeSettlementSuperseded[]) : [],
  }
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

/** 批二 T6：同口径对照投影（只读）。 */
export interface OutcomeComparison {
  evaluationOutcomeId: string
  baselineOutcomeId: string | null
  effect: 'improved' | 'degraded' | 'unknown'
  gapNote: string
  rows: Array<{
    measureId: string; name: string; definition: string; target: number; operator: string
    baseline: { outcomeId: string; actual: number | null; availability: string } | null
    evaluation: { outcomeId: string; actual: number | null; availability: string } | null
  }>
}

export async function fetchOutcomeComparison(outcomeId: string): Promise<OutcomeComparison | null> {
  try {
    const j = await requestOutcome(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/comparison`)
    return (j.comparison as OutcomeComparison) ?? null
  } catch (err) {
    if (err instanceof OutcomeWorkbenchDisabledError) throw err
    return null // 非 422/404 的读失败按 fail-soft 静默（对照是增益面不炸面板）
  }
}
