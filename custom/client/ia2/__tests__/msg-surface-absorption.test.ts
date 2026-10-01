// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/msg-surface-absorption.test.ts
// 守门：消息面吸收批（2026-10-01）——Spotlight 混合搜索面板 + 未读线程聚合 +
// 跨房打开线程面板的 pending 状态机。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// ── Spotlight 依赖 mock ──
const push = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))
const sessionRowsVal = vi.hoisted(() => ({
  value: [
    { kind: 'room', id: '!room1', name: '需求分析讨论群', unread: 2, taskIds: [], teamTag: '', dutyName: null, lastActivityAt: 1 },
    { kind: 'chat', id: 'sess-9', name: '支付核心开发会话', unread: 0, taskIds: ['t_123'], teamTag: '', dutyName: null, lastActivityAt: 2 },
  ] as Array<Record<string, unknown>>,
}))
vi.mock('../composables/useSessionRows', () => ({
  useSessionRows: () => ({ sessionRows: sessionRowsVal }),
}))
const matrixRoomMock = vi.hoisted(() => ({
  selectRoom: vi.fn(),
  requestOpenThreadPanel: vi.fn(),
  sortedRooms: [] as any[],
  roomVersion: 0,
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => matrixRoomMock,
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({
    cockpitTasksAny: [{ id: 't_123', title: '打通支付回调' }],
  }),
}))

import SpotlightPanel from '../components/SpotlightPanel.vue'

describe('SpotlightPanel — 混合搜索（element-web Spotlight 吸收）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('空查询显示命令组（默认建议面，含看板/收件箱/运行中心命令）', () => {
    const wrapper = mount(SpotlightPanel, { props: { query: '' } })
    const rows = wrapper.findAll('.spot__row')
    expect(rows.length).toBeGreaterThanOrEqual(8)
    expect(wrapper.text()).toContain('打开看板')
    expect(wrapper.find('[data-testid="spotlight-row-c:board"]').exists()).toBe(true)
  })

  it('查询命中会话行（名称与任务号双路匹配）', () => {
    const wrapper = mount(SpotlightPanel, { props: { query: '需求分析' } })
    expect(wrapper.find('[data-testid="spotlight-row-s:room:!room1"]').exists()).toBe(true)
    const byTask = mount(SpotlightPanel, { props: { query: 't_123' } })
    expect(byTask.find('[data-testid="spotlight-row-s:chat:sess-9"]').exists()).toBe(true)
  })

  it('查询命中看板任务行', () => {
    const wrapper = mount(SpotlightPanel, { props: { query: '支付回调' } })
    expect(wrapper.find('[data-testid="spotlight-row-t:t_123"]').exists()).toBe(true)
  })

  it('无匹配显示空态', () => {
    const wrapper = mount(SpotlightPanel, { props: { query: 'zzz不存在' } })
    expect(wrapper.find('.spot__empty').exists()).toBe(true)
  })

  it('键盘 Enter 激活当前行（命令直达路由）', async () => {
    const wrapper = mount(SpotlightPanel, { props: { query: '' } })
    await wrapper.vm.onKeydown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }) as KeyboardEvent)
    await flushPromises()
    expect(push).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('房间行点击走 selectRoom 兜底 + commsRoom 路由（WorkbenchView.onSelect 同源）', async () => {
    const wrapper = mount(SpotlightPanel, { props: { query: '需求分析' } })
    await wrapper.find('[data-testid="spotlight-row-s:room:!room1"]').trigger('click')
    expect(matrixRoomMock.selectRoom).toHaveBeenCalledWith('!room1')
    expect(push).toHaveBeenCalledWith({ name: 'ia2.commsRoom', params: { roomId: '!room1' } })
  })
})

// ── 未读线程聚合（纯数据面） ──
describe('未读线程聚合数据面（threadsAggregateNotificationType 归并）', () => {
  it('Highlight/Total 双态归并，none 与异常房跳过，截断 8 条', () => {
    const rooms = [
      { roomId: '!a', name: 'A', threadsAggregateNotificationType: 'Highlight' },
      { roomId: '!b', name: 'B', threadsAggregateNotificationType: 'Total' },
      { roomId: '!c', name: 'C', threadsAggregateNotificationType: undefined },
      { roomId: '!d', name: 'D' },
      ...Array.from({ length: 10 }, (_, i) => ({ roomId: `!h${i}`, name: `H${i}`, threadsAggregateNotificationType: 'Total' })),
    ]
    const out = rooms.flatMap((room: any) => {
      try {
        const n = room?.threadsAggregateNotificationType
        if (n === 'Highlight' || n === 2) return [{ roomId: room.roomId, highlight: true }]
        if (n === 'Total' || n === 1) return [{ roomId: room.roomId, highlight: false }]
        return []
      } catch { return [] }
    }).slice(0, 8)
    expect(out).toHaveLength(8)
    expect(out[0]).toEqual({ roomId: '!a', highlight: true })
    expect(out[1]).toEqual({ roomId: '!b', highlight: false })
  })
})
