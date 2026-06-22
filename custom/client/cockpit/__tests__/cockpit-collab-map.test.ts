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
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}), switchSession: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}), sortedMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import CockpitCollabMap from '@/custom/cockpit/components/CockpitCollabMap.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitCollabMap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    getTask.mockClear()
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }, configurable: true, writable: true })
  })

  async function seed() {
    // 当前任务 + 父任务 + 子任务
    mockKanbanTasks.push(
      kt({ id: 't1', title: '中心任务', tenant: 'matrix:!r:m:Auth联调' }),
      kt({ id: 'p1', title: '父任务' }),
      kt({ id: 'c1', title: '子任务1' }),
    )
    // getTask 返回带 parents/children 的 detail
    getTask.mockResolvedValue({
      task: { id: 't1', title: '中心任务', body: null, assignee: 'alice', status: 'todo', priority: 0, created_by: 'bob', created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: '~/ws', tenant: 'matrix:!r:m:Auth联调', project_id: null, result: null, skills: null },
      latest_summary: null, comments: [], events: [], runs: [],
      parents: ['p1'], children: ['c1'],
    })
    const s = useCockpitStore()
    await s.bootstrap()
    return s
  }

  it('renders center node (current task title) + radiate nodes', async () => {
    await seed()
    const w = mount(CockpitCollabMap)
    expect(w.text()).toContain('中心任务')
    expect(w.text()).toContain('父任务')
    expect(w.text()).toContain('子任务1')
    // center node 是 focus 态
    expect(w.find('[data-node-kind="center"]').classes()).toContain('is-focus')
  })

  it('renders person nodes (assignee + created_by)', async () => {
    await seed()
    const w = mount(CockpitCollabMap)
    expect(w.text()).toContain('alice')  // assignee
    expect(w.text()).toContain('bob')    // created_by
  })

  it('renders channel node from tenant', async () => {
    await seed()
    const w = mount(CockpitCollabMap)
    expect(w.text()).toContain('Auth联调')
    expect(w.find('[data-node-kind="channel"]').exists()).toBe(true)
  })

  it('renders canvas control buttons', async () => {
    await seed()
    const w = mount(CockpitCollabMap)
    expect(w.find('[data-canvas-fullscreen]').exists()).toBe(true)
    expect(w.find('[data-canvas-minimize]').exists()).toBe(true)
    expect(w.find('[data-canvas-zoom-in]').exists()).toBe(true)
    expect(w.find('[data-canvas-zoom-out]').exists()).toBe(true)
  })

  it('zoom-in button increases canvas scale', async () => {
    const s = await seed()
    const w = mount(CockpitCollabMap)
    const before = s.canvasTransform.scale
    await w.find('[data-canvas-zoom-in]').trigger('click')
    expect(s.canvasTransform.scale).toBeGreaterThan(before)
  })

  it('fullscreen button toggles maximized', async () => {
    const s = await seed()
    const w = mount(CockpitCollabMap)
    expect(s.maximized).toBe(false)
    await w.find('[data-canvas-fullscreen]').trigger('click')
    expect(s.maximized).toBe(true)
  })

  it('clicking a parent node selects that task in store', async () => {
    const s = await seed()
    const w = mount(CockpitCollabMap)
    const parentNode = w.find('[data-node-kind="parent"]')
    await parentNode.trigger('click')
    expect(s.selectedTaskId).toBe('p1')
  })

  it('clicking a channel node switches workspace mode to chat', async () => {
    const s = await seed()
    const w = mount(CockpitCollabMap)
    const chNode = w.find('[data-node-kind="channel"]')
    await chNode.trigger('click')
    expect(s.workspaceMode).toBe('chat')
  })

  it('renders SVG line between center and radiate nodes', async () => {
    await seed()
    const w = mount(CockpitCollabMap)
    expect(w.findAll('line').length).toBeGreaterThan(0)
  })

  it('renders empty state when no task selected', () => {
    const w = mount(CockpitCollabMap)
    expect(w.find('.cockpit-map__empty').exists()).toBe(true)
  })
})
