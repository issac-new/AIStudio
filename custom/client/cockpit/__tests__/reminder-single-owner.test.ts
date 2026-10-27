// @vitest-environment jsdom
// overlay/custom/client/cockpit/__tests__/reminder-single-owner.test.ts
// Task 5（2026-10-27 产品一致性）提醒与 overview 单正身守门：
//   ① 提醒调度唯一正身 = ia2 workspace store。cockpit 退役第二调度（timer +
//      checkReminders + fireReminder 整链）：bootstrap/openSchedule 不再装载旧
//      副本、不再每分钟扫描、不再整份回写 cockpit.userTodos——已删除待办不得
//      被 cockpit 旧副本写回复活；
//   ② overview 单次加载：useSharedArm 首拉（workspace.refreshAllBoards）与
//      cockpit.bootstrap 并发时收敛为一次 /kanban/overview，cockpit 就地采纳
//      workspace 数据（不再自拉聚合端点）；workspace 不可用时回落 cockpit
//      自聚合旧路径（既有契约不回退）。
// cockpit-kv 用真实模块 + 内存 localStorage：复活断言直接读持久层终态。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── kanban store 桩（形状对齐 cockpit-store.test.ts）──
const { mockKanbanTasks, fetchTasks, fetchAssignees, fetchBoards, setSelectedBoard, startEventStream, stopEventStream } = vi.hoisted(() => ({
  mockKanbanTasks: [] as any[],
  fetchTasks: vi.fn(async () => {}),
  fetchAssignees: vi.fn(async () => {}),
  fetchBoards: vi.fn(async () => {}),
  setSelectedBoard: vi.fn(),
  startEventStream: vi.fn(),
  stopEventStream: vi.fn(),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({
    tasks: mockKanbanTasks,
    boards: [{ slug: 'default', name: 'default', total: 0 }],
    fetchTasks, fetchAssignees, fetchBoards, setSelectedBoard, startEventStream, stopEventStream,
  }),
}))

// ── teams-adapter 桩：聚合端点开关（workspace 与 cockpit 同源模块）──
const { fetchKanbanOverview, listTeams } = vi.hoisted(() => ({
  fetchKanbanOverview: vi.fn(),
  listTeams: vi.fn(async () => []),
}))
vi.mock('@/custom/cockpit/adapters/teams-adapter', () => ({ fetchKanbanOverview, listTeams }))

// ── fleet-adapter 桩（cockpit fleet 流 + workspace 聚合流）──
const { connectFleetStream, connectOverviewStream } = vi.hoisted(() => ({
  connectFleetStream: vi.fn(() => ({ close: vi.fn() })),
  connectOverviewStream: vi.fn(() => ({ close: vi.fn() })),
}))
vi.mock('@/custom/cockpit/adapters/fleet-adapter', () => ({ connectFleetStream, connectOverviewStream }))

// ── workspace 外部 IO 桩（真实 workspace store 参跑：单拉/采纳断言需要）──
const { toCockpitTask, bucketPriority, listBoards, listTasks, getTask, getTaskLog, listAttachments } = vi.hoisted(() => ({
  toCockpitTask: vi.fn((t: any, board: string) => ({
    id: t.id, title: t.title ?? `t-${t.id}`, priority: 'P2' as const, status: t.status ?? 'todo',
    assignee: t.assignee ?? null, workspace: '', tenant: null, boardSlug: board, createdAt: 1000,
  })),
  bucketPriority: vi.fn(() => 'P2'),
  listBoards: vi.fn(async () => [] as any[]),
  listTasks: vi.fn(async () => [] as any[]),
  getTask: vi.fn(async () => null),
  getTaskLog: vi.fn(async () => ({ exists: false })),
  listAttachments: vi.fn(async () => []),
}))
vi.mock('@/custom/cockpit/adapters/task-adapter', () => ({ toCockpitTask, bucketPriority }))
vi.mock('@/api/hermes/kanban', () => ({ listBoards, listTasks, getTask, getTaskLog, listAttachments }))
vi.mock('@/custom/ia2/api/sim-observer', () => ({
  fetchSimObserverOverview: vi.fn(async () => ({ available: false })),
}))

