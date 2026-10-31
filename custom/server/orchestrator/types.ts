// custom/server/orchestrator/types.ts
// 编排域领域类型单一事实源（2026-10-31 A+B 批）。
// 语义对照 dsh-superagent-prototype docs/001-domain.md 与 002-authorization.md：
//   Source 产生 Trigger → 归入 Thread → Eval 出 Decision → accept 签发 Mandate → 绑定 Ticket → Assignment 落到执行器。
// 本域只做领域记录与判定，不直接驱动执行（执行仍走既有 kanban dispatcher / mention-dispatch）。

/** 事件源类别：与 automations 的四类源对齐，另加 im（Matrix 等聊天信道）。 */
export const SOURCE_KINDS = ['kanban', 'file', 'git', 'webhook', 'im'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

/** Trigger 生命周期：程序准入后 pending；被路由/忽略/丢弃后终结。 */
export const TRIGGER_STATUSES = ['pending', 'routed', 'ignored', 'dropped'] as const
export type TriggerStatus = (typeof TRIGGER_STATUSES)[number]

/** Decision 四值（spec D9）：unavailable 是评估失败的可审计结局，不能与 ignore 混同。 */
export const DECISION_VERDICTS = ['accept', 'stop', 'ignore', 'unavailable'] as const
export type DecisionVerdict = (typeof DECISION_VERDICTS)[number]

/** 授权强度（spec §4.3）：explicit 人明确请求/批准；delegated 同主体代批；inferred 规则推断。 */
export const AUTH_STRENGTHS = ['explicit', 'delegated', 'inferred'] as const
export type AuthStrength = (typeof AUTH_STRENGTHS)[number]

/** Assignment 阶段：pending 待启动 / running 执行中 / ended 已结束。 */
export const ASSIGNMENT_STAGES = ['pending', 'running', 'ended'] as const
export type AssignmentStage = (typeof ASSIGNMENT_STAGES)[number]

export interface TriggerInput {
  sourceId: string
  sourceKind: SourceKind
  /** 源内唯一 id（去重键）；同一 source 内重复摄入幂等。 */
  externalId: string
  /** 归线程键，如 `task:<board>:<id>`、`repo:<owner>/<name>:pr:<n>`。 */
  threadKey: string
  actor?: string
  /** 是否明确指向 agent（@提及或直接回复）。决定准入强度。 */
  addressed: boolean
  payload: unknown
  receivedAt?: number
}

export interface Trigger {
  id: string
  sourceId: string
  sourceKind: SourceKind
  externalId: string
  threadKey: string
  actor: string | null
  addressed: boolean
  payload: unknown
  status: TriggerStatus
  receivedAt: number
}

export interface Thread {
  id: string
  sourceId: string
  threadKey: string
  createdAt: number
  lastEventAt: number
}

export interface Subscription {
  threadId: string
  subscriber: string
  mode: 'wake' | 'notify' | 'context'
  cursor: string | null
  createdAt: number
}

export interface Decision {
  id: string
  triggerId: string
  threadId: string | null
  verdict: DecisionVerdict
  strength: AuthStrength
  ruleIds: string[]
  policyVersion: number
  decidedBy: string
  decidedAt: number
}

export interface Mandate {
  id: string
  decisionId: string
  ticketId: string
  scope: Record<string, unknown>
  strength: AuthStrength
  ruleIds: string[]
  policyVersion: number
  issuer: string
  issuedAt: number
  expiresAt: number | null
  revokedAt: number | null
  revokedReason: string | null
}

export interface Assignment {
  ticketId: string
  executor: string
  sessionId: string | null
  pid: number | null
  stage: AssignmentStage
  startedAt: number | null
  endedAt: number | null
}

/** 策略类别（spec D8）：只有这四类是授权直接依据。 */
export const POLICY_KINDS = ['approval-rules', 'tool-policy', 'source-admission', 'proactivity'] as const
export type PolicyKind = (typeof POLICY_KINDS)[number]

/** 准入单元：按「发送者是否在名单 × 是否明确指向」决定动作。 */
export const ADMISSION_ACTIONS = ['accept', 'ignore', 'inferred'] as const
export type AdmissionAction = (typeof ADMISSION_ACTIONS)[number]

/** 源的运行模式（spec D7）：off 不评估；observe 只记录 would-accept；auto 正向评估即接单。 */
export const ADMISSION_MODES = ['off', 'observe', 'auto'] as const
export type AdmissionMode = (typeof ADMISSION_MODES)[number]

export interface AdmissionCell {
  sender: 'listed' | 'unlisted'
  addressing: boolean
  action: AdmissionAction
}

export interface SourceAdmission {
  sourceId: string
  mode: AdmissionMode
  /** 明确允许的发送者；空=无人明确（只有 unlisted 单元生效）。 */
  allowedSenders: string[]
  cells: AdmissionCell[]
}

export interface AdmitResult {
  allow: boolean
  action: AdmissionAction | null
  strength: AuthStrength | null
  reason: string
}
