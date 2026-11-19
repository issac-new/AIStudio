// @vitest-environment jsdom
// 能力供需区渲染守门（批二点五 Task 10）：指标卡、缺口行、源缺席、未知不渲染成 0。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({
  fetchCapabilitySupplyDemand: vi.fn(),
  fetchCapabilityMetrics: vi.fn(),
}))

vi.mock('@/custom/governance/api/capability-pool', () => api)

const baseSources = {
  'capability-ledger': { available: true },
  'capability-graph': { available: false, note: '能力图缺席' },
  'skill-provisioning': { available: true },
  profiles: { available: true },
  'fleet-directory': { available: true },
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
})

describe('CapabilitySupplySection', () => {
  it('渲染指标卡/缺口行/源缺席，未知不渲染成 0', async () => {
    api.fetchCapabilityMetrics.mockResolvedValue({
      ok: true,
      readings: [
        {
          key: 'measure/capability-supply-lead-time', title: '能力供给时效', value: 1500, unit: 'ms',
          sample: 2, available: true, definition: '中位时长 / 同口径任务数', sources: [],
        },
        {
          key: 'measure/human-ai-team-success', title: '人机团队成功率', value: null, unit: '%',
          sample: 0, available: false, gap: '批三 OutcomeTeam/Settlement 未落地', definition: '成功团队数 / 已结算团队数', sources: [],
        },
      ],
    })
    api.fetchCapabilitySupplyDemand.mockResolvedValue({
      ok: true,
      report: {
        generatedAt: 1,
        rows: [
          {
            tag: 'coding', demand: 2, supplyUnits: 1, supplyAgents: 1, supplySkills: 0, gap: 0,
            distinctBoards: 2, supplyLeadTimeMedianMs: 1500, lastUsedAt: null,
            sources: baseSources, evidenceRefs: ['task:t1'],
          },
          {
            tag: 'missing', demand: 1, supplyUnits: 0, supplyAgents: 0, supplySkills: 0, gap: 1,
            distinctBoards: 1, supplyLeadTimeMedianMs: null, lastUsedAt: null,
            sources: baseSources, evidenceRefs: ['task:t2'],
          },
        ],
        tagIssues: [{ tag: 'Bad Tag', reason: 'illegal' }],
        sources: baseSources,
        unknowns: ['capability-graph: 能力图缺席'],
      },
    })

    const { default: Section } = await import('../components/CapabilitySupplySection.vue')
    const w = mount(Section)
    await flushPromises()

    expect(w.find('[data-testid="capability-supply-section"]').exists()).toBe(true)
    expect(w.find('[data-testid="cp-metrics"]').text()).toContain('1,500 ms')
    expect(w.find('[data-testid="cp-metrics"]').text()).toContain('批三 OutcomeTeam/Settlement 未落地')
    expect(w.find('[data-testid="cp-row-missing"]').classes()).toContain('is-gap')
    expect(w.find('[data-testid="cp-table"]').text()).toContain('missing')
    expect(w.find('[data-testid="cp-sources"]').text()).toContain('能力图 未知')
    expect(w.find('[data-testid="cp-source-gaps"]').text()).toContain('能力图缺席')
    expect(w.find('[data-testid="cp-tag-issues"]').text()).toContain('Bad Tag')
    expect(w.find('[data-testid="cp-unknowns"]').text()).toContain('能力图缺席')
  })

  it('空报告显示“暂无需求”，不显示 0 供给', async () => {
    api.fetchCapabilityMetrics.mockResolvedValue({ ok: true, readings: [] })
    api.fetchCapabilitySupplyDemand.mockResolvedValue({
      ok: true,
      report: { generatedAt: 1, rows: [], tagIssues: [], sources: baseSources, unknowns: [] },
    })
    const { default: Section } = await import('../components/CapabilitySupplySection.vue')
    const w = mount(Section)
    await flushPromises()
    expect(w.find('[data-testid="cp-empty"]').text()).toContain('暂无需求')
    expect(w.find('[data-testid="cp-table"]').exists()).toBe(false)
  })
})
