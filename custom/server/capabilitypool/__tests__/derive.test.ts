import { describe, it, expect } from 'vitest'

import { assessCapabilityReadiness, deriveSupplyDemand } from '../derive'
import { validateCapabilityTags, type SupplyDemandInput } from '../types'

function fixture(overrides: Partial<SupplyDemandInput> = {}): SupplyDemandInput {
  return {
    demands: [
      { taskId: 't1', board: 'board-a', tags: ['coding', 'review'], status: 'ready', createdAt: 1_000, firstRunStartedAt: 4_000 },
      { taskId: 't2', board: 'board-b', tags: ['coding'], status: 'running', createdAt: 2_000, firstRunStartedAt: 5_000 },
      { taskId: 't3', board: 'board-a', tags: ['nonexistent'], status: 'todo', createdAt: 3_000, firstRunStartedAt: null },
      { taskId: 't4', board: 'board-a', tags: ['Bad Tag'], status: 'todo', createdAt: 3_000, firstRunStartedAt: null },
    ],
    ledger: {
      available: true,
      units: [
        { id: 'unit-1', skills: ['coding', 'review'], lifecycle: 'active', lastUsedAt: 9_000 },
        { id: 'unit-2', skills: [], lifecycle: 'active' },
      ],
    },
    graph: {
      available: true,
      agents: [
        { name: 'agent-1', capabilities: ['coding'], reliability: 0.8 },
        { name: 'agent-2', capabilities: [], reliability: null },
      ],
    },
    skillProvisioning: {
      available: true,
      roles: [{ match: 'worker', skills: ['coding', 'deploy'] }],
    },
    profiles: {
      available: true,
      profiles: [{ name: 'p1', skillsEnabled: ['software-development'], skillsPinned: ['review', 'ops'] }],
    },
    fleet: {
      available: true,
      entries: [{ machineId: 'm1', profile: 'worker', roles: ['coder'], skillCount: 1, skills: ['deploy'] }],
    },
    now: 10_000,
    ...overrides,
  }
}

describe('validateCapabilityTags', () => {
  it('合法标签保留顺序，空/非法/重复给出结构化原因', () => {
    const r = validateCapabilityTags(['coding', 'review', 'coding', '', 'Bad Tag', 'a'.repeat(65)])
    expect(r.valid).toEqual(['coding', 'review'])
    expect(r.issues.map((i) => i.reason)).toEqual(['duplicate', 'empty', 'illegal', 'illegal'])
  })
})

