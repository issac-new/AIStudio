// overlay/custom/client/ia2/__tests__/workspace-store-fingerprint.test.ts
// 任务指纹守卫（2026-09-21 身份抖动守门）：聚合刷新响应每次都是新数组新身份，
// 直接赋值会令 sessionRows/feedRows/waitItems/boardRows/decisionRows 全量重算重渲染。
// 关键字段指纹不变时必须跳过 tasks/rawTasks 赋值（引用稳定）；真实变化必须更新。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { teamsApi, fleetAdapter, kanbanApi, kv, taskAdapter } = vi.hoisted(() => ({
  teamsApi: { fetchKanbanOverview: vi.fn() },
  fleetAdapter: {
    connectOverviewStream: vi.fn(() => ({ close: vi.fn() })),
    connectFleetStream: vi.fn(() => ({ close: vi.fn() })),
  },
  kanbanApi: {
    listBoards: vi.fn(async () => []),
    listTasks: vi.fn(async () => []),
  },
  kv: {
    loadUserTodos: vi.fn(() => []),
    saveUserTodos: vi.fn(),
  },
  taskAdapter: {
    toCockpitTask: vi.fn((t: any, board: string) => ({
      id: t.id,
      title: t.title ?? `t-${t.id}`,
      priority: 'P2' as const,
      status: t.status ?? 'todo',
      assignee: t.assignee ?? null,
      workspace: '',
      tenant: null,
      boardSlug: board,
      createdAt: 1000,
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
})

const mkTask = (id: string, status = 'todo') => ({ id, status, title: `t-${id}` })
const overviewOf = (tasks: any[]) => ({
  boards: [{ slug: 'default', name: 'default', total: tasks.length }],
  tasks: tasks.map(t => taskAdapter.toCockpitTask(t, 'default')),
  rawTasks: tasks.map(t => ({ board: 'default', task: t })),
})

describe('workspace store 任务指纹守卫', () => {
  it('同构重复刷新：tasks/rawTasks 引用稳定（不触发下游全量重算）', async () => {
    const store = useWorkspaceStore()
    teamsApi.fetchKanbanOverview.mockResolvedValue(overviewOf([mkTask('t1'), mkTask('t2')]))
    await store.refreshAllBoards(true)
    const tasksRef = store.tasks
    const rawRef = store.rawTasks
    // 第二次刷新：内容同构、身份全新（模拟 WS 事件后的去抖强制刷新）
    await store.refreshAllBoards(true)
    expect(store.tasks).toBe(tasksRef)
    expect(store.rawTasks).toBe(rawRef)
  })

  it('关键字段真实变化：必须更新（状态翻转可见）', async () => {
    const store = useWorkspaceStore()
    teamsApi.fetchKanbanOverview.mockResolvedValue(overviewOf([mkTask('t1', 'todo')]))
    await store.refreshAllBoards(true)
    expect(store.tasks[0].status).toBe('todo')
    const staleRef = store.tasks
    teamsApi.fetchKanbanOverview.mockResolvedValue(overviewOf([mkTask('t1', 'running')]))
    await store.refreshAllBoards(true)
    expect(store.tasks).not.toBe(staleRef)
    expect(store.tasks[0].status).toBe('running')
  })

  it('新增/删除任务视为变化：引用更新', async () => {
    const store = useWorkspaceStore()
    teamsApi.fetchKanbanOverview.mockResolvedValue(overviewOf([mkTask('t1')]))
    await store.refreshAllBoards(true)
    const ref = store.tasks
    teamsApi.fetchKanbanOverview.mockResolvedValue(overviewOf([mkTask('t1'), mkTask('t2')]))
    await store.refreshAllBoards(true)
    expect(store.tasks).not.toBe(ref)
    expect(store.tasks.map(t => t.id)).toEqual(['t1', 't2'])
  })
})
