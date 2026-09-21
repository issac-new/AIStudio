// overlay/custom/client/cockpit/__tests__/cockpit-store-perf.test.ts
// 驾驶舱性能收敛守门（2026-09-21 refresh-storm 根治）：
//   ① bootstrap 聚合优先：聚合端点可用时不得走 N+1（kanban.fetchTasks 逐板串行
//      会逐次改写 kanban.tasks，触发双 store watch 自放大请求风暴）；
//      端点失败必须回落 N+1 保底（旧契约）。
//   ② fleet 快照指纹守卫：服务端 1.5s tick 快照同构（新数组新身份）时不得替换
//      fleetSessions 引用（身份抖动会令 waitItems/online/inbox 全量重算重渲染）。
//   ③ kanban.tasks watch 行指纹门控：选中任务关键字段未变不得重拉 detail
//      （getTask+log+链路 BFS 连环）；变化才重拉。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick, reactive } from 'vue'

// ── kanban store 桩：tasks 用 reactive 代理包 hoisted 数组，watch 才能被驱动 ──
const kanbanMock = vi.hoisted(() => ({
  tasks: [] as any[],
  state: null as any,
  fetchTasks: vi.fn(async () => {}),
  fetchAssignees: vi.fn(async () => {}),
  startEventStream: vi.fn(),
  fetchBoards: vi.fn(async () => {}),
  setSelectedBoard: vi.fn(),
}))
vi.mock('@/stores/hermes/kanban', async () => {
  const { reactive } = await import('vue')
  return {
    useKanbanStore: () => {
      // reactive 容器持 tasks：测试经 state.tasks = [...] 整体替换（数组身份变化），
      // 容器属性赋值触发依赖 → watch 源 () => kanban.tasks 重新求值并按身份判变
      if (!kanbanMock.state) kanbanMock.state = reactive({ tasks: kanbanMock.tasks })
      return {
        get tasks() { return kanbanMock.state.tasks },
        boards: [{ slug: 'default', name: 'default', total: 0 }],
        fetchTasks: kanbanMock.fetchTasks,
        fetchAssignees: kanbanMock.fetchAssignees,
        startEventStream: kanbanMock.startEventStream,
        fetchBoards: kanbanMock.fetchBoards,
        setSelectedBoard: kanbanMock.setSelectedBoard,
      }
    },
  }
})

// ── teams-adapter 桩：聚合端点开关（overview=成功载荷 / error=抛错回落）──
const teamsMock = vi.hoisted(() => ({
  overview: null as null | any,
  error: null as unknown,
  listTeams: vi.fn(async () => []),
}))
vi.mock('@/custom/cockpit/adapters/teams-adapter', async () => {
  const actual = await vi.importActual<any>('@/custom/cockpit/adapters/teams-adapter')
  return {
    ...actual,
    listTeams: teamsMock.listTeams,
    fetchKanbanOverview: vi.fn(async () => {
      if (teamsMock.error) throw teamsMock.error
      if (!teamsMock.overview) throw new Error('no overview fixture')
      return teamsMock.overview
    }),
  }
})

// ── fleet-adapter 桩：捕获 onSnapshot/onStatus 手动驱动 ──
const fleetMock = vi.hoisted(() => ({
  handlers: null as null | { onSnapshot: (s: any) => void; onStatus?: (c: boolean) => void },
}))
vi.mock('@/custom/cockpit/adapters/fleet-adapter', async () => {
  const actual = await vi.importActual<any>('@/custom/cockpit/adapters/fleet-adapter')
  return {
    ...actual,
    connectFleetStream: vi.fn((handlers: any) => {
      fleetMock.handlers = handlers
      return { close: vi.fn() }
    }),
    connectOverviewStream: vi.fn(() => ({ close: vi.fn() })),
  }
})

// ── 其余依赖桩（自 cockpit-store.test.ts 同款收窄）──
const { getTask, listWorkspaceFiles } = vi.hoisted(() => ({
  getTask: vi.fn(async () => null),
  listWorkspaceFiles: vi.fn(async () => []),
}))
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, getTask, listWorkspaceFiles }
})
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({
  searchSessions: vi.fn(async () => []),
  listWorkspaceFiles: vi.fn(async () => []),
  getTimeline: vi.fn(async () => ({ items: [], total: 0 })),
}))
vi.mock('@/api/studio/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/studio/sessions')
  return { ...actual, searchSessions: vi.fn(async () => []) }
})
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}),
    switchSession: vi.fn(async () => {}), sessions: [],
    unreadMessages: new Map(),
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

const cockpitTask = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T1', body: null, assignee: null, status: 'todo',
  priority: 'P2' as const, createdAt: 1000, tenant: null, boardSlug: 'default',
  workspace: null, source: 'kanban', updatedAt: null, ...over,
})

