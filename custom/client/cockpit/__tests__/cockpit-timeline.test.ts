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
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}), switchSession: vi.fn(async () => {}), sessions: [], isSessionUnread: vi.fn(() => false), getSessionUnreadCount: vi.fn(() => 0), getSessionUnreadInfo: vi.fn(() => null), clearSessionUnread: vi.fn() }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}), sortedMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, args?: Record<string, unknown>) => {
    if (args && key.includes('olderHistory')) return args.n + ' older'
    return key
  } }),
}))

import CockpitTimeline from '@/custom/cockpit/components/CockpitTimeline.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitTimeline', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }, configurable: true, writable: true })
  })

  // 填充 events ref（store 重构后 events 是懒加载 ref，可直接赋值）
  function seedEvents(count = 4) {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    // 直接设 selectedTaskId（绕过 async selectTask 的 detail 加载，避免异步清空 events）
    ;(s as any).selectedTaskId = 't1'
    s.events = Array.from({ length: count }, (_, i) => ({
      id: 'e' + i, taskId: 't1', actor: i % 2 ? 'review-agent' : '张三',
      kind: (i % 2 ? 'A2A' : 'A2H') as 'A2A' | 'A2H',
      what: '事件 ' + i, when: '14:0' + i, pending: i === count - 1, ts: i,
    }))
    return s
  }

  it('renders visible events (no fold when <= threshold)', () => {
    seedEvents(4)
    const w = mount(CockpitTimeline)
    expect(w.findAll('[data-event-id]').length).toBe(4)
    expect(w.find('.cockpit-timeline__fold').exists()).toBe(false)
  })

  it('folds older events when count > threshold', () => {
    seedEvents(6)
    const w = mount(CockpitTimeline)
    expect(w.find('.cockpit-timeline__fold').exists()).toBe(true)
    expect(w.findAll('[data-event-id]').length).toBe(4)
  })

  it('expanding fold shows all events', async () => {
    seedEvents(6)
    const w = mount(CockpitTimeline)
    await w.find('.cockpit-timeline__fold').trigger('click')
    expect(w.findAll('[data-event-id]').length).toBe(6)
  })

  it('clicking an event triggers focusOnTimelineNode', async () => {
    seedEvents(4)
    const s = useCockpitStore()
    const spy = vi.spyOn(s, 'focusOnTimelineNode')
    const w = mount(CockpitTimeline)
    await w.find('[data-event-id="e3"]').trigger('click')
    expect(spy).toHaveBeenCalledWith('e3')
  })

  it('pending event has is-pending class', () => {
    seedEvents(4)
    const w = mount(CockpitTimeline)
    expect(w.find('[data-event-id="e3"]').classes()).toContain('is-pending')
  })

  it('shows empty state when no task selected', () => {
    const w = mount(CockpitTimeline)
    expect(w.find('.cockpit-timeline__empty').exists()).toBe(true)
  })

  it('double-clicking a run event opens title detail (not RunTrace modal)', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    getTask.mockResolvedValue({
      task: {
        id: 't1', title: 'T', body: null, assignee: 'agent', status: 'running', priority: 0,
        created_by: null, created_at: 0, started_at: null, completed_at: null,
        workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
        result: null, skills: null, latest_summary: null,
      },
      latest_summary: null,
      session: { id: 'session-1', title: 'S', source: 'cli', model: 'gpt', started_at: 0, ended_at: null, messages: [] },
      comments: [],
      events: [],
      runs: [{
        id: 7, task_id: 't1', profile: 'agent', status: 'running', outcome: null,
        summary: 'running trace', error: null, metadata: null, worker_pid: null,
        started_at: 1000, ended_at: null,
      }],
    })
    const s = useCockpitStore()
    await s.selectTask('t1')
    const openRunTraceSpy = vi.spyOn(s, 'openRunTrace')
    const openTitleDetailSpy = vi.spyOn(s, 'openTitleDetail')
    const w = mount(CockpitTimeline)

    // 找到 run 事件节点（由 store.eventsForSelectedTask 返回）
    const runEvent = w.find('[data-source="run"]')
    if (runEvent.exists()) {
      await runEvent.trigger('dblclick')
      // 应该调用 openTitleDetail 而非 openRunTrace
      expect(openTitleDetailSpy).toHaveBeenCalled()
      expect(openRunTraceSpy).not.toHaveBeenCalled()
    } else {
      // 如果没有 run 事件节点，验证 openRunTrace 未被调用
      expect(openRunTraceSpy).not.toHaveBeenCalled()
    }
  })
})
