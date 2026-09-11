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
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, args?: Record<string, unknown>) => {
    if (args && key.includes('templateCount')) return String(args.n)
    return key
  } }),
}))

import CockpitTemplateManager from '@/custom/cockpit/components/CockpitTemplateManager.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { saveTemplates } from '@/custom/cockpit/store/cockpit-kv'

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

describe('CockpitTemplateManager', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true, writable: true })
  })

  function seedTemplates() {
    saveTemplates([
      { id: 'tpl1', name: 'PR 审核', decision: 'conditional', riskTags: ['concurrency'], opinion: 'ok', modifiedFiles: [] },
      { id: 'tpl2', name: '快速通过', decision: 'approve', riskTags: [], opinion: '', modifiedFiles: [] },
    ])
    return useCockpitStore()
  }

  it('renders the template list from localStorage', () => {
    seedTemplates()
    const w = mount(CockpitTemplateManager)
    expect(w.text()).toContain('PR 审核')
    expect(w.text()).toContain('快速通过')
  })

  it('shows empty state when no templates', () => {
    useCockpitStore()
    const w = mount(CockpitTemplateManager)
    expect(w.find('.cockpit-template-manager__empty').exists()).toBe(true)
  })

  it('delete button removes the template from localStorage', async () => {
    const s = seedTemplates()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-template-id="tpl1"] [data-action="delete"]').trigger('click')
    expect(s.templates.find(t => t.id === 'tpl1')).toBeUndefined()
  })

  it('apply button applies template to current work item draft + closes', async () => {
    const s = seedTemplates()
    mockKanbanTasks.push(kt({ id: 't1' }))
    ;(s as any).selectedTaskId = 't1'
    s.updateWorkItem({ decision: 'reject', riskTags: [], opinion: '' })
    s.openTemplateManager()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-template-id="tpl1"] [data-action="apply"]').trigger('click')
    expect(s.workItemForSelectedTask?.decision).toBe('conditional')
    expect(s.templateManagerOpen).toBe(false)
  })

  it('save template from current work item writes to localStorage', async () => {
    const s = useCockpitStore()
    mockKanbanTasks.push(kt({ id: 't1' }))
    ;(s as any).selectedTaskId = 't1'
    s.updateWorkItem({ decision: 'approve', riskTags: ['perf'], opinion: '好', modifiedFiles: [] })
    expect(s.templates).toEqual([])
    s.saveTemplateFromCurrentWorkItem('我的模板')
    expect(s.templates).toHaveLength(1)
    expect(s.templates[0].name).toBe('我的模板')
  })

  it('close button closes the manager', async () => {
    const s = seedTemplates()
    s.openTemplateManager()
    const w = mount(CockpitTemplateManager)
    await w.find('[data-action="close"]').trigger('click')
    expect(s.templateManagerOpen).toBe(false)
  })
})
