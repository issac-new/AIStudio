// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { mockKanbanTasks, fetchTasks } = vi.hoisted(() => ({
  mockKanbanTasks: [] as any[],
  fetchTasks: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({
    tasks: mockKanbanTasks,
    boards: [{ slug: 'default', name: 'default', total: 0 }],
    fetchTasks, fetchAssignees: vi.fn(async () => {}),
    startEventStream: vi.fn(),
    fetchBoards: vi.fn(async () => {}),
    setSelectedBoard: vi.fn(),
  }),
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
// mock mermaid（避免 jsdom 下真实渲染）
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg class="mock-mermaid"></svg>' })),
  },
}))

import CockpitCollabMap from '@/custom/cockpit/components/CockpitCollabMap.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitCollabMap (mermaid)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    getTask.mockClear()
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }, configurable: true, writable: true })
  })

  async function seed() {
    mockKanbanTasks.push(
      kt({ id: 't1', title: '中心任务', tenant: 'matrix:!r:m:Auth联调' }),
      kt({ id: 'p1', title: '父任务' }),
      kt({ id: 'c1', title: '子任务1' }),
    )
    getTask.mockResolvedValue({
      task: { id: 't1', title: '中心任务', body: null, assignee: 'alice', status: 'todo', priority: 0, created_by: 'bob', created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: '~/ws', tenant: 'matrix:!r:m:Auth联调', project_id: null, result: null, skills: null },
      latest_summary: null, comments: [], events: [], runs: [],
      parents: ['p1'], children: ['c1'],
    })
    const s = useCockpitStore()
    await s.bootstrap()
    return s
  }

  it('renders canvas container when task selected', async () => {
    await seed()
    const w = mount(CockpitCollabMap)
    expect(w.find('.cockpit-map__canvas').exists()).toBe(true)
  })

  it('store topology has center + ancestor + descendant + person + channel', async () => {
    const s = await seed()
    const topo = s.topologyForSelectedTask
    const kinds = topo.nodes.map(n => n.kind)
    expect(kinds).toContain('center')
    expect(kinds).toContain('ancestor')
    expect(kinds).toContain('descendant')
    expect(kinds).toContain('person')
    expect(kinds).toContain('channel')
    expect(topo.relations.length).toBeGreaterThan(0)
  })

  it('center node label is the task title', async () => {
    const s = await seed()
    const center = s.topologyForSelectedTask.nodes.find(n => n.kind === 'center')
    expect(center?.label).toBe('中心任务')
    expect(center?.focus).toBe(true)
  })

  it('ancestor node target.taskId set', async () => {
    const s = await seed()
    const ancestor = s.topologyForSelectedTask.nodes.find(n => n.kind === 'ancestor')
    expect(ancestor?.target?.taskId).toBe('p1')
  })

  it('renders empty state when no task', () => {
    const w = mount(CockpitCollabMap)
    expect(w.find('.cockpit-map__empty').exists()).toBe(true)
  })

  it('channel node links to current task', async () => {
    const s = await seed()
    const ch = s.topologyForSelectedTask.nodes.find(n => n.kind === 'channel')
    expect(ch?.taskId).toBe('t1')
    expect(s.channelsForSelectedTask.length).toBeGreaterThan(0)
  })

  it('mermaid render called on task selection', async () => {
    await seed()
    const mermaid = (await import('mermaid')).default
    const w = mount(CockpitCollabMap)
    await new Promise(r => setTimeout(r, 50))  // 等 watch + async render
    expect(mermaid.render).toHaveBeenCalled()
    w.unmount()
  })
})
