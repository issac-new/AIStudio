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
  useKanbanStore: () => ({
    tasks: mockKanbanTasks,
    boards: [{ slug: 'default', name: 'default', total: 0 }],
    fetchTasks, fetchAssignees: vi.fn(async () => {}), startEventStream: vi.fn(),
    fetchBoards: vi.fn(async () => {}), setSelectedBoard: vi.fn(),
  }),
}))
const { searchSessions, listWorkspaceFiles, getTimeline } = vi.hoisted(() => ({
  searchSessions: vi.fn(async () => []),
  listWorkspaceFiles: vi.fn(async () => []),
  getTimeline: vi.fn(async () => ({ items: [], total: 0 })),
}))
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({ searchSessions, listWorkspaceFiles, getTimeline }))
const { getTask } = vi.hoisted(() => ({
  getTask: vi.fn(async () => null),
}))
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, getTask }
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}), switchSession: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}), sortedMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// ── mock files store：捕获 workspaceRoot / currentPath / fetchEntries 调用 ──
// 用普通可变对象（非 ref），因为 CockpitFilePanel 直接对 filesStore.workspaceRoot 赋值；
// 返回同一实例即可让赋值/读取互通，且响应式由 CockpitFilePanel 内部的 watch 触发。
const filesState = {
  workspaceRoot: undefined as string | undefined,
  currentPath: '' as string,
  fetchEntries: vi.fn(async () => {}),
}
vi.mock('@/stores/hermes/files', () => ({
  useFilesStore: () => filesState,
}))
// FilesPanel 复用 upstream 组件，测试中只需空壳
vi.mock('@/components/hermes/chat/FilesPanel.vue', () => ({
  default: { template: '<div class="files-panel-stub"></div>' },
}))

import CockpitFilePanel from '@/custom/cockpit/components/CockpitFilePanel.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

