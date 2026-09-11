// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

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

import CockpitFileTree from '@/custom/cockpit/components/CockpitFileTree.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws/auth-svc', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitFileTree', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    listWorkspaceFiles.mockClear()
    Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} }, configurable: true, writable: true })
  })

  function seedFileTree() {
    // 直接填 store.fileTrees（懒加载缓存），绕过 async selectTask
    const tree = [
      { id: 'src', name: 'src', isDir: true, children: [{ id: 'src/refresh.ts', name: 'refresh.ts', isDir: false }] },
      { id: 'package.json', name: 'package.json', isDir: false },
    ]
    mockKanbanTasks.push(kt({ id: 't1', workspace_path: '~/ws/auth-svc' }))
    // listWorkspaceFiles 需返回与 seed 一致的数据，避免 refreshFileTree 覆盖清空
    listWorkspaceFiles.mockResolvedValue(tree)
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    s.fileTrees = { t1: tree }
    return s
  }

  it('renders top-level files and directories', () => {
    seedFileTree()
    const w = mount(CockpitFileTree)
    expect(w.text()).toContain('src')
    expect(w.text()).toContain('package.json')
  })

  it('directory is collapsed by default (children hidden)', () => {
    seedFileTree()
    const w = mount(CockpitFileTree)
    expect(w.find('[data-file-id="src/refresh.ts"]').exists()).toBe(false)
  })

  it('clicking a directory expands it', async () => {
    seedFileTree()
    const w = mount(CockpitFileTree)
    await w.find('[data-file-id="src"]').trigger('click')
    expect(w.find('[data-file-id="src/refresh.ts"]').exists()).toBe(true)
  })

  it('clicking a file selects it in the store', async () => {
    seedFileTree()
    const w = mount(CockpitFileTree)
    await w.find('[data-file-id="src"]').trigger('click')
    await w.find('[data-file-id="src/refresh.ts"]').trigger('click')
    const s = useCockpitStore()
    expect(s.selectedFileId).toBe('src/refresh.ts')
  })

  it('shows current workspace path from selected task', () => {
    seedFileTree()
    const w = mount(CockpitFileTree)
    expect(w.text()).toContain('~/ws/auth-svc')
  })

  it('bootstrap triggers listWorkspaceFiles lazy load for first task', async () => {
    mockKanbanTasks.push(kt({ id: 't1' }))
    listWorkspaceFiles.mockResolvedValue([{ id: 'a.ts', name: 'a.ts', isDir: false }])
    const s = useCockpitStore()
    await s.bootstrap()
    expect(listWorkspaceFiles).toHaveBeenCalledWith('t1', expect.any(String))
  })
})
