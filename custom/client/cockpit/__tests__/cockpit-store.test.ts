// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ── mock kanban store ──
const { mockKanbanTasks, fetchTasks, fetchAssignees, startEventStream, fetchBoards, setSelectedBoard } = vi.hoisted(() => ({
  mockKanbanTasks: [] as any[],
  fetchTasks: vi.fn(async () => {}),
  fetchAssignees: vi.fn(async () => {}),
  startEventStream: vi.fn(),
  fetchBoards: vi.fn(async () => {}),
  setSelectedBoard: vi.fn(),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({
    tasks: mockKanbanTasks,
    boards: [{ slug: 'default', name: 'default', total: 0 }],
    fetchTasks, fetchAssignees, startEventStream, fetchBoards, setSelectedBoard,
  }),
}))

// ── mock kanban-extras ──
const { searchSessions, listWorkspaceFiles, getTimeline } = vi.hoisted(() => ({
  searchSessions: vi.fn(async () => []),
  listWorkspaceFiles: vi.fn(async () => []),
  getTimeline: vi.fn(async () => ({ items: [], total: 0 })),
}))
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({
  searchSessions, listWorkspaceFiles, getTimeline,
}))

// ── mock kanban api（保留类型导出）──
const { getTask, addComment } = vi.hoisted(() => ({
  getTask: vi.fn(async () => null),
  addComment: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, getTask, addComment }
})

// ── mock hermes sessions API（runSearch 需要）──
const { mockSearchHermesSessions } = vi.hoisted(() => ({
  mockSearchHermesSessions: vi.fn(async (_q: string) => []),
}))
vi.mock('@/api/hermes/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/sessions')
  return { ...actual, searchSessions: mockSearchHermesSessions }
})

// ── mock 聊天 store（bootstrap 会调）──
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    loadSessions: vi.fn(async () => {}),
    messages: [],
    sendMessage: vi.fn(async () => {}),
    switchSession: vi.fn(async () => {}),
  }),
}))
vi.mock('@/stores/hermes/group-chat', () => ({
  useGroupChatStore: () => ({
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    loadRooms: vi.fn(async () => {}),
    joinRoom: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    sortedMessages: [],
  }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [], roomList: [] }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({
  useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }),
}))

import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

// 内存 localStorage polyfill（vitest 3.x jsdom 默认 stub localStorage）
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
let savedLS: any
beforeEach(() => {
  setActivePinia(createPinia())
  mockKanbanTasks.splice(0, mockKanbanTasks.length)
  fetchTasks.mockClear(); fetchAssignees.mockClear(); startEventStream.mockClear()
  searchSessions.mockClear(); listWorkspaceFiles.mockClear(); getTimeline.mockClear()
  getTask.mockClear(); addComment.mockClear()
  mockSearchHermesSessions.mockClear()
  mockSearchHermesSessions.mockResolvedValue([])
  savedLS = (globalThis as any).localStorage
  Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true, writable: true })
})
afterEach(() => {
  if (savedLS === undefined) delete (globalThis as any).localStorage
  else (globalThis as any).localStorage = savedLS
})