// ── 其余依赖桩（cockpit-store.test.ts 同款收窄）──
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({
  searchSessions: vi.fn(async () => []),
  listWorkspaceFiles: vi.fn(async () => []),
  getTimeline: vi.fn(async () => ({ items: [], total: 0 })),
}))
vi.mock('@/api/studio/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/studio/sessions')
  return { ...actual, searchSessions: vi.fn(async () => []) }
})
vi.mock('@/api/hermes/mcp', () => ({ fetchMcpServers: vi.fn(async () => ({ ok: false, servers: [], error: 'mcp stub' })) }))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}),
    switchSession: vi.fn(async () => {}), sessions: [], unreadMessages: new Map(),
  }),
}))
vi.mock('@/stores/hermes/group-chat', () => ({
  useGroupChatStore: () => ({
    connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}),
    joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}),
    sortedMessages: [], rooms: [], lastMessageMap: {},
  }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [], roomList: [], sortedRooms: [], getRoomUnreadCount: vi.fn(() => 0) }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({
  useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }),
}))

import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useWorkspaceStore } from '@/custom/ia2/store/workspace'

// ── 内存 localStorage polyfill + Notification 构造探针（cockpit-kv 走真实模块）──
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
let savedLS: any
let savedNotification: any
const notificationCtor = vi.fn()
class FakeNotification {
  static permission = 'granted'
  static requestPermission = vi.fn(async () => 'granted')
  constructor(title: string, opts?: any) { notificationCtor(title, opts) }
}

const TODOS_KEY = 'cockpit.userTodos'
const readTodos = () => JSON.parse(globalThis.localStorage.getItem(TODOS_KEY) ?? '[]') as Array<Record<string, any>>
const seedTodos = (todos: Array<Record<string, any>>) => {
  globalThis.localStorage.setItem(TODOS_KEY, JSON.stringify(todos))
}

const overviewFixture = () => ({
  boards: [{ slug: 'swarm', name: 'Swarm', total: 1 }],
  tasks: [{
    id: 't1', title: '聚合任务', priority: 'P1', status: 'running', assignee: 'a',
    workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 1700000000000,
  }],
  rawTasks: [{ board: 'swarm', task: { id: 't1', status: 'running', priority: 1, created_at: 1700000000 } }],
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockKanbanTasks.splice(0, mockKanbanTasks.length)
  fetchTasks.mockClear(); fetchAssignees.mockClear(); fetchBoards.mockClear(); setSelectedBoard.mockClear()
  fetchKanbanOverview.mockReset()
  savedLS = (globalThis as any).localStorage
  Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true, writable: true })
  savedNotification = (globalThis as any).Notification
  ;(globalThis as any).Notification = FakeNotification
})
afterEach(() => {
  if (savedLS === undefined) delete (globalThis as any).localStorage
  else Object.defineProperty(globalThis, 'localStorage', { value: savedLS, configurable: true, writable: true })
  if (savedNotification === undefined) delete (globalThis as any).Notification
  else (globalThis as any).Notification = savedNotification
  vi.useRealTimers()
})

describe('Task 5 — 提醒单正身：cockpit 第二调度退役', () => {
  it('bootstrap 不装载旧副本、不启动调度：到期待办不触发系统通知、kv 不被整份回写', async () => {
    // 已过 remindAt 且触发标记缺失（重载恢复形态）——旧 cockpit 调度会立即补触发并回写
    seedTodos([{
      id: 'todo-due', date: '2026-10-27', title: '到期待办', createdAt: 1_760_000_000_000,
      remindAt: Date.now() - 60_000,
    }])
    fetchKanbanOverview.mockResolvedValue(overviewFixture())
    const s = useCockpitStore()
    await s.bootstrap()
    expect(notificationCtor, 'cockpit 不得触发提醒通知（workspace 是唯一调度）').not.toHaveBeenCalled()
    const before = readTodos()
    await s.openSchedule?.()
    expect(notificationCtor).not.toHaveBeenCalled()
    // kv 不被 cockpit 整份回写（旧副本 + reminded 标记均不落盘）
    expect(readTodos()).toEqual(before)
  })

  it('cockpit store 不再暴露提醒调度 API（源级退役，防再武装）', async () => {
    const s = useCockpitStore()
    expect((s as any).startReminderScheduler, '调度 API 必须整体退役').toBeUndefined()
    expect((s as any).stopReminderScheduler).toBeUndefined()
    const src = readFileSync(resolve(__dirname, '../store/cockpit.ts'), 'utf-8')
    expect(src.includes('startReminderScheduler'), 'cockpit 源内不得再定义第二调度').toBe(false)
  })

  it('旧副本不复活：workspace 删除待办后，cockpit 全程不回写 kv', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-27T12:00:00'))
    // remindAt=+20min：bootstrap 时尚未进 T-15 窗口（旧代码此刻只装载不触发）；
    // 推进 10 分钟后进入窗口——旧 cockpit 调度会对旧副本触发并整份回写，复活已删项
    const remindAt = new Date('2026-10-27T12:20:00').getTime()
    seedTodos([
      { id: 'todo-a', date: '2026-10-27', title: '将被删除', createdAt: 1_760_000_000_000, remindAt },
      { id: 'todo-b', date: '2026-10-27', title: '保留', createdAt: 1_760_000_000_001 },
    ])
    fetchKanbanOverview.mockResolvedValue(overviewFixture())
    const s = useCockpitStore()
    await s.bootstrap()
    const ws = useWorkspaceStore()
    ws.loadTodos()
    ws.removeUserTodo('todo-a') // 正身删除 → kv=[todo-b]
    await vi.advanceTimersByTimeAsync(600_000) // 12:10：进入 T-15 窗口 [12:05, 12:15)
    expect(readTodos().map(t => t.id), 'cockpit 不得以旧副本整份回写复活已删待办').toEqual(['todo-b'])
    vi.useRealTimers()
  })
})

