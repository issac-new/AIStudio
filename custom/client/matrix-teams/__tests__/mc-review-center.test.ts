// @vitest-environment jsdom
// overlay/custom/client/matrix-teams/__tests__/mc-review-center.test.ts
// M-C 评审中心守门：卡片三态 + signoffs 渲染 + 驳回必附原因（VTU，t=恒等 mock 沿 gov-overlay 惯例）、
// store 会签投影与待审清单（v1 语义：无 signoff 单事件即其 verdict 终态；conditional 聚合 = 待复核）、
// sendVerdict wire 形态（每事件单 signoff）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import { DELIVERY_EVENT_TYPES, type GateContent } from '../delivery-protocol'
import GateReviewCard from '../components/GateReviewCard.vue'

// ── VTU：GateReviewCard 三态（M-C 验收门 3）──
const baseProps = {
  caseId: 'c-001', gate: 'R2', evidenceSummary: 'design.md 评审',
  signoffs: [] as Array<{ decidedBy: string; verdict: 'pass' | 'conditional' | 'reject'; at: number }>,
  pending: true, canSign: true,
}
function card(props: Partial<typeof baseProps> & { verdict: 'pass' | 'conditional' | 'reject'; reason?: string }) {
  return mount(GateReviewCard, {
    props: { ...baseProps, ...props } as never,
    global: { plugins: [createPinia()] },
  })
}

describe('GateReviewCard 三态', () => {
  it('待审（conditional）→ Pending 徽章 + 通过/驳回操作', () => {
    const w = card({ verdict: 'conditional' })
    expect(w.find('[data-testid="gate-card-state-c-001-R2"]').text()).toBe('ia2.review.state.pending')
    expect(w.find('[data-testid="gate-pass-c-001-R2"]').exists()).toBe(true)
    expect(w.find('[data-testid="gate-reject-c-001-R2"]').exists()).toBe(true)
  })
  it('通过（aggregate pass）→ Passed 徽章，不显操作', () => {
    const w = card({ verdict: 'pass', pending: false, signoffs: [{ decidedBy: '@a:sv', verdict: 'pass', at: 1 }], canSign: true })
    expect(w.find('[data-testid="gate-card-state-c-001-R2"]').text()).toBe('ia2.review.state.pass')
    expect(w.find('[data-testid="gate-pass-c-001-R2"]').exists()).toBe(false)
  })
  it('驳回（aggregate reject）→ Rejected 徽章 + 原因展示', () => {
    const w = card({ verdict: 'reject', pending: false, reason: '[REJECT:边界不足] 补用例', signoffs: [{ decidedBy: '@b:sv', verdict: 'reject', at: 2 }] })
    expect(w.find('[data-testid="gate-card-state-c-001-R2"]').text()).toBe('ia2.review.state.reject')
    expect(w.find('[data-testid="gate-reason-c-001-R2"]').text()).toContain('补用例')
  })
  it('signoffs 逐人渲染（会签进度可见）', () => {
    const w = card({ verdict: 'conditional', signoffs: [
      { decidedBy: '@alice:sv', verdict: 'pass', at: 1 },
      { decidedBy: '@bob:sv', verdict: 'reject', at: 2 },
    ] })
    const rows = w.findAll('[data-testid="gate-signoffs-c-001-R2"] li')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('alice')
    expect(rows[1].text()).toContain('bob')
  })
  it('驳回必附原因：空原因提交 → 报错不发事件；填原因 → emit 带 reason', async () => {
    const w = card({ verdict: 'conditional' })
    await w.find('[data-testid="gate-reject-c-001-R2"]').trigger('click')
    await w.find('[data-testid="gate-reject-submit-c-001-R2"]').trigger('click')
    expect(w.find('.grc__reason-err').exists()).toBe(true)
    expect(w.emitted('sign')).toBeUndefined()
    await w.find('[data-testid="gate-reason-input-c-001-R2"]').setValue('设计缺边界')
    await w.find('[data-testid="gate-reject-submit-c-001-R2"]').trigger('click')
    expect(w.emitted('sign')).toEqual([[{ verdict: 'reject', reason: '设计缺边界' }]])
  })
  it('canSign=false（bot 视角/非人工门）→ 不显操作', () => {
    const w = card({ verdict: 'conditional', canSign: false })
    expect(w.find('[data-testid="gate-pass-c-001-R2"]').exists()).toBe(false)
  })
})

