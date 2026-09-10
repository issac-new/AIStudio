// overlay/custom/client/ia2/__tests__/workspace-store.test.ts
// P3 Task 8 — store 拆分：ia2 消费面独立模块（workspace store）。
// cockpit store 退役后，总览/介入仍需要的四块能力落在这里：
//   ① 跨 board 任务聚合（teamsApi 聚合端点优先，listBoards+listTasks 回落）
//   ② 用户待办 + T-15/T-5 闹钟调度（cockpit-kv 单一事实源，extract-shared）
//   ③ 日程弹窗状态（总览复用 CockpitScheduleModal 的挂载状态 + 派生序列）
//   ④ 看板聚合 WS 生命周期（initFleetStream/stopFleetStream，IaShell unmount 接管）
// 外部 IO（REST/WS/kv/localStorage）全部 vi.mock，store 逻辑纯跑。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { teamsApi, fleetAdapter, kanbanApi, kv, taskAdapter } = vi.hoisted(() => ({
  teamsApi: {
    fetchKanbanOverview: vi.fn(),
  },
  fleetAdapter: {
    connectOverviewStream: vi.fn(() => ({ close: vi.fn() })),
    connectFleetStream: vi.fn(() => ({ close: vi.fn() })),
  },
  kanbanApi: {
    listBoards: vi.fn(async () => [] as Array<{ slug: string; name?: string; total?: number }>),
    listTasks: vi.fn(async () => [] as unknown[]),
  },
  kv: {
    loadUserTodos: vi.fn(() => [] as Array<{ id: string; date: string; title: string; createdAt: number; remindAt?: number; reminded15?: boolean; reminded5?: boolean }>),
    saveUserTodos: vi.fn(),
  },
  taskAdapter: {
    toCockpitTask: vi.fn((t: { id: string; status?: string; priority?: number | null; created_at?: number | null }, board: string) => ({
      id: t.id,
      title: `t-${t.id}`,
      priority: 'P2' as const,
      status: (t.status ?? 'todo'),
      assignee: 'a',
      workspace: '',
      tenant: null,
      boardSlug: board,
      createdAt: t.created_at ? t.created_at * 1000 : 0,
    })),
  },
}))

vi.mock('@/custom/cockpit/adapters/teams-adapter', () => teamsApi)
vi.mock('@/custom/cockpit/adapters/fleet-adapter', () => fleetAdapter)
vi.mock('@/api/hermes/kanban', () => kanbanApi)
vi.mock('@/custom/cockpit/store/cockpit-kv', () => ({
  ...kv,
  loadDraft: vi.fn(() => null),
  saveDraft: vi.fn(),
  loadTemplates: vi.fn(() => []),
}))
vi.mock('@/custom/cockpit/adapters/task-adapter', () => taskAdapter)

import { useWorkspaceStore } from '../store/workspace'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  teamsApi.fetchKanbanOverview.mockResolvedValue({ boards: [], tasks: [] })
  kv.loadUserTodos.mockReturnValue([])
})

describe('workspace store：跨 board 任务聚合', () => {
  it('refreshAllBoards 优先走聚合端点并映射任务', async () => {
    // 聚合端点已映射为 CockpitTask（teams-adapter 职责）；store 原样采纳
    teamsApi.fetchKanbanOverview.mockResolvedValue({
      boards: [{ slug: 'swarm', name: 'Swarm', total: 2 }],
      tasks: [
        { id: 't1', title: 't-t1', priority: 'P1', status: 'running', assignee: 'a', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 1700000000000 },
        { id: 't2', title: 't-t2', priority: 'P0', status: 'blocked', assignee: 'a', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 1700000001000 },
      ],
    })
    const store = useWorkspaceStore()
    const ok = await store.refreshAllBoards(true)
    expect(ok).toBe(true)
    expect(store.tasks.map(t => t.id)).toEqual(['t1', 't2'])
    expect(store.tasks[0].boardSlug).toBe('swarm')
    expect(store.boards).toEqual([{ slug: 'swarm', name: 'Swarm', total: 2 }])
    // 聚合端点成功 → 不走 N+1 回落
    expect(kanbanApi.listBoards).not.toHaveBeenCalled()
  })

  it('聚合端点失败回落 listBoards+listTasks（单 board 失败不阻塞）', async () => {
    teamsApi.fetchKanbanOverview.mockRejectedValue(new Error('endpoint gone'))
    kanbanApi.listBoards.mockResolvedValue([
      { slug: 'swarm', name: 'Swarm' },
      { slug: 'hack', name: 'Hack', archived: true },
    ])
    kanbanApi.listTasks.mockImplementation(async (_opts: { board?: string } = {}) => {
      if (kanbanApi.listTasks.mock.calls.length === 1) {
        return [{ id: 't1', status: 'todo', created_at: 1700000000 }]
      }
      throw new Error('board down')
    })
    const store = useWorkspaceStore()
    const ok = await store.refreshAllBoards(true)
    expect(ok).toBe(true)
    expect(store.tasks.map(t => t.id)).toEqual(['t1'])
    expect(store.boards).toEqual([{ slug: 'swarm', name: 'Swarm', total: 0 }])
  })

  it('2s 防抖：非 force 的连续刷新不重复拉取', async () => {
    const store = useWorkspaceStore()
    await store.refreshAllBoards()
    await store.refreshAllBoards()
    expect(teamsApi.fetchKanbanOverview).toHaveBeenCalledTimes(1)
  })

  it('全部失败时返回 false 且不抛出', async () => {
    teamsApi.fetchKanbanOverview.mockRejectedValue(new Error('down'))
    kanbanApi.listBoards.mockRejectedValue(new Error('down'))
    const store = useWorkspaceStore()
    await expect(store.refreshAllBoards(true)).resolves.toBe(false)
  })
})