describe('deriveSupplyDemand', () => {
  it('需求/供给/缺口/复用板数/供给时效按标签聚合，源缺席不猜数', () => {
    const report = deriveSupplyDemand(fixture())
    const byTag = new Map(report.rows.map((row) => [row.tag, row]))

    const coding = byTag.get('coding')
    expect(coding).toBeDefined()
    expect(coding?.demand).toBe(2)
    expect(coding?.distinctBoards).toBe(2)
    expect(coding?.supplyUnits).toBe(1)
    expect(coding?.supplyAgents).toBe(1)
    expect(coding?.supplySkills).toBe(1)
    expect(coding?.gap).toBe(0)
    expect(coding?.supplyLeadTimeMedianMs).toBe(3_000)
    expect(coding?.lastUsedAt).toBe(9_000)
    expect(coding?.evidenceRefs).toContain('task:t1')
    expect(coding?.evidenceRefs).toContain('ledger:unit-1')
    expect(coding?.evidenceRefs).toContain('graph:agent-1')
    expect(coding?.evidenceRefs).toContain('skill:role:worker')

    const review = byTag.get('review')
    expect(review?.demand).toBe(1)
    expect(review?.supplyUnits).toBe(1)
    expect(review?.supplySkills).toBe(1)
    expect(review?.supplyLeadTimeMedianMs).toBe(3_000)

    const missing = byTag.get('nonexistent')
    expect(missing?.demand).toBe(1)
    expect(missing?.supplyUnits).toBe(0)
    expect(missing?.gap).toBe(1)
    expect(missing?.supplyLeadTimeMedianMs).toBeNull()
    expect(missing?.lastUsedAt).toBeNull()

    expect(byTag.has('Bad Tag')).toBe(false)
    expect(byTag.has('software-development')).toBe(false) // 分类白名单不是能力标签
    expect(report.tagIssues.some((issue) => issue.tag === 'Bad Tag' && issue.reason === 'illegal')).toBe(true)

    expect(report.sources['capability-ledger'].available).toBe(true)
    expect(report.sources['fleet-directory'].available).toBe(true)
    // D7 外部专家池：恒 available:false 占位，不伪造供给
    expect(report.sources['external-experts']).toEqual({ available: false, note: '外部专家池 v1 不建模——占位声明，不伪造供给' })
    expect(report.demandSource).toBe('skills-fallback')
    expect(report.unknowns).toContain('capability-graph:agent-2 未声明能力（unknown，不按无能力处理）')
    expect(report.unknowns).toContain('capability-ledger:unit-2 未声明技能标签')
    expect(report.unknowns.some((note) => note.includes('fleet-directory 技能名按 skill 计入供给'))).toBe(true)
    expect(byTag.get('deploy')?.supplySkills).toBe(2)
  })

  it('源缺席返回 available:false 与 unknown，不伪造供给', () => {
    const report = deriveSupplyDemand(fixture({
      ledger: { available: false, units: [], note: '台账文件缺失' },
      graph: { available: false, agents: [], note: '能力图缺失' },
      skillProvisioning: { available: false, roles: [], note: '技能清单缺失' },
      profiles: { available: false, profiles: [], note: 'profile 缺失' },
      fleet: { available: false, entries: [] },
    }))

    expect(report.sources['capability-ledger']).toEqual({ available: false, note: '台账文件缺失' })
    expect(report.sources['capability-graph']).toEqual({ available: false, note: '能力图缺失' })
    expect(report.sources['skill-provisioning']).toEqual({ available: false, note: '技能清单缺失' })
    expect(report.sources.profiles).toEqual({ available: false, note: 'profile 缺失' })
    expect(report.sources['fleet-directory']).toEqual({ available: false })

    const coding = report.rows.find((row) => row.tag === 'coding')
    expect(coding?.supplyUnits).toBe(0)
    expect(coding?.supplyAgents).toBe(0)
    expect(coding?.supplySkills).toBe(0)
    expect(coding?.gap).toBe(2)
    expect(report.unknowns).toContain('capability-ledger: 台账文件缺失')
    expect(report.unknowns).toContain('capability-graph: 能力图缺失')
    expect(report.unknowns).toContain('skill-provisioning: 技能清单缺失')
    expect(report.unknowns).toContain('profiles: profile 缺失')
    expect(report.unknowns).toContain('fleet-directory: 源缺席')
  })

  it('无需求时给出 unknown，而不是空表成功', () => {
    const report = deriveSupplyDemand(fixture({ demands: [] }))
    expect(report.rows.every((row) => row.demand === 0)).toBe(true)
    expect(report.unknowns).toContain('demand: 未找到带能力需求的任务')
  })

  it('同一任务内重复标签仍报 duplicate；供需同名不误报', () => {
    const report = deriveSupplyDemand(fixture({
      demands: [{
        taskId: 'dup', board: 'board-a', tags: ['coding', 'coding'],
        status: 'todo', createdAt: 1, firstRunStartedAt: null,
      }],
    }))
    expect(report.tagIssues.filter((issue) => issue.reason === 'duplicate')).toHaveLength(1)
    expect(report.rows.find((row) => row.tag === 'coding')?.demand).toBe(1)
  })
})

