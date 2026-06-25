// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { mockKanbanTasks, fetchTasks } = vi.hoisted(() => ({
  mockKanbanTasks: [] as any[],
  fetchTasks: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ tasks: mockKanbanTasks, fetchTasks, fetchAssignees: vi.fn(async () => { return ['alice', 'bob']; }), startEventStream: vi.fn(), assignees: ['alice', 'bob'], assignTask: vi.fn(async () => {}) }),
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
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, args?: Record<string, unknown>) => {
      if (args && key.includes('basedOnTemplate')) return args.tpl + '/' + args.n
      return key
    },
  }),
}))

import CockpitWorkspace from '@/custom/cockpit/components/CockpitWorkspace.vue'
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

describe('CockpitWorkspace', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    addComment.mockClear()
    Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true, writable: true })
  })

  function seed() {
    mockKanbanTasks.push(kt({ id: 't1', title: 'PR #142' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    return s
  }

  it('shows task header with title and status', () => {
    seed()
    const w = mount(CockpitWorkspace)
    // 标题现为可编辑 input（A1），其值不进入 wrapper.text()，需查 input.value
    const titleInput = w.find('.cockpit-workspace__title-input')
    expect(titleInput.exists()).toBe(true)
    expect((titleInput.element as HTMLInputElement).value).toContain('PR #142')
    expect(w.find('.cockpit-workspace__status-chip').exists()).toBe(true)
  })

  it('save draft button exists in footer', () => {
    seed()
    const w = mount(CockpitWorkspace)
    expect(w.text()).toContain('saveDraft')
  })

  it('shows empty state when no task selected', () => {
    const w = mount(CockpitWorkspace)
    expect(w.find('.cockpit-workspace__empty').exists()).toBe(true)
  })

  it('submit button emits submit event', async () => {
    seed()
    const w = mount(CockpitWorkspace)
    await w.find('[data-action="submit"]').trigger('click')
    expect(w.emitted('submit')).toBeTruthy()
  })

  it('submitting via store posts comment + clears draft', async () => {
    const s = seed()
    s.updateWorkItem({ decision: 'approve', riskTags: [], opinion: 'ok' })
    await s.submitWorkItem()
    expect(addComment).toHaveBeenCalled()
    expect(addComment.mock.calls[0][0]).toBe('t1')
    expect(addComment.mock.calls[0][1].body).toContain('[决策:approve]')
    expect(s.workItemForSelectedTask).toBeNull()
  })
})
