// custom/server/outcome/types.ts
// Outcome 域核心类型。字段与枚举逐字来自 spec §4.1（docs/superpowers/specs/
// 2026-11-19-ai-native-operating-model-design.md），不得单方面改名或扩枚举。
// measures 只保存稳定定义；会变化的 actual 一律走 OutcomeMeasurement 追加记录。
// 每个枚举的 const 数组是取值唯一清单，validate.ts 校验直接引用、不得另抄一份。

/** 合同状态机取值（spec §3.2：draft→active→observing→settled；任意态可 cancelled 且须理由）。 */
export const OUTCOME_STATUSES = ['draft', 'active', 'observing', 'settled', 'cancelled'] as const
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number]

/** 结算裁决独立于状态名；unknown 必须写原因与证据缺口，不是绿色通过（spec §3.2）。 */
export const OUTCOME_VERDICTS = ['achieved', 'partial', 'missed', 'unknown'] as const
export type OutcomeVerdict = (typeof OUTCOME_VERDICTS)[number]

/** 可逆性与风险档分离，不继续隐藏在单一 riskTier 里（spec §4.3）。 */
export const REVERSIBILITY_LEVELS = ['reversible', 'costly', 'one-way', 'unknown'] as const
export type Reversibility = (typeof REVERSIBILITY_LEVELS)[number]

export const RISK_TIERS = ['low', 'medium', 'high'] as const
export type RiskTier = (typeof RISK_TIERS)[number]

export const MEASURE_OPERATORS = ['gte', 'lte', 'eq'] as const
export type MeasureOperator = (typeof MEASURE_OPERATORS)[number]

export const MEASURE_AVAILABILITIES = ['available', 'pending', 'unavailable'] as const
export type MeasureAvailability = (typeof MEASURE_AVAILABILITIES)[number]

/** 团队状态（批三 spec §一）：draft=候选提案（不自动成队，agenda 待确认源）、
 *  active=owner 显式确认、closed=解散。 */
export const OUTCOME_TEAM_STATUSES = ['draft', 'active', 'closed'] as const
export type OutcomeTeamStatus = (typeof OUTCOME_TEAM_STATUSES)[number]

/** 团队成员主体类型（批三 spec §一）：person=自然人（people 域）、agent=身份册成员。 */
export const TEAM_SUBJECT_KINDS = ['person', 'agent'] as const
export type TeamSubjectKind = (typeof TEAM_SUBJECT_KINDS)[number]

/** 度量定义（spec §4.1）：baseline=null 与 actual=null 是合法未知，不得自动补零。 */
export interface OutcomeMeasure {
  measureId: string
  name: string
  definition: string
  unit: string
  operator: MeasureOperator
  baseline: number | null
  target: number
  sourceRef: string
}

/** 合同正身（spec §4.1 逐字）。version 只随合同语义变更递增；追加测量与状态迁移不递增。 */
export interface OutcomeContract {
  schemaVersion: 1
  outcomeId: string
  rootTaskId: string
  version: number
  title: string
  valueStatement: string
  ownerPersonId: string
  processRef?: { processId: string; kpiId?: string; definitionVersion: string }
  measures: OutcomeMeasure[]
  acceptance: { statements: string[]; requiredEvidenceKinds: string[] }
  scope: { included: string[]; excluded: string[] }
  riskTier: RiskTier
  defaultReversibility: Reversibility
  verificationOwnerId: string
  contextPolicy: { allowedScopes: string[]; excludedSourceKinds: string[] }
  learningOptIn: boolean
  status: OutcomeStatus
  /** 截止时刻（批三 T1，可选三态）：undefined=未设置（旧合同零迁移）、null=显式无期限、
   *  有限数值=期限。逾期判定由议程投影按 dueAt != null && dueAt <= now 计算，本域不存派生态。 */
  dueAt?: number | null
  createdAt: number
  updatedAt: number
}

/** 测量事实（spec §4.1）：追加记录并绑定合同版本；定义改变后旧测量只作历史。 */
export interface OutcomeMeasurement {
  measurementId: string
  outcomeId: string
  measureId: string
  contractVersion: number
  actual: number | null
  availability: MeasureAvailability
  evidenceRefs: string[]
  observedAt: number
  recordedBy: string
  recordedAt: number
}

/** 团队成员（批三 spec §一）：role 承载 accountable/reviewer 等责任语义——不设独立
 *  accountablePersonId/reviewerPersonId 字段（D8：合同 owner/verifier 是唯一责任人正身，
 *  双正本必然漂移），到位性由 team-validate 对照合同校验。 */
export interface OutcomeTeamMember {
  subjectKind: TeamSubjectKind
  subjectId: string
  role: string
  responsibility: string
}

/** 团队正身（批三 spec §一）：最新态落 outcome 目录 team.json；version 从 1 递增
 *  （confirmTeam 乐观并发），确认历史由 events.jsonl 的 team_confirmed 事件承载。 */
export interface OutcomeTeam {
  outcomeId: string
  version: number
  members: OutcomeTeamMember[]
  status: OutcomeTeamStatus
  changeReason: string
  updatedBy: string
  updatedAt: number
}

/** 决策画像（spec §4.3）：审批风险分类的新正身，classifyApprovalRisk 委托到这里。 */
export interface DecisionProfile {
  riskTier: RiskTier
  reversibility: Reversibility
  externalEffect: boolean
  basis: string[]
}