describe('Task 5 — bootstrap 武装的单板事件流随壳回收（单正身：谁启动谁停止）', () => {
  it('bootstrap 连接 kanban 单板事件流；disconnectOnUnmount 停止（只启不停=整会话泄漏）', async () => {
    fetchKanbanOverview.mockResolvedValue(overviewFixture())
    const s = useCockpitStore()
    await s.bootstrap()
    expect(startEventStream, 'bootstrap 武装单板事件流').toHaveBeenCalledTimes(1)
    s.disconnectOnUnmount()
    // 旧实现 disconnectOnUnmount 不停流：离开 /app 后 WS 与重连退避定时器整会话常驻；
    // 看板视图自启的流由其 onUnmounted 自停（shared-lifecycle.test 锚定），此处锚定壳层武装面
    expect(stopEventStream, '壳层回收必须停止 bootstrap 武装的事件流').toHaveBeenCalledTimes(1)
    // 回收后重新进入：可重新 bootstrap 重新武装（_bootstrapped 复位守卫契约不回退）
    await s.bootstrap()
    expect(startEventStream).toHaveBeenCalledTimes(2)
  })
})

describe('Task 5 — overview 单次加载（workspace 为正身）', () => {
  it('armShared 首拉与 cockpit.bootstrap 并发：/kanban/overview 只请求一次，cockpit 采纳 workspace 数据', async () => {
    fetchKanbanOverview.mockResolvedValue(overviewFixture())
    const ws = useWorkspaceStore()
    void ws.refreshAllBoards() // useSharedArm.armShared 的首拉（在途）
    const s = useCockpitStore()
    await s.bootstrap() // 旧实现：loadAllBoards → 自拉聚合端点（第二个请求）
    expect(fetchKanbanOverview, '首屏聚合只允许一次请求（在途去重/就地采纳）').toHaveBeenCalledTimes(1)
    expect(s.tasks.map(t => t.id)).toEqual(['t1'])
    expect(s.boards.map(b => b.slug)).toEqual(['swarm'])
    expect(s.selectedTaskId, '自动选中首任务契约保留').toBe('t1')
    expect(fetchTasks, '采纳 workspace 数据时不得回落 N+1').not.toHaveBeenCalled()
  })

  it('workspace 不可用回落 cockpit 自聚合旧路径（既有契约不回退）', async () => {
    fetchKanbanOverview.mockRejectedValue(new Error('aggregate down'))
    listBoards.mockRejectedValue(new Error('rest down'))
    mockKanbanTasks.push({
      id: 'k1', title: 'K1', body: null, assignee: 'alice', status: 'todo',
      priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
      workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
      result: null, skills: null, latest_summary: null,
    })
    const s = useCockpitStore()
    await s.bootstrap()
    expect(fetchTasks, '回落路径必须走 N+1 保底').toHaveBeenCalled()
    expect(s.tasks.map(t => t.id)).toEqual(['k1'])
    // 回落形态（生产不出现——workspace 武装时成功路径单拉）：workspace 一次 +
    // cockpit 自聚合旧路径重试一次后转 N+1；不得比旧实现更多
    expect(fetchKanbanOverview).toHaveBeenCalledTimes(2)
  })
})
