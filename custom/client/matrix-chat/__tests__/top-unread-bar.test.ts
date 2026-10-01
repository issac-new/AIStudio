// @vitest-environment jsdom
// overlay/custom/client/matrix-chat/__tests__/top-unread-bar.test.ts
// 守门：跳到未读条（2026-10-01 消息面批 #2，element-web TopUnreadMessagesBar 吸收）。
// 断言面：①未读>0 才渲染（零未读不占位）②跳到未读优先 read marker 锚点
// ③标记已读发 SDK receipt（unthreaded）且本地清零。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const storeState = vi.hoisted(() => ({
  activeRoom: {
    roomId: '!r1',
    getUnreadNotificationCount: vi.fn(() => 5),
    getLiveTimeline: () => ({ getEvents: () => [{ getId: () => '$last' }] }),
    setUnreadNotificationCount: vi.fn(),
  },
  readMarkerEventId: '$marker' as string | null,
  selectEvent: vi.fn(),
  refreshRoomList: vi.fn(),
  bumpRoomVersion: vi.fn(),
  roomVersion: 0,
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => storeState,
}))
const sendReadReceipt = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: { sendReadReceipt }, userId: '@me' }),
}))

import MatrixTopUnreadBar from '../components/MatrixTopUnreadBar.vue'

describe('MatrixTopUnreadBar — 跳到未读条', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.readMarkerEventId = '$marker'
    storeState.activeRoom.getUnreadNotificationCount.mockReturnValue(5)
    setActivePinia(createPinia())
  })

  it('零未读不渲染（不占位不闪）', () => {
    storeState.activeRoom.getUnreadNotificationCount.mockReturnValue(0)
    const wrapper = mount(MatrixTopUnreadBar)
    expect(wrapper.find('[data-testid="matrix-top-unread-bar"]').exists()).toBe(false)
  })

  it('未读>0 渲染并显示计数（99+ 截断）', () => {
    storeState.activeRoom.getUnreadNotificationCount.mockReturnValue(120)
    const wrapper = mount(MatrixTopUnreadBar)
    expect(wrapper.find('[data-testid="matrix-top-unread-bar"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('99+')
  })

  it('「跳到未读」优先走 read marker 锚点（selectEvent）', async () => {
    const wrapper = mount(MatrixTopUnreadBar)
    await wrapper.find('[data-testid="matrix-top-unread-jump"]').trigger('click')
    expect(storeState.selectEvent).toHaveBeenCalledWith('$marker')
    expect(wrapper.emitted('jump-bottom')).toBeFalsy()
  })

  it('无 marker 时跳未读退化为跳底部', async () => {
    storeState.readMarkerEventId = null
    const wrapper = mount(MatrixTopUnreadBar)
    await wrapper.find('[data-testid="matrix-top-unread-jump"]').trigger('click')
    expect(wrapper.emitted('jump-bottom')).toBeTruthy()
  })

  it('「标记已读」发 SDK receipt（unthreaded）且本地清零触发刷新', async () => {
    const wrapper = mount(MatrixTopUnreadBar)
    await wrapper.find('[data-testid="matrix-top-unread-mark"]').trigger('click')
    await vi.waitFor(() => expect(sendReadReceipt).toHaveBeenCalledTimes(1))
    const [, , unthreaded] = sendReadReceipt.mock.calls[0] as unknown as [unknown, unknown, boolean]
    expect(unthreaded).toBe(true)
    expect(storeState.activeRoom.setUnreadNotificationCount).toHaveBeenCalledWith('total', 0)
    expect(storeState.refreshRoomList).toHaveBeenCalled()
    expect(storeState.bumpRoomVersion).toHaveBeenCalled()
  })
})
