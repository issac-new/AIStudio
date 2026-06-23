// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// 可填充的 mock 数据（notify 聚合经 adapter 从这些读取）
const { mockGroupRooms, groupGetRoomUnread, groupLastMessageMap } = vi.hoisted(() => ({
  mockGroupRooms: [] as any[],
  groupGetRoomUnread: vi.fn(() => 0),
  groupLastMessageMap: {} as Record<string, any>,
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
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sessions: [], isSessionCompletedUnread: vi.fn(() => false), clearSessionCompletedUnread: vi.fn() }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), rooms: mockGroupRooms, getRoomUnread: groupGetRoomUnread, clearRoomUnread: vi.fn(), clearAllUnread: vi.fn(), lastMessageMap: groupLastMessageMap }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), sortedRooms: [], getRoomUnreadCount: vi.fn(() => 0) }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

beforeEach(() => {
  setActivePinia(createPinia())
  mockPush.mockClear()
  mockGroupRooms.splice(0, mockGroupRooms.length)
  for (const k of Object.keys(groupLastMessageMap)) delete groupLastMessageMap[k]
  groupGetRoomUnread.mockReturnValue(0)
})

describe('CockpitNotifyModal', () => {
  it('空态：notifyCount 为 0 时显示 notifyEmpty', () => {
    const store = useCockpitStore()
    store.openNotify()
    const w = mount(CockpitNotifyModal)
    expect(w.text()).toContain('notifyEmpty')
  })

  it('点击条目 → clearNotifyItemUnread + closeNotify + router.push', async () => {
    // 通过填充 group mock 数据让 notifyItems 经 adapter 产出真实条目
    mockGroupRooms.push({ id: 'g1', name: 'G' })
    groupGetRoomUnread.mockReturnValue(1)
    groupLastMessageMap['g1'] = { content: 'yo', senderName: 'B', ts: 2000 }

    const store = useCockpitStore()
    store.openNotify()
    const clearSpy = vi.spyOn(store, 'clearNotifyItemUnread')
    const w = mount(CockpitNotifyModal)
    const item = w.find('.cockpit-notify-modal__item')
    expect(item.exists()).toBe(true)
    await item.trigger('click')
    expect(clearSpy).toHaveBeenCalled()
    expect(store.notifyOpen).toBe(false)
    expect(mockPush).toHaveBeenCalledWith({ name: 'hermes.groupChatRoom', params: { roomId: 'g1' } })
  })

  it('全部标为已读按钮 → clearAllNotify', async () => {
    mockGroupRooms.push({ id: 'g1', name: 'G' })
    groupGetRoomUnread.mockReturnValue(1)

    const store = useCockpitStore()
    store.openNotify()
    const allSpy = vi.spyOn(store, 'clearAllNotify')
    const w = mount(CockpitNotifyModal)
    await w.find('.cockpit-notify-modal__readall').trigger('click')
    expect(allSpy).toHaveBeenCalled()
  })

  it('筛选 chip → setNotifySourceFilter', async () => {
    const store = useCockpitStore()
    store.openNotify()
    const spy = vi.spyOn(store, 'setNotifySourceFilter')
    const w = mount(CockpitNotifyModal)
    const chips = w.findAll('.cockpit-notify-modal__chip')
    await chips[1].trigger('click') // matrix
    expect(spy).toHaveBeenCalledWith('matrix')
  })
})