// 构造一个最小 KanbanTask
const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('cockpit store bootstrap + 派生态', () => {
  it('bootstrap pulls kanban tasks and selects first', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: 'T1', priority: 3 }))
    const s = useCockpitStore()
    await s.bootstrap()
    expect(fetchTasks).toHaveBeenCalled()
    expect(s.selectedTaskId).toBe('t1')
    expect(s.tasks[0].priority).toBe('P0')
    expect(s.tasks[0].title).toBe('T1')
  })

  it('tasks is derived (computed) — not directly assignable', async () => {
    const s = useCockpitStore()
    mockKanbanTasks.push(kt({ id: 'x1' }))
    expect(s.tasks.map(t => t.id)).toEqual(['x1'])
    // computed 在 store 上是只读：直接赋值不会改变派生值（Vue 仅 warn 不抛错）
    ;(s as any).tasks = []
    expect(s.tasks.map(t => t.id)).toEqual(['x1']) // 仍是派生值
  })

  it('attention derived from status (blocked→high, review→medium)', async () => {
    mockKanbanTasks.push(
      kt({ id: 'b1', title: '阻塞', status: 'blocked' }),
      kt({ id: 'r1', title: '评审', status: 'review' }),
      kt({ id: 'o1', title: '其他', status: 'todo' }),
    )
    const s = useCockpitStore()
    expect(s.attention).toHaveLength(2)
    expect(s.attentionCount).toBe(2)
    expect(s.attention.find(a => a.taskId === 'b1')!.severity).toBe('high')
    expect(s.attention.find(a => a.taskId === 'r1')!.severity).toBe('medium')
  })

  it('sortedTasks orders P0 before P1 before P2 before P3', async () => {
    mockKanbanTasks.push(
      kt({ id: 'p2', priority: 1 }),
      kt({ id: 'p0', priority: 5 }),
      kt({ id: 'p1', priority: 2 }),
    )
    const s = useCockpitStore()
    expect(s.sortedTasks.map(t => t.id)).toEqual(['p0', 'p1', 'p2'])
  })

  it('taskGroups: null tenant grouped by boardSlug, valued tenant by tenant', async () => {
    mockKanbanTasks.push(
      kt({ id: 't1', tenant: 'team-x' }),
      kt({ id: 't2', tenant: null }),
      kt({ id: 't3', tenant: null }),
    )
    const s = useCockpitStore()
    const groups = s.taskGroups
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('team-x')
    expect(groups[0].tasks.map(t => t.id)).toEqual(['t1'])
    expect(groups[1].label).toBe('default')
    expect(groups[1].tasks.map(t => t.id)).toEqual(['t2', 't3'])
  })

  it('null tenant tasks are not filtered out by tenant chip', async () => {
    mockKanbanTasks.push(
      kt({ id: 'a', tenant: 'x' }),
      kt({ id: 'b', tenant: null }),
    )
    const s = useCockpitStore()
    expect(s.filteredTasks.map(t => t.id)).toEqual(['a', 'b'])
    s.toggleFilter('tenants', 'x')
    // b has null tenant, should still pass the tenant filter
    expect(s.filteredTasks.map(t => t.id).sort()).toEqual(['a', 'b'])
  })

  it('filteredTasks respects priority filter', async () => {
    mockKanbanTasks.push(kt({ id: 'a', priority: 3 }), kt({ id: 'b', priority: 0 }))
    const s = useCockpitStore()
    s.toggleFilter('priorities', 'P0')
    expect(s.filteredTasks.map(t => t.id)).toEqual(['a'])
  })

  it('filteredTasks respects status bucket filter', async () => {
    mockKanbanTasks.push(kt({ id: 'a', status: 'blocked' }), kt({ id: 'b', status: 'todo' }))
    const s = useCockpitStore()
    s.toggleFilter('statuses', 'blocked')
    expect(s.filteredTasks.map(t => t.id)).toEqual(['a'])
  })

  it('filteredTasks respects tenant filter', async () => {
    mockKanbanTasks.push(kt({ id: 'a', tenant: 'x' }), kt({ id: 'b', tenant: 'y' }))
    const s = useCockpitStore()
    s.toggleFilter('tenants', 'x')
    expect(s.filteredTasks.map(t => t.id)).toEqual(['a'])
  })

  it('toggleFilter toggles value off', async () => {
    mockKanbanTasks.push(kt({ id: 'a', priority: 3 }), kt({ id: 'b', priority: 0 }))
    const s = useCockpitStore()
    s.toggleFilter('priorities', 'P0')
    expect(s.filteredTasks.map(t => t.id)).toEqual(['a'])
    s.toggleFilter('priorities', 'P0')
    expect(s.filteredTasks.map(t => t.id).sort()).toEqual(['a', 'b'])
  })
})

describe('cockpit store selectTask + 联动加载', () => {
  it('selectTask loads detail (events) + fileTree', async () => {
    mockKanbanTasks.push(kt({ id: 't1', assignee: 'arch' }))
    const s = useCockpitStore()
    await s.bootstrap()
    expect(getTask).toHaveBeenCalledWith('t1', expect.objectContaining({ board: expect.any(String) }))
    expect(listWorkspaceFiles).toHaveBeenCalledWith('t1', expect.any(String))
  })

  it('selectTask null clears events', async () => {
    const s = useCockpitStore()
    await s.selectTask(null)
    expect(s.events).toEqual([])
  })

  it('selectTask sets selectedTaskId + selectedTask derived', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: 'Hello' }))
    const s = useCockpitStore()
    await s.bootstrap()
    expect(s.selectedTaskId).toBe('t1')
    expect(s.selectedTask?.title).toBe('Hello')
  })
})

describe('cockpit store 工作项 localStorage 草稿', () => {
  it('updateWorkItem writes localStorage; workItemForSelectedTask reads back', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.updateWorkItem({ decision: 'reject', opinion: '不行' })
    expect(s.workItemForSelectedTask?.decision).toBe('reject')
    expect(s.workItemForSelectedTask?.opinion).toBe('不行')
  })

  it('toggleRiskTag adds then removes', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.updateWorkItem({ riskTags: ['concurrency'] })
    s.toggleRiskTag('test-gap')
    expect(s.workItemForSelectedTask?.riskTags).toContain('test-gap')
    s.toggleRiskTag('concurrency')
    expect(s.workItemForSelectedTask?.riskTags).not.toContain('concurrency')
  })

  it('submitWorkItem posts comment + clears draft', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.updateWorkItem({ decision: 'approve', riskTags: ['x'], opinion: '好' })
    await s.submitWorkItem()
    expect(addComment).toHaveBeenCalledWith('t1', { body: expect.stringContaining('[决策:approve]') })
    expect(s.workItemForSelectedTask).toBeNull()
  })
})

