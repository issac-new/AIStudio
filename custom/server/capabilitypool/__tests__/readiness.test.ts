import { describe, expect, it } from 'vitest'

import { assessTaskCapabilityReadiness } from '../readiness'
import type { SupplyDemandInput } from '../types'

const supply = {
  ledger: {
    available: true,
    units: [{ id: 'u1', skills: ['coding', 'review'], lifecycle: 'active', lastUsedAt: null }],
  },
  graph: {
    available: true,
    agents: [
      { name: 'worker', capabilities: ['coding', 'review'], reliability: 0.8 },
      { name: 'partial', capabilities: ['coding'], reliability: 0.5 },
    ],
  },
  skillProvisioning: {
    available: true,
    roles: [{ match: 'worker', skills: ['deploy'] }],
  },
  profiles: {
    available: true,
    profiles: [{ name: 'worker', skillsEnabled: ['coding'], skillsPinned: ['ops'] }],
  },
  fleet: {
    available: true,
    entries: [{ machineId: 'm1', profile: 'worker', roles: ['coder'], skillCount: 1, skills: ['ops'] }],
  },
} satisfies Pick<SupplyDemandInput, 'ledger' | 'graph' | 'skillProvisioning' | 'profiles' | 'fleet'>

describe('assessTaskCapabilityReadiness', () => {
  it('无能力需求直接放行，不读供给', () => {
    const r = assessTaskCapabilityReadiness({ requiredTags: [], assignee: null, supply })
    expect(r.decision).toBe('pass')
    expect(r.reasons).toEqual(['no_capability_requirement'])
  })

  it('assignee 覆盖全部需求时放行', () => {
    const r = assessTaskCapabilityReadiness({ requiredTags: ['coding', 'review'], assignee: 'worker', supply })
    expect(r.decision).toBe('pass')
    expect(r.reasons).toEqual(['assignee_covers'])
  })

  it('assignee 未声明时警告，候选仍给出', () => {
    const r = assessTaskCapabilityReadiness({ requiredTags: ['coding', 'review'], assignee: 'partial', supply })
    expect(r.decision).toBe('warn')
    expect(r.reasons).toEqual(['assignee_undeclared:review'])
    expect(r.candidates[0].agentId).toBe('worker')
  })

  it('无 assignee 时警告并给候选', () => {
    const r = assessTaskCapabilityReadiness({ requiredTags: ['coding'], assignee: null, supply })
    expect(r.decision).toBe('warn')
    expect(r.reasons).toEqual(['no_assignee'])
    expect(r.candidates.map((c) => c.agentId)).toEqual(['worker', 'partial'])
  })

  it('完全无供给时阻断（调用方可降级为 warn）', () => {
    const r = assessTaskCapabilityReadiness({ requiredTags: ['missing'], assignee: null, supply })
    expect(r.decision).toBe('block')
    expect(r.reasons).toEqual(['capability_not_supplied:missing'])
  })

  it('五源全缺席时判 unknown，不把源故障当成缺供给（审查 S3 修复）', () => {
    const allDown = {
      ledger: { available: false, units: [] as never[] },
      graph: { available: false, agents: [] as never[] },
      skillProvisioning: { available: false, roles: [] as never[] },
      profiles: { available: false, profiles: [] as never[] },
      fleet: { available: false, entries: [] as never[] },
    }
    const r = assessTaskCapabilityReadiness({ requiredTags: ['coding'], assignee: null, supply: allDown })
    expect(r.decision).toBe('unknown')
    expect(r.reasons).toEqual(['supply_sources_unavailable'])
  })

  it('能力图缺席时 assignee 声明不可判：assignee_unverifiable 而非 assignee_undeclared', () => {
    const graphDown = { ...supply, graph: { available: false, agents: [] as never[] } }
    const r = assessTaskCapabilityReadiness({ requiredTags: ['coding'], assignee: 'worker', supply: graphDown })
    // 台账/技能清单/profiles 仍在位 → 供给可判（coding 有台账供给）→ 走 assignee 分支
    expect(r.decision).toBe('warn')
    expect(r.reasons).toEqual(['assignee_unverifiable'])
  })

  it('非法标签被忽略；只有非法标签等同无需求', () => {
    const r = assessTaskCapabilityReadiness({ requiredTags: ['Bad Tag'], assignee: null, supply })
    expect(r.decision).toBe('pass')
    expect(r.reasons).toEqual(['no_capability_requirement'])
  })
})