// ── store：会签投影 + sendVerdict ──
const sentEvents: Array<{ roomId?: string; type: string; content: Record<string, unknown> }> = []
const sdkClient = {
  on: () => {}, off: () => {},
  sendEvent: async (roomId: string, type: string, content: Record<string, unknown>) => { sentEvents.push({ roomId, type, content }) },
}
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { value: sdkClient }, userId: { value: '@alice:sv' } }),
}))

import { useReviewCenterStore } from '../stores/review-center'

const gate = (over: Partial<GateContent> = {}): GateContent => ({
  schemaVersion: 2, caseId: 'c-001', gate: 'R2', verdict: 'conditional',
  evidence: { kind: 'human', summary: 's' }, reason: '待复核', decidedBy: '@bob:sv', at: 1, ...over,
} as GateContent)
const sdkEv = (type: string, content: unknown, roomId = '!case:sv') => ({
  getType: () => type, isState: () => false, getContent: () => content,
})

beforeEach(() => {
  setActivePinia(createPinia())
  sentEvents.length = 0
})

describe('review-center store', () => {
  it('conditional 聚合 → 待审；第二人签 pass 仍 conditional；全员 pass 才出待审清单', async () => {
    const store = useReviewCenterStore()
    await store.handleTimelineEvent(sdkEv(DELIVERY_EVENT_TYPES.gate, gate()), { roomId: '!case:sv' })
    expect(store.pendingReviews).toHaveLength(1)
    expect(store.pendingReviews[0]).toMatchObject({ caseId: 'c-001', gate: 'R2', isHumanGate: true, pending: true })
    // alice 签 pass：bob(conditional) + alice(pass) → 聚合仍 conditional，待审不消
    await store.handleTimelineEvent(sdkEv(DELIVERY_EVENT_TYPES.gate, gate({
      verdict: 'pass', reason: undefined,
      signoff: { decidedBy: '@alice:sv', verdict: 'pass', at: 5 },
    })), { roomId: '!case:sv' })
    expect(store.pendingReviews).toHaveLength(1)
    // bob 改签 pass（最新覆盖）：全员 pass → 出待审
    await store.handleTimelineEvent(sdkEv(DELIVERY_EVENT_TYPES.gate, gate({
      verdict: 'pass', reason: undefined,
      signoff: { decidedBy: '@bob:sv', verdict: 'pass', at: 9 },
    })), { roomId: '!case:sv' })
    const item = store.reviewItems.find(i => i.caseId === 'c-001')
    expect(item?.verdict).toBe('pass')
    expect(item?.pending).toBe(false)
    expect(store.pendingReviews).toHaveLength(0)
  })
  it('任一 reject → 聚合 reject，出待审清单', async () => {
    const store = useReviewCenterStore()
    await store.handleTimelineEvent(sdkEv(DELIVERY_EVENT_TYPES.gate, gate({ verdict: 'reject', reason: 'r', signoff: { decidedBy: '@bob:sv', verdict: 'reject', at: 1 } })), { roomId: '!case:sv' })
    expect(store.reviewItems.find(i => i.caseId === 'c-001')?.verdict).toBe('reject')
    expect(store.pendingReviews).toHaveLength(0)
  })
  it('sendVerdict：pass → 案例房发带本人 signoff 的 gate 事件；reject 缺 reason → reason-required', async () => {
    const store = useReviewCenterStore()
    await store.handleTimelineEvent(sdkEv(DELIVERY_EVENT_TYPES.gate, gate()), { roomId: '!case:sv' })
    const bad = await store.sendVerdict({ caseId: 'c-001', gate: 'R2', verdict: 'reject' })
    expect(bad).toEqual({ ok: false, error: 'reason-required' })
    expect(sentEvents).toHaveLength(0)
    const ok = await store.sendVerdict({ caseId: 'c-001', gate: 'R2', verdict: 'pass' })
    expect(ok).toEqual({ ok: true })
    expect(sentEvents[0]).toMatchObject({ roomId: '!case:sv', type: DELIVERY_EVENT_TYPES.gate })
    expect(sentEvents[0].content).toMatchObject({
      caseId: 'c-001', gate: 'R2', verdict: 'pass', decidedBy: '@alice:sv',
      signoff: { decidedBy: '@alice:sv', verdict: 'pass' },
    })
  })
  it('未知 case 无房间 → no-room', async () => {
    const store = useReviewCenterStore()
    expect(await store.sendVerdict({ caseId: 'ghost', gate: 'R1', verdict: 'pass' })).toEqual({ ok: false, error: 'no-room' })
  })
})
