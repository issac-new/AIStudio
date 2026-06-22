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

import CockpitHistoryModal from '@/custom/cockpit/components/CockpitHistoryModal.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitHistoryModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    getTimeline.mockClear()
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }, configurable: true, writable: true })
  })

  function seed() {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    s.history = [
      { id: 'h-evt-1', when: '今天 14:36', taskId: 't1', action: '审批', title: '审批 PR #142', archived: false },
      { id: 'h-cmt-2', when: '昨天 18:40', taskId: 't1', action: '补充', title: '审批 v2.2', archived: true },
    ]
    return s
  }

  it('renders filtered history items', () => {
    seed()
    const w = mount(CockpitHistoryModal)
    expect(w.text()).toContain('审批 PR #142')
    expect(w.findAll('[data-history-id]').length).toBe(2)
  })

  it('clicking an active item recalls it (closes modal, not archived)', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-history-id="h-evt-1"]').trigger('click')
    expect(s.historyOpen).toBe(false)
    expect(s.archivedMode).toBe(false)
  })

  it('clicking an archived item sets archived mode', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-history-id="h-cmt-2"]').trigger('click')
    expect(s.archivedMode).toBe(true)
  })

  it('action filter chip toggles', async () => {
    const s = seed()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-action-filter="审批"]').trigger('click')
    expect(s.historyFilters.actions).toContain('审批')
  })

  it('close button closes the modal', async () => {
    const s = seed()
    s.openHistory()
    const w = mount(CockpitHistoryModal)
    await w.find('[data-action="close"]').trigger('click')
    expect(s.historyOpen).toBe(false)
  })

  it('openHistory calls timeline aggregate route and fills history', async () => {
    getTimeline.mockResolvedValue({
      items: [
        { source: 'event', id: 'evt-9', taskId: 't1', taskTitle: 'T', taskArchived: false,
          ts: 1000, kind: 'status_changed', payload: { to: 'review' } },
      ],
      total: 1,
    })
    const s = useCockpitStore()
    await s.openHistory()
    expect(getTimeline).toHaveBeenCalledWith({ limit: 100 })
    expect(s.history).toHaveLength(1)
    expect(s.history[0].action).toBe('审批')  // status_changed→review 派生
  })
})
