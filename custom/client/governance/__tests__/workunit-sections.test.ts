// @vitest-environment jsdom
// 执行单元责任台账三组件（2026-11-06 第一增量）：mock fetch 两态走查。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response
}

beforeEach(() => { fetchMock.mockReset() })
afterEach(() => { vi.clearAllMocks() })

const identitiesBody = {
  ok: true,
  identities: [
    { id: 'aid-1', name: 'orphan-unit', kind: 'agent', owner: 'team' },
    { id: 'aid-2', name: 'healthy-unit', kind: 'agent', owner: 'team' },
  ],
  events: [],
}

describe('WorkUnitLedgerSection', () => {
  it('无卡单元显示缺口；阶段徽标为登记；自然人名单可读', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/governance/agent-identity') return jsonResponse(identitiesBody)
      if (url === '/api/governance/people') {
        return jsonResponse({ ok: true, people: [{ id: 'p-1', name: 'alice', active: true, emails: [] }] })
      }
      if (url.includes('/card')) {
        const name = url.includes('aid-1') ? 'orphan-unit' : 'healthy-unit'
        const gaps = name === 'orphan-unit'
          ? [{ field: 'card', detail: '责任卡未填写' }]
          : []
        return jsonResponse({ ok: true, view: { card: name === 'orphan-unit' ? null : { primaryOwner: 'p-1', reviewer: undefined }, stage: 'registered', gaps } })
      }
      return jsonResponse({ ok: true })
    })
    const { default: C } = await import('../components/WorkUnitLedgerSection.vue')
    const w = mount(C, { global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(w.find('[data-testid="gov-workunit-row-orphan-unit"]').exists()).toBe(true)
    expect(w.find('[data-testid="gov-workunit-gaps-orphan-unit"]').text()).toContain('责任卡未填写')
    expect(w.find('[data-testid="gov-workunit-row-healthy-unit"]').exists()).toBe(true)
    w.unmount()
  })
})

describe('JudgmentRecordsSection', () => {
  it('空态显示「暂无署名记录」；表单字段齐', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/governance/agent-identity') return jsonResponse(identitiesBody)
      if (url.includes('/judgments')) return jsonResponse({ ok: true, records: [] })
      return jsonResponse({ ok: true })
    })
    const { default: C } = await import('../components/JudgmentRecordsSection.vue')
    const w = mount(C)
    await flushPromises()
    expect(w.find('[data-testid="gov-judgment-records"]').exists()).toBe(true)
    expect(w.text()).toContain('暂无署名记录')
    w.unmount()
  })
})

describe('SixQuestionsSection', () => {
  it('unknown 必带缺口文案；无缺口说明标红', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({
      ok: true,
      answers: [
        { id: 'q1', question: '责任链可还原', answer: 'unknown', evidence: [], gap: '无决策记录' },
        { id: 'q2', question: '无主单元', answer: 'unknown', evidence: [], gap: '' },
        { id: 'q6', question: '署名记录', answer: 'no', evidence: [], gap: '零署名记录' },
      ],
    }))
    const { default: C } = await import('../components/SixQuestionsSection.vue')
    const w = mount(C)
    await flushPromises()
    expect(w.find('[data-testid="gov-sixq-q1"]').text()).toContain('无决策记录')
    expect(w.find('[data-testid="gov-sixq-q2"]').text()).toContain('口径缺口未说明')
    expect(w.find('[data-testid="gov-sixq-q2"]').find('.sq__gap--missing').exists()).toBe(true)
    w.unmount()
  })
})
