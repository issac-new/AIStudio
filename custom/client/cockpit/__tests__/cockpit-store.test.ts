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
const { getTask, addComment, patchTask } = vi.hoisted(() => ({
  getTask: vi.fn(async () => null),
  addComment: vi.fn(async () => ({ ok: true })),
  patchTask: vi.fn(async () => ({})),
}))
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, getTask, addComment, patchTask }
})

// ── mock hermes sessions API（runSearch 需要）──
const { mockSearchHermesSessions } = vi.hoisted(() => ({
  mockSearchHermesSessions: vi.fn(async (_q: string) => []),
}))
vi.mock('@/api/hermes/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/sessions')
  return { ...actual, searchSessions: mockSearchHermesSessions }
})

// ── mock 聊天 store（bootstrap 会调 + notify 聚合）──
const { mockChatSessions, isSessionUnread, getSessionUnreadCount, getSessionUnreadInfo, clearSessionUnread, isSessionCompletedUnread, clearSessionCompletedUnread } = vi.hoisted(() => ({
  mockChatSessions: [] as any[],
  isSessionUnread: vi.fn(() => false),
  getSessionUnreadCount: vi.fn(() => 0),
  getSessionUnreadInfo: vi.fn(() => null),
  clearSessionUnread: vi.fn(),
  isSessionCompletedUnread: vi.fn(() => false),
  clearSessionCompletedUnread: vi.fn(),
}))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    loadSessions: vi.fn(async () => {}),
    messages: [],
    sendMessage: vi.fn(async () => {}),
    switchSession: vi.fn(async () => {}),
    sessions: mockChatSessions,
    isSessionUnread,
    getSessionUnreadCount,
    getSessionUnreadInfo,
    clearSessionUnread,
    isSessionCompletedUnread,
    clearSessionCompletedUnread,
  }),
}))
const { mockGroupRooms, groupGetRoomUnread, groupClearRoomUnread, groupClearAllUnread, groupLastMessageMap } = vi.hoisted(() => ({
  mockGroupRooms: [] as any[],
  groupGetRoomUnread: vi.fn(() => 0),
  groupClearRoomUnread: vi.fn(),
  groupClearAllUnread: vi.fn(),
  groupLastMessageMap: {} as Record<string, any>,
}))
vi.mock('@/stores/hermes/group-chat', () => ({
  useGroupChatStore: () => ({
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    loadRooms: vi.fn(async () => {}),
    joinRoom: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    sortedMessages: [],
    rooms: mockGroupRooms,
    getRoomUnread: groupGetRoomUnread,
    clearRoomUnread: groupClearRoomUnread,
    clearAllUnread: groupClearAllUnread,
    lastMessageMap: groupLastMessageMap,
  }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }),
}))
const { mockSortedRooms, matrixGetRoomUnreadCount } = vi.hoisted(() => ({
  mockSortedRooms: [] as any[],
  matrixGetRoomUnreadCount: vi.fn(() => 0),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [], roomList: [], sortedRooms: mockSortedRooms, getRoomUnreadCount: matrixGetRoomUnreadCount }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({
  useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }),
}))

import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { saveUserTodos } from '@/custom/cockpit/store/cockpit-kv'