const kanbanRow = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T1', body: null, assignee: null, status: 'todo',
  priority: 2, created_at: 1000, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: null, tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

beforeEach(() => {
  setActivePinia(createPinia())
  kanbanMock.tasks.splice(0, kanbanMock.tasks.length)
  kanbanMock.state = null
  kanbanMock.fetchTasks.mockClear()
  kanbanMock.startEventStream.mockClear()
  teamsMock.overview = null
  teamsMock.error = null
  fleetMock.handlers = null
  getTask.mockClear()
  getTask.mockResolvedValue(null)
  listWorkspaceFiles.mockClear()
})

describe('cockpit bootstrap 聚合优先（N+1 风暴守门）', () => {
  it('聚合端点可用：bootstrap 不触发 kanban.fetchTasks（不切板/不逐板拉）', async () => {
    teamsMock.overview = {
      boards: [{ slug: 'default', name: 'default', total: 1 }],
      tasks: [cockpitTask()],
      rawTasks: [{ board: 'default', task: kanbanRow() }],
    }
    const s = useCockpitStore()
    await s.bootstrap()
    expect(kanbanMock.fetchTasks).not.toHaveBeenCalled()
    expect(s.tasks.map(t => t.id)).toEqual(['t1'])
    // 自动选中首个任务（旧契约保留）
    expect(s.selectedTaskId).toBe('t1')
  })

  it('聚合端点失败：回落 N+1 逐板拉取（fetchTasks 被调用）', async () => {
    teamsMock.error = new Error('aggregate 404')
    kanbanMock.tasks.push(kanbanRow())
    const s = useCockpitStore()
    await s.bootstrap()
    expect(kanbanMock.fetchTasks).toHaveBeenCalled()
    expect(s.tasks.map(t => t.id)).toEqual(['t1'])
  })
})

describe('fleet 快照指纹守卫（身份抖动守门）', () => {
  it('同构快照（新数组新身份）不替换 fleetSessions 引用；状态变化才替换', async () => {
    const s = useCockpitStore()
    await s.bootstrap() // bootstrap 内部武装 fleet 流（initFleetStream 未导出，经 bootstrap 驱动）
    expect(fleetMock.handlers, 'bootstrap 应连接 fleet 流').toBeTruthy()
    const mk = (status: string) => ({
      sessions: [{
        id: 'sess-1', profile: 'default', title: 's', status, isAborting: false,
        queueLength: 0, runStartedAt: null, lastActiveAt: 1, source: '', agent: '',
        lastPreview: '', approvals: [], clarifies: [], subagents: [],
      }],
      ts: Date.now(),
    })
    fleetMock.handlers!.onSnapshot(mk('idle'))
    const ref1 = s.fleetSessions
    fleetMock.handlers!.onSnapshot(mk('idle'))
    expect(s.fleetSessions).toBe(ref1)
    fleetMock.handlers!.onSnapshot(mk('working'))
    expect(s.fleetSessions).not.toBe(ref1)
    expect(s.fleetSessions[0].status).toBe('working')
  })

  it('不再开第二条看板聚合 overview WS（双连接=双份强制刷新）', async () => {
    const fleetAdapter = await import('@/custom/cockpit/adapters/fleet-adapter')
    const s = useCockpitStore()
    await s.bootstrap()
    expect((fleetAdapter.connectOverviewStream as any).mock.calls.length).toBe(0)
  })
})

describe('kanban.tasks watch 行指纹门控（detail 连环重拉守门）', () => {
  it('选中任务关键字段未变：不重拉 detail；状态变化：重拉一次', async () => {
    teamsMock.error = new Error('aggregate down → N+1')
    getTask.mockResolvedValue({
      task: kanbanRow({ id: 't1', status: 'todo' }),
      latest_summary: null, comments: [], events: [], runs: [],
      parents: [], children: [],
    })
    kanbanMock.tasks.push(kanbanRow({ id: 't1', status: 'todo' }))
    const s = useCockpitStore()
    await s.bootstrap()
    expect(getTask).toHaveBeenCalledTimes(1) // selectTask(t1) 首拉

    // 无关变化：同任务字段不变、数组整体替换（模拟无关 board 事件后的 store 刷新；
    // 生产路径是 store 整体替换 tasks 数组身份，此处以新 proxy 承载新数组）
    kanbanMock.state.tasks = [kanbanRow({ id: 't1', status: 'todo' })]
    await nextTick(); await nextTick()
    await new Promise(r => setTimeout(r, 10))
    expect(getTask).toHaveBeenCalledTimes(1) // 门控生效，未重拉

    // 选中行状态真变：必须重拉（detail 新鲜度）
    kanbanMock.state.tasks = [kanbanRow({ id: 't1', status: 'running' })]
    await nextTick(); await nextTick()
    await new Promise(r => setTimeout(r, 10))
    expect(getTask).toHaveBeenCalledTimes(2)
  })
})
