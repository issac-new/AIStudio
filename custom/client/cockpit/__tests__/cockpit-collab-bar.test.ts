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
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}), switchSession: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}), sortedMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import CockpitCollabBar from '@/custom/cockpit/components/CockpitCollabBar.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitCollabBar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }, configurable: true, writable: true })
  })

  it('renders channel chip derived from tenant (matrix)', () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:m:Auth联调' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    const w = mount(CockpitCollabBar)
    expect(w.text()).toContain('Auth联调')
    expect(w.find('[data-channel-id="ch-t1"]').exists()).toBe(true)
  })

  it('renders no channel chip when tenant is plain', () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'platform-team' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    const w = mount(CockpitCollabBar)
    expect(w.find('[data-channel-id]').exists()).toBe(false)
  })

  it('clicking a channel selects it in store', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'group:!room:m:后端组' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    const w = mount(CockpitCollabBar)
    await w.find('[data-channel-id="ch-t1"]').trigger('click')
    expect(s.activeChannelId).toBe('ch-t1')
    expect(s.workspaceMode).toBe('chat')
  })

  it('clicking add button opens the new-collab menu', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:m:X' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    const w = mount(CockpitCollabBar)
    expect(w.find('.cockpit-collab-bar__menu').exists()).toBe(false)
    await w.find('[data-action="add"]').trigger('click')
    expect(w.find('.cockpit-collab-bar__menu').exists()).toBe(true)
  })

  it('channel chip shows navigate arrow when tenant has routeTarget', () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:m:Auth联调' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    const w = mount(CockpitCollabBar)
    expect(w.find('.cockpit-collab-bar__chip-nav').exists()).toBe(true)
  })

  it('channel chip has no navigate arrow when tenant is plain', () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'platform-team' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    const w = mount(CockpitCollabBar)
    expect(w.find('.cockpit-collab-bar__chip-nav').exists()).toBe(false)
  })

  it('menu has three new-collab options', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:m:X' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    const w = mount(CockpitCollabBar)
    await w.find('[data-action="add"]').trigger('click')
    expect(w.findAll('[data-new-kind]').length).toBe(3)
  })
})
