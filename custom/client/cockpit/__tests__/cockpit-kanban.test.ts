// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// ── mock kanban store ──
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
const { mockSearchHermesSessions } = vi.hoisted(() => ({
  mockSearchHermesSessions: vi.fn(async (_q: string) => []),
}))
vi.mock('@/api/hermes/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/sessions')
  return { ...actual, searchSessions: mockSearchHermesSessions }
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}), switchSession: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}), sortedMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [], roomList: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))

import CockpitKanban from '@/custom/cockpit/components/CockpitKanban.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitKanban', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    mockSearchHermesSessions.mockResolvedValue([])
    // mock clipboard
    if (!(globalThis as any).navigator) (globalThis as any).navigator = {} as any
    ;(globalThis as any).navigator.clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }, configurable: true, writable: true })
  })

  function seed() {
    mockKanbanTasks.push(
      kt({ id: '1', title: 'PR #142', priority: 3, status: 'review', tenant: 'team-a' }),
      kt({ id: '2', title: '联调', priority: 2, status: 'blocked', tenant: 'team-a' }),
      kt({ id: '3', title: '发版', priority: 2, status: 'running', tenant: 'team-b' }),
    )
    return useCockpitStore()
  }

  it('renders tasks as flat list (no grouping)', () => {
    seed()
    const w = mount(CockpitKanban)
    const tasks = w.findAll('[data-task-id]')
    expect(tasks).toHaveLength(3)
    // 无分组标题（.cockpit-kanban__cat-head 不应存在）
    expect(w.find('.cockpit-kanban__cat-head').exists()).toBe(false)
  })

  it('renders tenant column per task', () => {
    seed()
    const w = mount(CockpitKanban)
    const tenants = w.findAll('.cockpit-kanban__tenant')
    expect(tenants).toHaveLength(3) // team-a（2个任务）+ team-b（1个任务）
    expect(tenants[0].text()).toBe('team-a')
  })

  it('renders P0 task with is-p0 class', () => {
    seed()
    const w = mount(CockpitKanban)
    expect(w.find('[data-task-id="1"]').classes()).toContain('is-p0')
  })

  it('clicking a task selects it in the store', async () => {
    const s = seed()
    const w = mount(CockpitKanban)
    await w.find('[data-task-id="2"]').trigger('click')
    expect(s.selectedTaskId).toBe('2')
  })

  it('clicking a priority filter chip toggles the filter', async () => {
    const s = seed()
    const w = mount(CockpitKanban)
    await w.find('[data-filter="P0"]').trigger('click')
    expect(s.filters.priorities).toContain('P0')
    await w.find('[data-filter="P0"]').trigger('click')
    expect(s.filters.priorities).not.toContain('P0')
  })

  it('filtering by P1 hides the P0 task', async () => {
    seed()
    const w = mount(CockpitKanban)
    await w.find('[data-filter="P1"]').trigger('click')
    expect(w.find('[data-task-id="1"]').exists()).toBe(false)
    expect(w.find('[data-task-id="2"]').exists()).toBe(true)
  })

  it('status filter chips are 5 buckets', () => {
    seed()
    const w = mount(CockpitKanban)
    const statusChips = w.findAll('[data-filter="review"],[data-filter="blocked"],[data-filter="running"],[data-filter="todo"],[data-filter="done"]')
    expect(statusChips).toHaveLength(5)
  })

  it('search filters tasks by local match via store', async () => {
    seed()
    const s = useCockpitStore()
    s.runSearch('PR')
    const filtered = s.filteredTasks.map(t => t.id)
    expect(filtered).toEqual(['1'])
  })

  it('clearSearch restores all tasks', async () => {
    seed()
    const s = useCockpitStore()
    s.runSearch('PR')
    s.clearSearch()
    const filtered = s.filteredTasks.map(t => t.id).sort()
    expect(filtered).toEqual(['1', '2', '3'])
  })

  it('renders task id copy element per task', () => {
    seed()
    const w = mount(CockpitKanban)
    const ids = w.findAll('[data-task-id-copy]')
    expect(ids).toHaveLength(3)
    expect(ids[0].text()).toBe('#1')
  })

  it('clicking task id copies to clipboard', async () => {
    seed()
    const w = mount(CockpitKanban)
    await w.find('[data-task-id-copy]').trigger('click')
    const clip = (globalThis as any).navigator.clipboard
    expect(clip.writeText).toHaveBeenCalledWith('1')
  })
})