describe('cockpit store 频道（parseTenant 派生）', () => {
  it('channel derived from tenant matrix:...', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:s.ms:Auth联调' }))
    const s = useCockpitStore()
    await s.bootstrap()
    expect(s.channelsForSelectedTask).toHaveLength(1)
    expect(s.channelsForSelectedTask[0].kind).toBe('matrix')
    expect(s.channelsForSelectedTask[0].label).toBe('Auth联调')
  })

  it('plain tenant → no channel', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'platform-team' }))
    const s = useCockpitStore()
    await s.bootstrap()
    expect(s.channelsForSelectedTask).toEqual([])
  })

  it('selectChannel switches workspace mode to chat', async () => {
    mockKanbanTasks.push(kt({ id: 't1', tenant: 'matrix:!r:m:X' }))
    const s = useCockpitStore()
    await s.bootstrap()
    const chId = s.channelsForSelectedTask[0].id
    s.selectChannel(chId)
    expect(s.activeChannelId).toBe(chId)
    expect(s.workspaceMode).toBe('chat')
  })
})

describe('cockpit store 协作图（topology）', () => {
  it('topologyForSelectedTask has center node focused', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: '中心' }))
    const s = useCockpitStore()
    await s.bootstrap()
    const center = s.topologyForSelectedTask.nodes.find(n => n.kind === 'center')
    expect(center?.label).toBe('中心')
    expect(center?.focus).toBe(true)
  })
})

describe('cockpit store 终端 + 历史 + 模板（客户端态）', () => {
  it('terminal lifecycle', async () => {
    const s = useCockpitStore()
    const before = s.terminalLines.length
    expect(s.terminalMode).toBe(false)
    s.enterTerminal()
    expect(s.terminalMode).toBe(true)
    expect(s.workspaceMode).toBe('term')
    s.sendTerminalCommand('ls')
    expect(s.terminalLines.length).toBe(before + 2)
    s.exitTerminal()
    expect(s.terminalMode).toBe(false)
    expect(s.workspaceMode).toBe('work')
  })

  it('history filter by action', async () => {
    const s = useCockpitStore()
    // 直接设置 history ref（仍是本地 ref，可赋值）
    s.history = [
      { id: 'h1', when: '今', taskId: 't1', action: '审批', title: 'a', archived: false },
      { id: 'h2', when: '今', taskId: 't1', action: '决策', title: 'b', archived: false },
    ]
    s.historyFilters = { actions: ['审批'], archived: 'all' }
    expect(s.filteredHistory.map(h => h.id)).toEqual(['h1'])
  })

  it('history filter archived-only', async () => {
    const s = useCockpitStore()
    s.history = [
      { id: 'h1', when: '今', taskId: 't1', action: '审批', title: 'a', archived: false },
      { id: 'h2', when: '今', taskId: 't1', action: '审批', title: 'b', archived: true },
    ]
    s.historyFilters = { actions: [], archived: 'only' }
    expect(s.filteredHistory.map(h => h.id)).toEqual(['h2'])
  })

  it('templates CRUD via localStorage', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.updateWorkItem({ decision: 'conditional', riskTags: ['x'], opinion: 'y', modifiedFiles: ['a.ts'] })
    expect(s.templates).toEqual([])
    s.saveTemplateFromCurrentWorkItem('我的模板')
    expect(s.templates).toHaveLength(1)
    expect(s.templates[0].name).toBe('我的模板')
    s.deleteTemplate(s.templates[0].id)
    expect(s.templates).toEqual([])
  })

  it('recallHistoryItem sets archived mode + selects task', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.history = [{ id: 'h1', when: '昨', taskId: 't1', action: '审批', title: 'x', archived: true }]
    s.recallHistoryItem('h1')
    expect(s.archivedMode).toBe(true)
    expect(s.selectedTaskId).toBe('t1')
  })
})

describe('cockpit store 折叠 + 最大化', () => {
  it('toggleCollapsed', async () => {
    const s = useCockpitStore()
    expect(s.collapsed.left).toBe(false)
    s.toggleCollapsed('left')
    expect(s.collapsed.left).toBe(true)
  })

  it('toggleMaximized(col) toggles per-column maximized (exclusive)', async () => {
    const s = useCockpitStore()
    expect(s.maximized.mid).toBe(false)
    s.toggleMaximized('mid')
    expect(s.maximized.mid).toBe(true)
    expect(s.maximized.left).toBe(false)
    // 最大化另一栏时，前栏取消
    s.toggleMaximized('left')
    expect(s.maximized.left).toBe(true)
    expect(s.maximized.mid).toBe(false)
    // 再点同一栏取消
    s.toggleMaximized('left')
    expect(s.maximized.left).toBe(false)
  })
})