describe('CockpitFilePanel — Workspace Home path sync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true, writable: true })
    filesState.workspaceRoot = undefined
    filesState.currentPath = ''
    filesState.fetchEntries.mockClear()
  })

  async function seedCenterTask() {
    mockKanbanTasks.push(kt({ id: 't1', title: '中心任务', workspace_path: '~/ws-center' }))
    getTask.mockResolvedValue({
      task: { id: 't1', title: '中心任务', body: null, assignee: 'alice', status: 'todo', priority: 0, created_by: 'bob', created_at: 0, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: '~/ws-center', tenant: null, project_id: null, result: null, skills: null },
      latest_summary: null, comments: [], events: [], runs: [],
      parents: [], children: [],
    })
    const s = useCockpitStore()
    await s.bootstrap() // 选中 t1
    return s
  }

  it('mounting sets workspaceRoot to the selected task workspace', async () => {
    await seedCenterTask()
    mount(CockpitFilePanel)
    expect(filesState.workspaceRoot).toBe('~/ws-center')
    expect(filesState.fetchEntries).toHaveBeenCalledWith('')
  })

  it('re-selecting the SAME task (center-node click) still refreshes workspaceRoot', async () => {
    const s = await seedCenterTask()
    mount(CockpitFilePanel)
    expect(filesState.workspaceRoot).toBe('~/ws-center')

    // 模拟外部把 workspaceRoot 污染成别的值（例如用户刚切到 chat 面板再切回 workspace，
    // 或上一只 FilePanel 实例遗留）—— 复现「Home 路径未更新」的现场
    filesState.workspaceRoot = '~/some-stale-path'
    filesState.currentPath = 'deep/sub/dir'
    filesState.fetchEntries.mockClear()

    // 用户在 Collaboration Map 点击中心节点 → selectTask(当前任务 id)
    // 中心节点 taskId === 当前 selectedTask.id（见 topology-adapter.ts）
    const centerTaskId = s.selectedTask!.id
    await s.selectTask(centerTaskId)

    // 期望：Home 路径被重新同步回中心任务的 workspace
    expect(filesState.workspaceRoot).toBe('~/ws-center')
    expect(filesState.currentPath).toBe('')
    expect(filesState.fetchEntries).toHaveBeenCalledWith('')
  })

  it('robust to detail.task being null on re-select (no object rebuild)', async () => {
    // loadTaskDetail 在 detail.task 为空时不会重建 cockpitTasks 中的任务对象，
    // 故「监听 selectedTask 引用」的修复会在该场景失效；本测试锁定
    // 基于 selectionSeq 的修复即便 detail.task 缺失也能刷新 Home 路径。
    mockKanbanTasks.push(kt({ id: 't1', title: '中心任务', workspace_path: '~/ws-center' }))
    // detail.task 缺失
    getTask.mockResolvedValue({ task: null, latest_summary: null, comments: [], events: [], runs: [], parents: [], children: [] } as any)
    const s = useCockpitStore()
    await s.bootstrap()
    mount(CockpitFilePanel)
    expect(filesState.workspaceRoot).toBe('~/ws-center')

    filesState.workspaceRoot = '~/stale'
    filesState.currentPath = 'sub'
    filesState.fetchEntries.mockClear()

    await s.selectTask(s.selectedTask!.id) // 重新选中同一任务（中心节点点击）

    expect(filesState.workspaceRoot).toBe('~/ws-center')
    expect(filesState.currentPath).toBe('')
    expect(filesState.fetchEntries).toHaveBeenCalledWith('')
  })

  it('mounting with null workspace_path does NOT set workspaceRoot or fetchEntries', async () => {
    // 任务未 claim 时 workspace_path 为 null → workspace 退化为空串 '~'
    // → 不向 filesStore 写入 '~'（会导致服务端 ENOENT），也不发起 fetchEntries。
    mockKanbanTasks.push(kt({ id: 't1', title: '未领取', workspace_path: null }))
    getTask.mockResolvedValue({
      task: { id: 't1', title: '未领取', body: null, assignee: null, status: 'triage', priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null, workspace_kind: 'scratch', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
      latest_summary: null, comments: [], events: [], runs: [],
      parents: [], children: [],
    })
    const s = useCockpitStore()
    await s.bootstrap()
    filesState.workspaceRoot = 'previous-value'
    mount(CockpitFilePanel)
    // workspaceRoot 应为空（未写入 '~'）
    expect(filesState.workspaceRoot).toBeUndefined()
    expect(filesState.currentPath).toBe('')
    // 不应发起 fetchEntries
    expect(filesState.fetchEntries).not.toHaveBeenCalled()
  })

  it('picking up workspace_path after task is claimed (loadTaskDetail sync)', async () => {
    // 引导时任务 workspace_path 为 null（未 claim），detail.task 也无 workspace。
    mockKanbanTasks.push(kt({ id: 't1', title: '待领取', workspace_path: null }))
    getTask.mockResolvedValue({
      task: { id: 't1', title: '待领取', body: null, assignee: null, status: 'triage', priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null, workspace_kind: 'scratch', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
      latest_summary: null, comments: [], events: [], runs: [],
      parents: [], children: [],
    })
    const s = useCockpitStore()
    await s.bootstrap()
    mount(CockpitFilePanel)
    expect(filesState.workspaceRoot).toBeUndefined()

    // 模拟 agent claim 后 workspace_path 已解析：selectTask 重新拉 detail，
    // 这一次 detail.task.workspace_path 有值。
    getTask.mockResolvedValue({
      task: { id: 't1', title: '待领取', body: null, assignee: 'alice', status: 'running', priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null, workspace_kind: 'scratch', workspace_path: '/home/u/.hermes/kanban/workspaces/T-abc', tenant: null, project_id: null, result: null, skills: null },
      latest_summary: null, comments: [], events: [], runs: [],
      parents: [], children: [],
    })
    filesState.fetchEntries.mockClear()
    await s.selectTask(s.selectedTask!.id) // 重新选中 → loadTaskDetail

    expect(s.selectedTask?.workspace).toBe('/home/u/.hermes/kanban/workspaces/T-abc')
    expect(filesState.workspaceRoot).toBe('/home/u/.hermes/kanban/workspaces/T-abc')
    expect(filesState.currentPath).toBe('')
    expect(filesState.fetchEntries).toHaveBeenCalledWith('')
  })
})
