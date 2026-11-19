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

  it('非法标签被忽略；只有非法标签等同无需求', () => {
    const r = assessTaskCapabilityReadiness({ requiredTags: ['Bad Tag'], assignee: null, supply })
    expect(r.decision).toBe('pass')
    expect(r.reasons).toEqual(['no_capability_requirement'])
  })
})
