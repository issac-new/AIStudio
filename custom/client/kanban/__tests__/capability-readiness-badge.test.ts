// @vitest-environment jsdom
// 任务抽屉能力准入角标（批二点五 Task 10）：决策、理由、候选；无 skills 不渲染。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const api = vi.hoisted(() => ({ fetchCapabilityCandidates: vi.fn() }))
vi.mock('@/custom/governance/api/capability-pool', () => api)

beforeEach(() => api.fetchCapabilityCandidates.mockReset())

describe('CapabilityReadinessBadge', () => {
  it('渲染 warn 决策、未声明理由与候选', async () => {
    api.fetchCapabilityCandidates.mockResolvedValue({
      ok: true,
      readiness: {
        decision: 'warn',
        reasons: ['assignee_undeclared:review'],
        candidates: [
          { agentId: 'worker-coder', tags: ['coding', 'review'], reliability: 0.8, load: 1, evidenceRefs: ['graph:worker-coder'] },
        ],
        evidenceRefs: ['graph:worker-coder'],
      },
    })
    const { default: Badge } = await import('../components/CapabilityReadinessBadge.vue')
    const w = mount(Badge, { props: { taskId: 't1', skills: ['coding', 'review'], assignee: 'worker-tester' } })
    await flushPromises()

    expect(w.find('[data-testid="capability-readiness-badge"]').exists()).toBe(true)
    expect(api.fetchCapabilityCandidates).toHaveBeenCalledWith(['coding', 'review'], 'worker-tester')
    expect(w.text()).toContain('警告')
    expect(w.text()).toContain('assignee_undeclared:review')
    expect(w.text()).toContain('worker-coder')
    expect(w.text()).toContain('可靠度 0.8')
  })

  it('无 skills 不渲染、不发请求', async () => {
    const { default: Badge } = await import('../components/CapabilityReadinessBadge.vue')
    const w = mount(Badge, { props: { taskId: 't1', skills: [], assignee: null } })
    await flushPromises()
    expect(w.find('[data-testid="capability-readiness-badge"]').exists()).toBe(false)
    expect(api.fetchCapabilityCandidates).not.toHaveBeenCalled()
  })

  it('供给源全缺席时显示“无法判定”，不显示红色“缺供给”', async () => {
    api.fetchCapabilityCandidates.mockResolvedValue({
      ok: true,
      readiness: {
        decision: 'unknown',
        reasons: ['supply_sources_unavailable'],
        candidates: [],
        evidenceRefs: [],
      },
    })
    const { default: Badge } = await import('../components/CapabilityReadinessBadge.vue')
    const w = mount(Badge, { props: { taskId: 't1', skills: ['coding'], assignee: null } })
    await flushPromises()
    expect(w.text()).toContain('无法判定')
    expect(w.text()).not.toContain('缺供给')
    expect(w.find('.cr__decision').classes()).toContain('is-unknown')
  })

  it('接口返回失败显示错误文本，不显示“通过”', async () => {
    api.fetchCapabilityCandidates.mockResolvedValue({
      ok: false,
      error: '能力池不可用',
      readiness: { decision: 'pass', reasons: [], candidates: [], evidenceRefs: [] },
    } as never)
    const { default: Badge } = await import('../components/CapabilityReadinessBadge.vue')
    const w = mount(Badge, { props: { taskId: 't1', skills: ['coding'], assignee: null } })
    await flushPromises()
    expect(w.text()).toContain('能力池不可用')
    expect(w.text()).not.toContain('通过')
  })
})
