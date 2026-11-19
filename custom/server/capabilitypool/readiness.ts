// capabilitypool/readiness.ts —— 派单期能力准入（轻量只读，不读看板库）
//
// 与完整供需报告的分工：本模块只读四类供给快照（台账/能力图/技能清单/profiles/舰队），
// 供列编排在派单前做一次警告级检查；不做需求聚合、不接管 assignee、不阻断派发。
import { assessCapabilityReadiness } from './derive'
import { collectSupplySnapshot } from './collect'
import { validateCapabilityTags, type CapabilityReadiness } from './types'

export interface TaskCapabilityReadinessInput {
  requiredTags: readonly string[]
  assignee: string | null
  /** 测试可注入；缺省读四类供给快照。 */
  supply?: ReturnType<typeof collectSupplySnapshot>
}

/**
 * 任务级能力准入：`requiredTags` 为空直接放行（存量卡零影响）；
 * 有需求时按“供给是否存在、assignee 是否声明、候选是谁”给出 pass/warn/block。
 * 调用方默认只 warn；是否升级为硬拦截由调用方环境开关决定，本函数不抛。
 */
export function assessTaskCapabilityReadiness(input: TaskCapabilityReadinessInput): CapabilityReadiness {
  const { valid } = validateCapabilityTags(input.requiredTags)
  if (valid.length === 0) {
    return { decision: 'pass', reasons: ['no_capability_requirement'], candidates: [], evidenceRefs: [] }
  }

  const supply = input.supply ?? collectSupplySnapshot()
  const supplyTags = new Set<string>()
  for (const unit of supply.ledger.units) {
    for (const tag of unit.skills) supplyTags.add(tag)
  }
  const candidates = supply.graph.agents.map((agent) => ({
    agentId: agent.name,
    tags: agent.capabilities,
    reliability: agent.reliability,
    load: 0,
    evidenceRefs: [`graph:${agent.name}`],
  }))
  for (const agent of supply.graph.agents) {
    for (const tag of agent.capabilities) supplyTags.add(tag)
  }
  for (const role of supply.skillProvisioning.roles) {
    for (const tag of role.skills) supplyTags.add(tag)
  }
  for (const profile of supply.profiles.profiles) {
    // skills_enabled 是分类白名单，不是能力标签；只计个体技能声明。
    for (const tag of profile.skillsPinned) supplyTags.add(tag)
  }
  for (const entry of supply.fleet.entries) {
    for (const tag of entry.skills) supplyTags.add(tag)
  }

  const assigneeTags = input.assignee
    ? supply.graph.agents.find((agent) => agent.name === input.assignee)?.capabilities ?? []
    : []

  return assessCapabilityReadiness({
    requiredTags: valid,
    supplyTags: [...supplyTags],
    assignee: input.assignee ? { agentId: input.assignee, tags: assigneeTags } : null,
    candidates,
  })
}