describe('assessCapabilityReadiness', () => {
  const candidates = [
    { agentId: 'c-partial', tags: ['coding'], reliability: 1, load: 0, evidenceRefs: ['agent:c-partial'] },
    { agentId: 'c-full-low', tags: ['coding', 'review'], reliability: 0.5, load: 0, evidenceRefs: ['agent:c-full-low'] },
    { agentId: 'c-full-high', tags: ['coding', 'review'], reliability: 0.9, load: 2, evidenceRefs: ['agent:c-full-high'] },
    { agentId: 'c-null', tags: ['coding', 'review'], reliability: null, load: 0, evidenceRefs: ['agent:c-null'] },
  ]

  it('无能力需求时放行，不影响存量卡', () => {
    const r = assessCapabilityReadiness({ requiredTags: [], supplyTags: [], assignee: null, candidates: [] })
    expect(r.decision).toBe('pass')
    expect(r.reasons).toEqual(['no_capability_requirement'])
  })

  it('需求标签完全无供给时阻断', () => {
    const r = assessCapabilityReadiness({
      requiredTags: ['coding', 'rare-skill'],
      supplyTags: ['coding'],
      assignee: null,
      candidates,
    })
    expect(r.decision).toBe('block')
    expect(r.reasons).toEqual(['capability_not_supplied:rare-skill'])
  })

  it('供给源全部缺席时判 unknown，不把源故障当成缺供给（审查 S3 修复）', () => {
    const r = assessCapabilityReadiness({
      requiredTags: ['coding'],
      supplyTags: [],
      assignee: null,
      candidates,
      anySourceAvailable: false,
    })
    expect(r.decision).toBe('unknown')
    expect(r.reasons).toEqual(['supply_sources_unavailable'])
    expect(r.candidates).toEqual([])
  })

  it('assignee 声明不可判（tags null）时警告 assignee_unverifiable，不误报未声明', () => {
    const r = assessCapabilityReadiness({
      requiredTags: ['coding'],
      supplyTags: ['coding'],
      assignee: { agentId: 'assigned', tags: null },
      candidates,
    })
    expect(r.decision).toBe('warn')
    expect(r.reasons).toEqual(['assignee_unverifiable'])
  })

  it('有供给但无 assignee 时警告并给候选', () => {
    const r = assessCapabilityReadiness({
      requiredTags: ['coding', 'review'],
      supplyTags: ['coding', 'review'],
      assignee: null,
      candidates,
    })
    expect(r.decision).toBe('warn')
    expect(r.reasons).toEqual(['no_assignee'])
    expect(r.candidates.map((c) => c.agentId)).toEqual(['c-full-high', 'c-full-low', 'c-null', 'c-partial'])
  })

  it('assignee 未声明覆盖时警告，不自动改派', () => {
    const r = assessCapabilityReadiness({
      requiredTags: ['coding', 'review'],
      supplyTags: ['coding', 'review'],
      assignee: { agentId: 'assigned', tags: ['coding'] },
      candidates,
    })
    expect(r.decision).toBe('warn')
    expect(r.reasons).toEqual(['assignee_undeclared:review'])
    expect(r.candidates.length).toBeGreaterThan(0)
  })

  it('assignee 覆盖全部需求时放行', () => {
    const r = assessCapabilityReadiness({
      requiredTags: ['coding', 'review'],
      supplyTags: ['coding', 'review'],
      assignee: { agentId: 'assigned', tags: ['coding', 'review'] },
      candidates,
    })
    expect(r.decision).toBe('pass')
    expect(r.reasons).toEqual(['assignee_covers'])
    expect(r.evidenceRefs).toEqual(['agent:assigned'])
  })

  it('候选排序确定：覆盖优先，其次 reliability，再次负载，最后 agentId', () => {
    const r = assessCapabilityReadiness({
      requiredTags: ['coding', 'review'],
      supplyTags: ['coding', 'review'],
      assignee: null,
      candidates: [
        { agentId: 'z', tags: ['coding', 'review'], reliability: 0.8, load: 1, evidenceRefs: [] },
        { agentId: 'a', tags: ['coding', 'review'], reliability: 0.8, load: 1, evidenceRefs: [] },
        { agentId: 'b', tags: ['coding', 'review'], reliability: 0.8, load: 0, evidenceRefs: [] },
      ],
    })
    expect(r.candidates.map((c) => c.agentId)).toEqual(['b', 'a', 'z'])
  })
})
