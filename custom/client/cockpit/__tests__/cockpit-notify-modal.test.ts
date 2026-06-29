// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// Matrix mock 数据（notify 现在仅聚合 Matrix 未读）
const { mockSortedRooms, matrixGetRoomUnreadCount } = vi.hoisted(() => ({
  mockSortedRooms: [] as any[],
  matrixGetRoomUnreadCount: vi.fn(() => 0),
}))

vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: () => ({ tasks: [], fetchTasks: vi.fn(async () => {}), fetchAssignees: vi.fn(async () => {}), startEventStream: vi.fn() }) }))
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({ searchSessions: vi.fn(async () => []), listWorkspaceFiles: vi.fn(async () => []), getTimeline: vi.fn(async () => ({ items: [], total: 0 })) }))
vi.mock('@/api/hermes/kanban', async () => { const a = await vi.importActual<any>('@/api/hermes/kanban'); return { ...a, getTask: vi.fn(async () => null), addComment: vi.fn(async () => ({})) } })
vi.mock('@/api/hermes/sessions', async () => { const a = await vi.importActual<any>('@/api/hermes/sessions'); return { ...a, searchSessions: vi.fn(async () => []) } })
vi.mock('@/stores/hermes/auth', () => ({ useAuthStore: () => ({ user: null }) }))
const mockPush = vi.fn()
vi.mock('vue-router', async () => {
  const actual = await vi.importActual<any>('vue-router')
  return { ...actual, useRouter: () => ({ push: mockPush }) }
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}), switchSession: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}), sortedMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [], roomList: [], sortedRooms: mockSortedRooms, getRoomUnreadCount: matrixGetRoomUnreadCount }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

beforeEach(() => {
  setActivePinia(createPinia())
  mockPush.mockClear()
  mockSortedRooms.splice(0, mockSortedRooms.length)
  matrixGetRoomUnreadCount.mockReturnValue(0)
})

describe('CockpitNotifyModal (Matrix-only dropdown)', () => {
  it('空态：无未读时显示 notifyEmpty', () => {
    const store = useCockpitStore()
    store.openNotify()
    const w = mount(CockpitNotifyModal)
    expect(w.text()).toContain('notifyEmpty')
  })

  it('渲染 matrix 未读条目 + 点击 → closeNotify + router.push 进入 matrix 聊天页', async () => {
    mockSortedRooms.push({
      roomId: '!room1:sv', name: '测试房间', timeline: [
        { getType: () => 'm.room.message', getContent: () => ({ body: 'hello' }), getTs: () => 3000000000000, getSender: () => '@alice:sv' },
      ],
    })
    matrixGetRoomUnreadCount.mockReturnValue(2)

    const store = useCockpitStore()
    store.openNotify()
    const w = mount(CockpitNotifyModal)
    const item = w.find('.cockpit-notify-panel__item')
    expect(item.exists()).toBe(true)
    expect(store.notifyCount).toBe(2)
    await item.trigger('click')
    expect(store.notifyOpen).toBe(false)
    expect(mockPush).toHaveBeenCalledWith({ name: 'hermes.matrixChatRoom', params: { roomId: '!room1:sv' } })
  })

  it('关闭按钮 → closeNotify', async () => {
    const store = useCockpitStore()
    store.openNotify()
    const w = mount(CockpitNotifyModal)
    await w.find('.cockpit-notify-panel__close').trigger('click')
    expect(store.notifyOpen).toBe(false)
  })
})