describe('workspace store：待办与提醒调度', () => {
  it('loadTodos 从 kv 装载；addUserTodo 持久化并触发一次检查', async () => {
    vi.useFakeTimers()
    try {
      const store = useWorkspaceStore()
      store.loadTodos()
      expect(store.userTodos).toEqual([])
      store.addUserTodo('2026-09-10', '写报告')
      expect(kv.saveUserTodos).toHaveBeenCalledTimes(1)
      expect(store.userTodos).toHaveLength(1)
      expect(store.userTodos[0].title).toBe('写报告')
      expect(store.userTodos[0].remindAt).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('removeUserTodo 同步移除其提醒', () => {
    const store = useWorkspaceStore()
    store.addUserTodo('2026-09-10', 'a')
    store.removeUserTodo(store.userTodos[0].id)
    expect(store.userTodos).toHaveLength(0)
    expect(kv.saveUserTodos).toHaveBeenCalled()
  })

  it('startReminderScheduler 幂等；stop 后可重启', () => {
    vi.useFakeTimers()
    try {
      const store = useWorkspaceStore()
      store.startReminderScheduler()
      store.startReminderScheduler()
      expect(vi.getTimerCount()).toBe(1)
      store.stopReminderScheduler()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('workspace store：日程弹窗状态', () => {
  it('openSchedule 初始化选中日为今天并装载待办', () => {
    const store = useWorkspaceStore()
    store.openSchedule()
    expect(store.scheduleOpen).toBe(true)
    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    expect(store.scheduleSelectedDate).toBe(today)
    expect(store.scheduleViewYear).toBe(now.getFullYear())
    expect(store.scheduleViewMonth).toBe(now.getMonth())
    expect(kv.loadUserTodos).toHaveBeenCalled()
    store.closeSchedule()
    expect(store.scheduleOpen).toBe(false)
  })

  it('scheduleEvents：任务按 createdAt 归日 + 待办按 date 归日，升序排列', () => {
    const store = useWorkspaceStore()
    const taskTs = new Date('2026-09-10T08:00:00').getTime()
    teamsApi.fetchKanbanOverview.mockResolvedValue({
      boards: [],
      tasks: [
        { id: 't1', title: 't-t1', priority: 'P2', status: 'todo', assignee: 'a', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: taskTs },
      ],
    })
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-10T12:00:00'))
      store.loadTodos()
      store.addUserTodo('2026-09-10', '站会')
      store.setScheduleDate('2026-09-10')
      return store.refreshAllBoards(true).then(() => {
        const evs = store.scheduleEventsForSelectedSorted
        expect(evs.length).toBe(2)
        expect(evs.map(e => e.kind)).toEqual(['task', 'todo']) // 按 ts 升序
        expect(store.scheduleCountsByDate['2026-09-10']).toBe(2)
        expect(store.scheduleTopPriorityByDate['2026-09-10']).toBe('P2')
      })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('workspace store：看板聚合 WS 生命周期', () => {
  it('initFleetStream 连接 overview 流；board 事件去抖触发刷新；stop 关闭并防重入', async () => {
    vi.useFakeTimers()
    try {
      const store = useWorkspaceStore()
      store.initFleetStream()
      store.initFleetStream() // 幂等
      expect(fleetAdapter.connectOverviewStream).toHaveBeenCalledTimes(1)
      // 模拟 board 事件 → 500ms 去抖后 refreshAllBoards
      const handlers = fleetAdapter.connectOverviewStream.mock.calls[0][0]
      handlers.onBoardEvent('swarm')
      handlers.onBoardEvent('swarm')
      await vi.advanceTimersByTimeAsync(600)
      expect(teamsApi.fetchKanbanOverview).toHaveBeenCalledTimes(1) // 去抖合并
      store.stopFleetStream()
      store.stopFleetStream() // 幂等
      // stop 后重连可用
      store.initFleetStream()
      expect(fleetAdapter.connectOverviewStream).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