// 内存 localStorage polyfill（vitest 3.x jsdom 默认 stub localStorage）
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
let savedLS: any
let savedNotification: any
beforeEach(() => {
  setActivePinia(createPinia())
  mockKanbanTasks.splice(0, mockKanbanTasks.length)
  fetchTasks.mockClear(); fetchAssignees.mockClear(); startEventStream.mockClear()
  searchSessions.mockClear(); listWorkspaceFiles.mockClear(); getTimeline.mockClear()
  getTask.mockClear(); addComment.mockClear(); patchTask.mockClear()
  mockSearchHermesSessions.mockClear()
  mockSearchHermesSessions.mockResolvedValue([])
  savedLS = (globalThis as any).localStorage
  Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true, writable: true })
  // Notification 在 jsdom 不存在，注入 mock 供闹钟调度使用
  savedNotification = (globalThis as any).Notification
  ;(globalThis as any).Notification = class {
    static permission = 'granted'
    static requestPermission = vi.fn(async () => 'granted')
    constructor(_title: string, _opts?: any) {}
  }
})
afterEach(() => {
  if (savedLS === undefined) delete (globalThis as any).localStorage
  else (globalThis as any).localStorage = savedLS
  if (savedNotification === undefined) delete (globalThis as any).Notification
  else (globalThis as any).Notification = savedNotification
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
    expect(addComment).toHaveBeenCalledWith('t1', { body: expect.stringContaining('[决策:approve]') }, expect.anything())
    expect(s.workItemForSelectedTask).toBeNull()
  })

  it('autoSaveDraft bumps kv rev to persist current draft', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.updateWorkItem({ decision: 'approve', opinion: 'looks good' })
    s.autoSaveDraft()
    // selectTask re-loads draft from localStorage before switching
    await s.selectTask(null)
    await s.selectTask('t1')
    expect(s.workItemForSelectedTask?.decision).toBe('approve')
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
    s.history = [
      { id: 'h1', when: '今', taskId: 't1', action: '审批', title: 'a', archived: false, source: 'event' } as any,
      { id: 'h2', when: '今', taskId: 't1', action: '决策', title: 'b', archived: false, source: 'event' } as any,
    ]
    s.toggleHistoryAction('审批')
    expect(s.filteredHistory.map(h => h.id)).toEqual(['h1'])
  })

  it('history filter archived-only', async () => {
    const s = useCockpitStore()
    s.history = [
      { id: 'h1', when: '今', taskId: 't1', action: '审批', title: 'a', archived: false, source: 'event' } as any,
      { id: 'h2', when: '今', taskId: 't1', action: '审批', title: 'b', archived: true, source: 'event' } as any,
    ]
    s.toggleHistoryStatus('active')
    s.toggleHistoryStatus('done')
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

describe('cockpit store 注意力筛选', () => {
  it('focusOnTaskFromAttention sets _attentionTaskIds with task itself', async () => {
    mockKanbanTasks.push(kt({ id: 't1', status: 'blocked' }))
    const s = useCockpitStore()
    await s.bootstrap()
    // 先清除默认的 dateRange 筛选，让所有任务可见
    s.clearDateRangeFilter()
    expect(s.attentionActive).toBe(false)
    await s.focusOnTaskFromAttention('t1', '阻塞任务')
    expect(s.attentionActive).toBe(true)
    expect(s._attentionTaskIds).toContain('t1')
  })

  it('focusOnTaskFromAttention filters filteredTasks to related tasks only', async () => {
    mockKanbanTasks.push(
      kt({ id: 't1', title: '阻塞任务', status: 'blocked' }),
      kt({ id: 't2', title: '其他任务', status: 'todo' }),
    )
    const s = useCockpitStore()
    await s.bootstrap()
    s.clearDateRangeFilter()
    expect(s.filteredTasks.map(t => t.id).sort()).toEqual(['t1', 't2'])
    await s.focusOnTaskFromAttention('t1')
    const ids = s.filteredTasks.map(t => t.id)
    expect(ids).toContain('t1')
    // 非关联任务（t2 没有 parents/children 关联）不应出现
    expect(ids).not.toContain('t2')
    expect(s.filteredTasks.length).toBeGreaterThanOrEqual(1)
  })

  it('re-clicking the same attention item toggles filter off', async () => {
    mockKanbanTasks.push(kt({ id: 't1', status: 'blocked' }))
    const s = useCockpitStore()
    await s.bootstrap()
    await s.focusOnTaskFromAttention('t1')
    expect(s.attentionActive).toBe(true)
    // 再次点击同一任务
    await s.focusOnTaskFromAttention('t1')
    expect(s.attentionActive).toBe(false)
    expect(s._attentionTaskIds).toEqual([])
  })

  it('clearAttentionFilter resets attention filter', async () => {
    mockKanbanTasks.push(kt({ id: 't1', status: 'blocked' }))
    const s = useCockpitStore()
    await s.bootstrap()
    await s.focusOnTaskFromAttention('t1')
    expect(s.attentionActive).toBe(true)
    s.clearAttentionFilter()
    expect(s.attentionActive).toBe(false)
  })

  it('attention filter ANDs with existing filters', async () => {
    mockKanbanTasks.push(
      kt({ id: 't1', title: 'P0阻塞', status: 'blocked', priority: 3 }),
      kt({ id: 't2', title: 'P1阻塞', status: 'blocked', priority: 1 }),
    )
    const s = useCockpitStore()
    await s.bootstrap()
    s.clearDateRangeFilter()
    await s.focusOnTaskFromAttention('t1')
    // 注意力筛选后只有 t1（t2 无关联）
    expect(s.filteredTasks.map(t => t.id)).toEqual(['t1'])
    // 加上优先级筛选 P0
    s.toggleFilter('priorities', 'P0')
    expect(s.filteredTasks.map(t => t.id)).toEqual(['t1'])
    // 切换优先级为 P1 → 交集为空
    s.toggleFilter('priorities', 'P0')
    s.toggleFilter('priorities', 'P1')
    expect(s.filteredTasks.map(t => t.id)).toEqual([])
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

describe('notify (Matrix unread only)', () => {
  beforeEach(() => {
    mockSortedRooms.splice(0, mockSortedRooms.length)
    matrixGetRoomUnreadCount.mockReturnValue(0)
  })

  it('聚合 matrix 未读 → notifyItems 按 ts 降序', () => {
    mockSortedRooms.push({
      roomId: '!m2:sv', name: 'Room2', timeline: [
        { getType: () => 'm.room.message', getContent: () => ({ body: 'later' }), getTs: () => 2000000000000, getSender: () => '@b:sv' },
      ],
    }, {
      roomId: '!m1:sv', name: 'Room1', timeline: [
        { getType: () => 'm.room.message', getContent: () => ({ body: 'hi' }), getTs: () => 3000000000000, getSender: () => '@a:sv' },
      ],
    })
    matrixGetRoomUnreadCount.mockReturnValue(2)

    const store = useCockpitStore()
    // ts 降序：3000 > 2000
    expect(store.notifyItems.map(i => i.id)).toEqual(['matrix:!m1:sv', 'matrix:!m2:sv'])
    expect(store.notifyCount).toBe(4) // 2 + 2
  })

  it('unread=0 的房间不计入', () => {
    mockSortedRooms.push({ roomId: '!m:sv', name: 'M', timeline: [] })
    matrixGetRoomUnreadCount.mockReturnValue(0)
    const store = useCockpitStore()
    expect(store.notifyItems).toHaveLength(0)
    expect(store.notifyCount).toBe(0)
  })

  it('openNotify/closeNotify 开关', () => {
    const store = useCockpitStore()
    expect(store.notifyOpen).toBe(false)
    store.openNotify()
    expect(store.notifyOpen).toBe(true)
    store.closeNotify()
    expect(store.notifyOpen).toBe(false)
  })
})

describe('cockpit store 工作项标题/评论草稿', () => {
  it('setPendingTitle writes pendingTitle; currentTitle reads draft over task', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: '原标题' }))
    const s = useCockpitStore()
    await s.bootstrap()
    expect(s.currentTitle).toBe('原标题')
    s.setPendingTitle('新标题')
    expect(s.currentTitle).toBe('新标题')
    expect(s.workItemForSelectedTask?.pendingTitle).toBe('新标题')
  })

  it('setPendingComment writes pendingComment', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.setPendingComment('我的评论')
    expect(s.workItemForSelectedTask?.pendingComment).toBe('我的评论')
  })

  it('submitWorkItem flushes title via patchTask + user comment via addComment', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: '原标题' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.setPendingTitle('改后标题')
    s.setPendingComment('用户自由评论')
    s.updateWorkItem({ decision: 'approve', riskTags: [], opinion: 'ok' })
    await s.submitWorkItem()
    expect(patchTask).toHaveBeenCalledWith('t1', expect.objectContaining({ title: '改后标题' }), expect.anything())
    const calls = addComment.mock.calls
    expect(calls.length).toBe(2)
    expect(calls[1][1]).toEqual({ body: '用户自由评论' })
    expect(s.workItemForSelectedTask).toBeNull()
  })

  it('submitWorkItem omits title patch when pendingTitle equals task title', async () => {
    mockKanbanTasks.push(kt({ id: 't1', title: '原标题' }))
    const s = useCockpitStore()
    await s.bootstrap()
    s.setPendingTitle('原标题')
    s.updateWorkItem({ decision: 'approve', riskTags: [], opinion: 'ok' })
    await s.submitWorkItem()
    expect(patchTask).not.toHaveBeenCalled()
  })
})

