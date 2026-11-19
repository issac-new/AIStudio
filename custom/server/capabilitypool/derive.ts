// capabilitypool/derive.ts —— 能力供需只读派生与派单准入纯函数（批二点五）
//
// 纪律：本模块只消费快照，不读文件、不写存储；源缺席用 available:false 与 null 表达，
// 不用 0 冒充未知。缺口 gap 只表示“有需求但完全无供给”，不用减法制造虚假缺口。
import {
  validateCapabilityTags,
  type CapabilityDemandTask,
  type CapabilityGapRow,
  type CapabilityReadiness,
  type CapabilityReadinessCandidate,
  type CapabilitySupplySource,
  type SupplyDemandInput,
  type SupplyDemandReport,
} from './types'

const SOURCE_ORDER: readonly CapabilitySupplySource[] = [
  'capability-ledger',
  'capability-graph',
  'skill-provisioning',
  'profiles',
  'fleet-directory',
  'external-experts',
]

const EXTERNAL_EXPERTS_PLACEHOLDER: { available: boolean; note: string } = {
  available: false,
  note: '外部专家池 v1 不建模——占位声明，不伪造供给',
}

function availabilityOf(input: SupplyDemandInput): Record<CapabilitySupplySource, { available: boolean; note?: string }> {
  return {
    'capability-ledger': { available: input.ledger.available, ...(input.ledger.note ? { note: input.ledger.note } : {}) },
    'capability-graph': { available: input.graph.available, ...(input.graph.note ? { note: input.graph.note } : {}) },
    'skill-provisioning': { available: input.skillProvisioning.available, ...(input.skillProvisioning.note ? { note: input.skillProvisioning.note } : {}) },
    profiles: { available: input.profiles.available, ...(input.profiles.note ? { note: input.profiles.note } : {}) },
    'fleet-directory': { available: input.fleet.available, ...(input.fleet.note ? { note: input.fleet.note } : {}) },
    'external-experts': EXTERNAL_EXPERTS_PLACEHOLDER,
  }
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

interface TagAccumulator {
  demandTasks: CapabilityDemandTask[]
  boards: Set<string>
  leadTimes: number[]
  ledgerUnits: Set<string>
  graphAgents: Set<string>
  skills: Set<string>
  lastUsedAt: number | null
}

function accFor(map: Map<string, TagAccumulator>, tag: string): TagAccumulator {
  const hit = map.get(tag)
  if (hit) return hit
  const created: TagAccumulator = {
    demandTasks: [],
    boards: new Set(),
    leadTimes: [],
    ledgerUnits: new Set(),
    graphAgents: new Set(),
    skills: new Set(),
    lastUsedAt: null,
  }
  map.set(tag, created)
  return created
}

/**
 * 能力供需只读派生。
 *
 * 供给口径：
 * - 台账 L3：`skills[]` 是能力单元承载的技能标签；
 * - 能力图：`capabilities[]` 是 Agent 声明的能力标签；
 * - 技能供给清单与 profile 声明：技能包名（可能不是能力台账标签，按 skill 计入）；
 * - 舰队目录只有 profile×角色×技能数，没有标签名，不按标签计入供给（记 unknown）。
 */
export function deriveSupplyDemand(input: SupplyDemandInput): SupplyDemandReport {
  const generatedAt = input.now ?? Date.now()
  const sources = availabilityOf(input)
  const unknowns: string[] = []
  const map = new Map<string, TagAccumulator>()

  for (const task of input.demands) {
    const { valid } = validateCapabilityTags(task.tags)
    for (const tag of valid) {
      const acc = accFor(map, tag)
      acc.demandTasks.push(task)
      acc.boards.add(task.board)
      if (task.firstRunStartedAt !== null && task.firstRunStartedAt >= task.createdAt) {
        acc.leadTimes.push(task.firstRunStartedAt - task.createdAt)
      }
    }
  }

  if (input.ledger.available) {
    for (const unit of input.ledger.units) {
      const { valid } = validateCapabilityTags(unit.skills)
      for (const tag of valid) {
        const acc = accFor(map, tag)
        acc.ledgerUnits.add(unit.id)
        if (unit.lastUsedAt != null && (acc.lastUsedAt === null || unit.lastUsedAt > acc.lastUsedAt)) {
          acc.lastUsedAt = unit.lastUsedAt
        }
      }
      // 判"未声明"用词法过滤后的列表：全非法标签（既不进供给也不算已声明）同样落 unknown
      if (valid.length === 0) unknowns.push(`capability-ledger:${unit.id} 未声明技能标签`)
    }
  }

  if (input.graph.available) {
    for (const agent of input.graph.agents) {
      const { valid } = validateCapabilityTags(agent.capabilities)
      for (const tag of valid) {
        const acc = accFor(map, tag)
        acc.graphAgents.add(agent.name)
      }
      if (valid.length === 0) unknowns.push(`capability-graph:${agent.name} 未声明能力（unknown，不按无能力处理）`)
    }
  }

  if (input.skillProvisioning.available) {
    for (const role of input.skillProvisioning.roles) {
      const { valid } = validateCapabilityTags(role.skills)
      for (const tag of valid) accFor(map, tag).skills.add(`role:${role.match}`)
    }
  }

  if (input.profiles.available) {
    for (const profile of input.profiles.profiles) {
      // skills_enabled 是分类白名单（如 software-development），不是能力标签；
      // 只把个体技能声明 skills_pinned 计入供给，避免用粗分类冒充能力。
      const { valid } = validateCapabilityTags(profile.skillsPinned)
      for (const tag of valid) accFor(map, tag).skills.add(`profile:${profile.name}`)
    }
  }

  if (input.fleet.available) {
    let skillNames = 0
    for (const entry of input.fleet.entries) {
      const { valid } = validateCapabilityTags(entry.skills)
      skillNames += valid.length
      for (const tag of valid) accFor(map, tag).skills.add(`fleet:${entry.machineId}:${entry.profile}`)
    }
    if (skillNames === 0) {
      unknowns.push('fleet-directory 只有 profile×角色×技能数，没有技能名，未按标签计入供给')
    } else {
      unknowns.push('fleet-directory 技能名按 skill 计入供给；角色到能力标签的映射仍以能力台账为准')
    }
  }

  const allTags = [...map.keys()].sort()
  // 只校验需求侧每条任务的标签：供给标签在入 map 前已按同一词法过滤；
  // 把需求与供给侧并集再交给 validate 会把同名标签误报为 duplicate。
  const tagIssues = input.demands.flatMap((task) => validateCapabilityTags(task.tags).issues)

  const rows: CapabilityGapRow[] = allTags.map((tag) => {
    const acc = accFor(map, tag)
    const supplyUnits = acc.ledgerUnits.size
    const supplyAgents = acc.graphAgents.size
    const supplySkills = acc.skills.size
    const hasSupply = supplyUnits + supplyAgents + supplySkills > 0
    return {
      tag,
      demand: acc.demandTasks.length,
      supplyUnits,
      supplyAgents,
      supplySkills,
      gap: acc.demandTasks.length > 0 && !hasSupply ? acc.demandTasks.length : 0,
      distinctBoards: acc.boards.size,
      supplyLeadTimeMedianMs: median(acc.leadTimes),
      lastUsedAt: acc.lastUsedAt,
      sources,
      evidenceRefs: [
        ...acc.demandTasks.map((task) => `task:${task.taskId}`),
        ...[...acc.ledgerUnits].map((id) => `ledger:${id}`),
        ...[...acc.graphAgents].map((name) => `graph:${name}`),
        ...[...acc.skills].map((ref) => `skill:${ref}`),
      ],
    }
  })

  rows.sort((a, b) => b.gap - a.gap || b.demand - a.demand || a.tag.localeCompare(b.tag))

  for (const source of SOURCE_ORDER) {
    if (!sources[source].available) unknowns.push(`${source}: ${sources[source].note ?? '源缺席'}`)
  }
  if (input.demands.length === 0) unknowns.push('demand: 未找到带能力需求的任务')

  return { generatedAt, demandSource: input.demandSource ?? 'skills-fallback', rows, tagIssues, sources, unknowns }
}

function sortCandidates(
  candidates: readonly CapabilityReadinessCandidate[],
  required: readonly string[],
): CapabilityReadinessCandidate[] {
  const requiredSet = new Set(required)
  return candidates
    .map((candidate) => ({
      candidate,
      coverage: candidate.tags.filter((tag) => requiredSet.has(tag)).length,
    }))
    .filter((entry) => entry.coverage > 0)
    .sort((a, b) => {
      if (b.coverage !== a.coverage) return b.coverage - a.coverage
      const ar = a.candidate.reliability ?? -1
      const br = b.candidate.reliability ?? -1
      if (br !== ar) return br - ar
      if (a.candidate.load !== b.candidate.load) return a.candidate.load - b.candidate.load
      return a.candidate.agentId.localeCompare(b.candidate.agentId)
    })
    .map((entry) => entry.candidate)
}

/**
 * 派单前能力准入纯函数。
 *
 * 决策顺序：无需求放行；供给源全部缺席→unknown（源故障不冒充"缺供给"）；
 * 需求标签没有任何供给→block（原因 capability_not_supplied:<tag>）；有需求但无 assignee→warn（给候选）；
 * assignee 未声明覆盖→warn；全部覆盖→pass。block 只用于确定性缺失，避免误阻断。
 */
export function assessCapabilityReadiness(input: {
  requiredTags: readonly string[]
  supplyTags: readonly string[]
  assignee: { agentId: string; tags: readonly string[] | null } | null
  candidates: readonly CapabilityReadinessCandidate[]
  /** 供给侧至少一个源可用时才允许判 block；全缺席时判 unknown（fail-soft，不猜数） */
  anySourceAvailable?: boolean
}): CapabilityReadiness {
  const { valid: required } = validateCapabilityTags(input.requiredTags)
  if (required.length === 0) {
    return { decision: 'pass', reasons: ['no_capability_requirement'], candidates: [], evidenceRefs: [] }
  }

  if (input.anySourceAvailable === false) {
    return {
      decision: 'unknown',
      reasons: ['supply_sources_unavailable'],
      candidates: [],
      evidenceRefs: [],
    }
  }

  const supply = new Set(input.supplyTags)
  const missing = required.filter((tag) => !supply.has(tag))
  const candidates = sortCandidates(input.candidates, required)
  const candidateRefs = candidates.map((candidate) => `agent:${candidate.agentId}`)

  if (missing.length > 0) {
    return {
      decision: 'block',
      reasons: missing.map((tag) => `capability_not_supplied:${tag}`),
      candidates,
      evidenceRefs: candidateRefs,
    }
  }

  if (!input.assignee) {
    return { decision: 'warn', reasons: ['no_assignee'], candidates, evidenceRefs: candidateRefs }
  }

  if (input.assignee.tags === null) {
    // 能力图缺席时 assignee 声明不可判：源故障与"真的未声明"不可区分，用独立原因
    return {
      decision: 'warn',
      reasons: ['assignee_unverifiable'],
      candidates,
      evidenceRefs: [`agent:${input.assignee.agentId}`, ...candidateRefs],
    }
  }

  const assigned = new Set(input.assignee.tags)
  const uncovered = required.filter((tag) => !assigned.has(tag))
  if (uncovered.length > 0) {
    return {
      decision: 'warn',
      reasons: uncovered.map((tag) => `assignee_undeclared:${tag}`),
      candidates,
      evidenceRefs: [`agent:${input.assignee.agentId}`, ...candidateRefs],
    }
  }

  return {
    decision: 'pass',
    reasons: ['assignee_covers'],
    candidates,
    evidenceRefs: [`agent:${input.assignee.agentId}`],
  }
}
