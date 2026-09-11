// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { mockKanbanTasks, fetchTasks } = vi.hoisted(() => ({
  mockKanbanTasks: [] as any[],
  fetchTasks: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ tasks: mockKanbanTasks, fetchTasks, fetchAssignees: vi.fn(async () => {}), startEventStream: vi.fn() }),
}))
const { searchSessions, listWorkspaceFiles, getTimeline } = vi.hoisted(() => ({
  searchSessions: vi.fn(async () => []),
  listWorkspaceFiles: vi.fn(async () => []),
  getTimeline: vi.fn(async () => ({ items: [], total: 0 })),
}))
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({ searchSessions, listWorkspaceFiles, getTimeline }))
const { getTask, addComment } = vi.hoisted(() => ({
  getTask: vi.fn(async () => null),
  addComment: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, getTask, addComment }
})

// 聊天 store mock —— 暴露 spy 供测试验证 sendMessage 分发
const { chatMessages, chatSendMessage } = vi.hoisted(() => ({
  chatMessages: [] as any[],
  chatSendMessage: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    loadSessions: vi.fn(async () => {}),
    messages: chatMessages,
    sendMessage: chatSendMessage,
    switchSession: vi.fn(async () => {}),
  }),
}))
const { groupMessages, groupSendMessage } = vi.hoisted(() => ({
  groupMessages: [] as any[],
  groupSendMessage: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/group-chat', () => ({
  useGroupChatStore: () => ({
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    loadRooms: vi.fn(async () => {}),
    joinRoom: vi.fn(async () => {}),
    sendMessage: groupSendMessage,
    sortedMessages: groupMessages,
  }),
}))
const { matrixSendMessage } = vi.hoisted(() => ({ matrixSendMessage: vi.fn(async () => {}) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [] }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({
  useMatrixComposerStore: () => ({ sendMessage: matrixSendMessage }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import CockpitChatPane from '@/custom/cockpit/components/CockpitChatPane.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitChatPane', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    chatMessages.splice(0, chatMessages.length)
    groupMessages.splice(0, groupMessages.length)
    chatSendMessage.mockClear()
    groupSendMessage.mockClear()
    matrixSendMessage.mockClear()
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }, configurable: true, writable: true })
  })

  it('renders channel header with label and kind', () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:m:Auth联调' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    s.selectChannel('ch-t1')
    const w = mount(CockpitChatPane)
    expect(w.text()).toContain('Auth联调')
    expect(w.text()).toContain('matrix')
  })

  it('renders chat messages from chatStore (session channel)', () => {
    chatMessages.push(
      { id: 'm1', role: 'user', content: '请审查', timestamp: 1 },
      { id: 'm2', role: 'assistant', content: '好的', timestamp: 2 },
    )
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'session:sess_1@arch:讨论' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    s.selectChannel('ch-t1')
    const w = mount(CockpitChatPane)
    expect(w.text()).toContain('请审查')
    expect(w.text()).toContain('好的')
  })

  it('my message (role=user) has is-me class', () => {
    chatMessages.push({ id: 'm1', role: 'user', content: 'mine', timestamp: 1 })
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'session:sess_1@arch:讨论' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    s.selectChannel('ch-t1')
    const w = mount(CockpitChatPane)
    expect(w.find('[data-message-id="m1"]').classes()).toContain('is-me')
  })

  it('sending a chat message dispatches to chatStore.sendMessage', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'session:sess_1@arch:讨论' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    s.selectChannel('ch-t1')
    const w = mount(CockpitChatPane)
    await w.find('.cockpit-chat-pane__input').setValue('hello agent')
    await w.find('[data-action="send"]').trigger('click')
    expect(chatSendMessage).toHaveBeenCalledWith('hello agent')
  })

  it('sending a group message dispatches to groupChatStore.sendMessage', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'group:!room:m:后端组' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    s.selectChannel('ch-t1')
    const w = mount(CockpitChatPane)
    await w.find('.cockpit-chat-pane__input').setValue('hi group')
    await w.find('[data-action="send"]').trigger('click')
    expect(groupSendMessage).toHaveBeenCalledWith('hi group')
  })

  it('sending a matrix message dispatches to matrixComposerStore.sendMessage', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:m:Auth联调' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    s.selectChannel('ch-t1')
    const w = mount(CockpitChatPane)
    await w.find('.cockpit-chat-pane__input').setValue('hi matrix')
    await w.find('[data-action="send"]').trigger('click')
    expect(matrixSendMessage).toHaveBeenCalledWith('hi matrix')
  })

  it('shows open-full button when channel has routeTarget', () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:m:Auth联调' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    s.selectChannel('ch-t1')
    const w = mount(CockpitChatPane)
    expect(w.find('.cockpit-chat-pane__open').exists()).toBe(true)
  })

  it('shows empty state when no active channel', () => {
    const w = mount(CockpitChatPane)
    expect(w.find('.cockpit-chat-pane__empty').exists()).toBe(true)
  })
})
