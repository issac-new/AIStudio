// capabilitypool/types.ts —— 能力供需只读投影的类型单一入口（批二点五）
//
// 事实源：runtime/governance/capability-ledger.yaml、team/shared/capability-graph.yaml、
// team/profiles/_shared/skill-provisioning.json、team/shared/profiles.yaml、舰队能力目录。
// 本模块不建存储、不复制事实源；所有输入均为只读快照，源缺席用 available:false 表达。
import { SKILL_TAG_MAX, SKILL_TAG_RE } from '../governance/governance-ledger'

export type CapabilityTagIssueReason = 'empty' | 'illegal' | 'duplicate'

export interface CapabilityTagIssue {
  tag: string
  reason: CapabilityTagIssueReason
}

/** 校验能力标签：复用能力台账词法，空/非法/重复分别给结构化原因。 */
export function validateCapabilityTags(tags: readonly string[]): {
  valid: string[]
  issues: CapabilityTagIssue[]
} {
  const valid: string[] = []
  const issues: CapabilityTagIssue[] = []
  const seen = new Set<string>()
  for (const raw of tags) {
    const tag = String(raw ?? '').trim()
    if (!tag) {
      issues.push({ tag: '', reason: 'empty' })
      continue
    }
    if (!SKILL_TAG_RE.test(tag) || tag.length > SKILL_TAG_MAX) {
      issues.push({ tag, reason: 'illegal' })
      continue
    }
    if (seen.has(tag)) {
      issues.push({ tag, reason: 'duplicate' })
      continue
    }
    seen.add(tag)
    valid.push(tag)
  }
  return { valid, issues }
}

export interface CapabilityRequirement {
  tags: string[]
  source: 'declared' | 'derived' | 'skills-fallback'
  declaredAt: number
}

export type CapabilitySupplyKind = 'unit' | 'agent' | 'skill'
export type CapabilitySupplySource =
  | 'capability-ledger'
  | 'capability-graph'
  | 'skill-provisioning'
  | 'profiles'
  | 'fleet-directory'
  /** D7：外部专家池 v1 不建模，恒 available:false 占位——不伪造供给 */
  | 'external-experts'

export interface CapabilitySupplyEntry {
  tag: string
  supplyKind: CapabilitySupplyKind
  ref: string
  available: boolean
  reliability: number | null
  load: number | null
  lastUsedAt: number | null
  source: CapabilitySupplySource
}

export interface SourceAvailability {
  available: boolean
  note?: string
}

export interface CapabilityGapRow {
  tag: string
  /** 带该能力需求的任务数 */
  demand: number
  /** 覆盖该标签的能力单元数（台账 L3） */
  supplyUnits: number
  /** 覆盖该标签的 Agent 数（能力图） */
  supplyAgents: number
  /** 覆盖该标签的技能包数（技能供给清单 / profile 技能声明） */
  supplySkills: number
  /** 无任何供给时的需求量；有供给为 0（不用减法制造虚假缺口） */
  gap: number
  /** 提出该需求的去重板数 */
  distinctBoards: number
  /** 需求任务从创建到首次 run 开始的中位时长；无样本为 null */
  supplyLeadTimeMedianMs: number | null
  /** 供给侧最后使用时间（目前取台账单元 lastUsedAt；无则 null） */
  lastUsedAt: number | null
  sources: Record<CapabilitySupplySource, SourceAvailability>
  evidenceRefs: string[]
}

export interface CapabilityReadinessCandidate {
  agentId: string
  /** 该 Agent 声明覆盖的能力标签 */
  tags: string[]
  reliability: number | null
  load: number
  evidenceRefs: string[]
}

export interface CapabilityReadiness {
  /** unknown=供给源全部缺席，无法判定（不得当成缺供给报 block） */
  decision: 'pass' | 'warn' | 'block' | 'unknown'
  reasons: string[]
  candidates: CapabilityReadinessCandidate[]
  evidenceRefs: string[]
}

// ---- 只读输入快照 ----

export interface CapabilityDemandTask {
  taskId: string
  board: string
  tags: string[]
  status: string
  createdAt: number
  /** 首次 run started 的毫秒时间戳；无运行为 null */
  firstRunStartedAt: number | null
}

export interface CapabilityLedgerUnitSnapshot {
  id: string
  skills: string[]
  lifecycle: string
  lastUsedAt?: number | null
}

export interface CapabilityLedgerSnapshot {
  available: boolean
  units: CapabilityLedgerUnitSnapshot[]
  note?: string
}

export interface CapabilityGraphAgentSnapshot {
  name: string
  capabilities: string[]
  reliability: number | null
}

export interface CapabilityGraphSnapshot {
  available: boolean
  agents: CapabilityGraphAgentSnapshot[]
  note?: string
}

export interface SkillProvisioningRoleSnapshot {
  match: string
  skills: string[]
}

export interface SkillProvisioningSnapshot {
  available: boolean
  roles: SkillProvisioningRoleSnapshot[]
  note?: string
}

export interface ProfileCapabilitySnapshot {
  name: string
  skillsEnabled: string[]
  skillsPinned: string[]
}

export interface ProfilesSnapshot {
  available: boolean
  profiles: ProfileCapabilitySnapshot[]
  note?: string
}

export interface FleetMachineProfileSnapshot {
  machineId: string
  profile: string
  roles: string[]
  skillCount: number
  /** 技能包名（能力上报自带；按 skill 计入供给，不冒充能力标签） */
  skills: string[]
}

export interface FleetSnapshot {
  available: boolean
  entries: FleetMachineProfileSnapshot[]
  note?: string
}

export interface SupplyDemandInput {
  demands: CapabilityDemandTask[]
  ledger: CapabilityLedgerSnapshot
  graph: CapabilityGraphSnapshot
  skillProvisioning: SkillProvisioningSnapshot
  profiles: ProfilesSnapshot
  fleet: FleetSnapshot
  now?: number
  /** 需求侧口径标注：required_capabilities 落地前恒为 skills-fallback（Task 8 后切 declared） */
  demandSource?: 'declared' | 'skills-fallback'
}

export interface SupplyDemandReport {
  generatedAt: number
  /** 需求侧口径：当前为 skills 过渡口径；消费者须知道这不是结构化能力声明 */
  demandSource: 'declared' | 'skills-fallback'
  rows: CapabilityGapRow[]
  tagIssues: CapabilityTagIssue[]
  sources: Record<CapabilitySupplySource, SourceAvailability>
  unknowns: string[]
}
