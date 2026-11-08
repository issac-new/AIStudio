// overlay[team-library] 团队库类型（EvoTeam 吸收，2026-11-08）。
//
// 语义：可复用的团队＝协作模式描述＋候选成员名单＋版本史＋成败证据。
// 团队身份只看四维（工作类型/改动或排查范围/必需专业角色/验证策略）——
// 业务域、仓库名、文件名、主题都不构成建队理由（论文团队身份纪律）。
// 本域只出读模型与建议选择，不接管派单：selection 是给派单方/Chairman 的候选，
// 不是执行指令。

export type TeamFamilyStatus = 'active' | 'retired'

export interface TeamIdentity {
  workType: string | null
  changeScope: string | null
  requiredRoles: string[]
  verificationStrategy: string | null
}

export interface TeamEvidence {
  taskIds: string[]
  successful: string[]
  failed: string[]
}

export interface TeamVersionSnapshot {
  version: number
  changedAt: string | null
  reason: string
  members: string[]
}

export interface TeamFamily {
  familyId: string
  description: string
  identity: TeamIdentity
  keywords: string[]
  candidateRoster: string[]
  handoffFamilyId: string | null
  version: number
  status: TeamFamilyStatus
  evidence: TeamEvidence
  versionHistory: TeamVersionSnapshot[]
}

export interface TeamLibrary {
  version: number
  updated: string | null
  families: TeamFamily[]
}

export interface TeamLibraryReport {
  available: boolean
  /** available=false 时的原因（源缺席/解析失败/结构不符），不猜数。 */
  reason?: string
  source: string
  updated: string | null
  families: TeamFamily[]
}

export interface TeamScore {
  familyId: string
  /** 0..1 的确定性命中分：关键词命中为主，角色命中加权。 */
  score: number
  hits: string[]
}

export interface TeamSelectionInput {
  taskText: string
  /** 显式指定家族：命中即 reuse，不做关键词预筛。 */
  familyId?: string | null
  /** 关键词命中阈值（默认 0.34）。 */
  threshold?: number
}

export interface TeamSelection {
  action: 'reuse' | 'cold_start'
  familyId: string | null
  version: number | null
  candidateRoster: string[]
  scores: TeamScore[]
  reason: string
}