describe('cockpit store 待办闹钟提醒', () => {
  it('addUserTodo 接受 remindAt 并持久化', () => {
    const s = useCockpitStore()
    s.openSchedule()
    // remindAt = now + 20min，落在两个提醒窗口之外（now < t-15），不触发
    const remindAt = Date.now() + 20 * 60 * 1000
    s.addUserTodo('2026-06-25', '提醒待办', undefined, remindAt)
    const todo = s.userTodos.find(t => t.title === '提醒待办')
    expect(todo).toBeTruthy()
    expect(todo!.remindAt).toBe(remindAt)
    expect(todo!.reminded15).toBeUndefined()
  })

  it('addUserTodo 忽略过去的 remindAt（不设提醒）', () => {
    const s = useCockpitStore()
    s.openSchedule()
    s.addUserTodo('2026-06-25', '过期', undefined, Date.now() - 1000)
    const todo = s.userTodos.find(t => t.title === '过期')!
    expect(todo.remindAt).toBeUndefined()
  })

  it('T-15 窗口触发提醒并写入通知面板', () => {
    const s = useCockpitStore()
    s.openSchedule()
    // remindAt = now + 10min → 落在 T-15 窗口 [t-15, t-5) 内
    const remindAt = Date.now() + 10 * 60 * 1000
    s.addUserTodo('2026-06-25', '即将开始', undefined, remindAt)
    // addUserTodo 内部已调用 checkReminders，应触发 T-15
    const todo = s.userTodos.find(t => t.title === '即将开始')!
    expect(todo.reminded15).toBe(true)
    // 通知面板应出现一条 reminder 项
    const reminderItem = s.notifyItems.find(n => n.kind === 'reminder')
    expect(reminderItem).toBeTruthy()
    expect(reminderItem!.id).toContain(':15')
  })

  it('removeUserTodo 同步移除其提醒通知', () => {
    const s = useCockpitStore()
    s.openSchedule()
    const remindAt = Date.now() + 10 * 60 * 1000
    s.addUserTodo('2026-06-25', '待删提醒', undefined, remindAt)
    const todo = s.userTodos.find(t => t.title === '待删提醒')!
    expect(s.notifyItems.some(n => n.kind === 'reminder')).toBe(true)
    s.removeUserTodo(todo.id)
    expect(s.userTodos.find(t => t.id === todo.id)).toBeUndefined()
    expect(s.notifyItems.some(n => n.id.startsWith(`reminder:${todo.id}:`))).toBe(false)
  })

  it('重载恢复：已过 remindAt 但标记缺失时补触发', () => {
    // 模拟重载：直接写一个过期且未触发的待办到 localStorage
    saveUserTodos([{
      id: 'todo-stale', date: '2026-06-25', title: '遗留待办', createdAt: Date.now() - 3600_000,
      remindAt: Date.now() - 600_000, reminded15: false, reminded5: false,
    }])
    const s = useCockpitStore()
    s.openSchedule()   // 加载 todos + checkReminders
    const todo = s.userTodos.find(t => t.id === 'todo-stale')!
    expect(todo.reminded15).toBe(true)
    expect(todo.reminded5).toBe(true)
  })
})


describe('cockpit store run trace modal', () => {
  it('opens and closes the run trace modal with session and run references', () => {
    const s = useCockpitStore()
    s.openRunTrace({ taskId: 'task-1', sessionId: 'session-1', runId: 'run-1' })

    expect(s.runTraceOpen).toBe(true)
    expect(s.runTraceTaskId).toBe('task-1')
    expect(s.runTraceSessionId).toBe('session-1')
    expect(s.runTraceRunId).toBe('run-1')

    s.closeRunTrace()
    expect(s.runTraceOpen).toBe(false)
    expect(s.runTraceTaskId).toBe('task-1')
    expect(s.runTraceSessionId).toBe('session-1')
    expect(s.runTraceRunId).toBe('run-1')
  })
})
