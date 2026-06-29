// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'

// Mock global Vite define
vi.stubGlobal('__APP_VERSION__', '0.0.0-test')

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
const { getTimeline } = vi.hoisted(() => ({
  getTimeline: vi.fn(async () => ({ items: [], total: 0 })),
}))
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({
  searchSessions: vi.fn(async () => []),
  listWorkspaceFiles: vi.fn(async () => []),
  getTimeline,
}))

// ── mock kanban api ──
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, getTask: vi.fn(async () => null), addComment: vi.fn(async () => ({ ok: true })) }
})

// ── mock sessions API ──
vi.mock('@/api/hermes/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/sessions')
  return { ...actual, searchSessions: vi.fn(async (_q: string) => []) }
})

// ── mock chat/group/matrix stores ──
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

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

// Mock cockpit-kv to ensure loadUserTodos is available
vi.mock('@/custom/cockpit/store/cockpit-kv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/custom/cockpit/store/cockpit-kv')>()
  return {
    ...actual,
    loadUserTodos: vi.fn(() => []),
    saveUserTodos: vi.fn(),
  }
})

import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

// 任务工厂（与 cockpit-store.test.ts 的 kt 一致）
const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

describe('CockpitScheduleModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders modal when schedule is open', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    await nextTick()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.find('.cockpit-schedule-modal').exists()).toBe(true)
    expect(wrapper.find('.cockpit-schedule__title').text()).toBe('📅 cockpit.schedule')
  })

  it('shows empty state when no events for selected date', () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.text()).toContain('cockpit.scheduleEmpty')
  })

  it('add todo button toggles input form', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    // 添加按钮在头部「日程」文字右侧
    expect(wrapper.find('.cockpit-schedule__add-trigger').exists()).toBe(true)
    await wrapper.find('.cockpit-schedule__add-trigger').trigger('click')
    // 展开后显示标题输入框 + 日期/时间选择
    expect(wrapper.find('.cockpit-schedule__input').exists()).toBe(true)
    expect(wrapper.find('.cockpit-schedule__add-date').exists()).toBe(true)
    expect(wrapper.find('.cockpit-schedule__add-time').exists()).toBe(true)
  })

  it('close button calls closeSchedule', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    await wrapper.find('.cockpit-schedule__close').trigger('click')
    expect(store.scheduleOpen).toBe(false)
  })

  it('navigates years via nav buttons', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    store.scheduleViewYear = 2026
    const wrapper = mount(CockpitScheduleModal)
    const btns = wrapper.findAll('.cockpit-schedule__nav-btn')
    await btns[1].trigger('click') // next year
    expect(store.scheduleViewYear).toBe(2027)
    await btns[0].trigger('click') // prev year
    expect(store.scheduleViewYear).toBe(2026)
  })

  it('today button resets to current month', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    store.scheduleViewYear = 2025
    store.scheduleViewMonth = 0
    const wrapper = mount(CockpitScheduleModal)
    await wrapper.find('.cockpit-schedule__today-btn').trigger('click')
    const now = new Date()
    expect(store.scheduleViewYear).toBe(now.getFullYear())
    expect(store.scheduleViewMonth).toBe(now.getMonth())
  })

  it('renders two-column layout (calendar + day panel)', () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.find('.cockpit-schedule__cal').exists()).toBe(true)
    expect(wrapper.find('.cockpit-schedule__day').exists()).toBe(true)
  })

  it('marks a mini day with has-count when tasks exist for today', async () => {
    mockKanbanTasks.length = 0
    mockKanbanTasks.push(kt({ id: 't-ct', title: '计数任务', status: 'todo', priority: 3, created_at: Date.now() }))
    const store = useCockpitStore()
    store.openSchedule()
    await nextTick()
    const wrapper = mount(CockpitScheduleModal)
    // 今日所在 mini 格子应带 has-count 且按 P0 着色（priority:3 → P0）
    const todayCell = wrapper.find('.cockpit-schedule__mini-d.is-today')
    expect(todayCell.exists()).toBe(true)
    expect(todayCell.classes()).toContain('has-count')
    expect(todayCell.classes()).toContain('is-p0')
  })

  it('renders events sorted by time ascending in day panel', async () => {
    mockKanbanTasks.length = 0
    const now = Date.now()
    // 两个任务，later 在前 push 但时间更晚 → 右栏应按时间升序（earlier 在上）
    mockKanbanTasks.push(
      kt({ id: 't-late', title: '晚任务', status: 'todo', priority: 0, created_at: now }),
      kt({ id: 't-early', title: '早任务', status: 'todo', priority: 0, created_at: now - 3600_000 }),
    )
    const store = useCockpitStore()
    store.openSchedule()
    await nextTick()
    const wrapper = mount(CockpitScheduleModal)
    const titles = wrapper.findAll('.cockpit-schedule__ev-title').map(n => n.text())
    expect(titles.length).toBeGreaterThanOrEqual(2)
    // 升序：早任务应在晚任务之前
    expect(titles.indexOf('早任务')).toBeLessThan(titles.indexOf('晚任务'))
  })

  it('applies priority visual classes to task event rows', async () => {
    mockKanbanTasks.length = 0
    mockKanbanTasks.push(kt({ id: 't-p0', title: 'P0任务', status: 'blocked', priority: 3, created_at: Date.now() }))
    const store = useCockpitStore()
    store.openSchedule()
    await nextTick()
    const wrapper = mount(CockpitScheduleModal)
    const ev = wrapper.find('.cockpit-schedule__ev')
    expect(ev.exists()).toBe(true)
    expect(ev.classes()).toContain('is-p0')
    // 状态标签应渲染 blocked 语义
    expect(wrapper.find('.cockpit-schedule__ev-stg.st-blocked').exists()).toBe(true)
  })

  it('renders 12 mini months in the year overview', () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    const minis = wrapper.findAll('.cockpit-schedule__mini')
    expect(minis).toHaveLength(12)
    // 当前查看月应高亮
    const cur = minis.find(m => m.classes().includes('is-cur'))
    expect(cur).toBeTruthy()
  })

  it('clicking a mini day selects that date', async () => {
    const store = useCockpitStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    // 点击 1 月 15 日（第一个 mini 月的第 15 天）
    store.scheduleViewYear = 2026
    await nextTick()
    const allDays = wrapper.findAll('.cockpit-schedule__mini-d')
    // 找到 title 含 2026-01-15 的格子
    const jan15 = allDays.find(d => d.attributes('title')?.startsWith('2026-01-15'))
    expect(jan15).toBeTruthy()
    await jan15!.trigger('click')
    expect(store.scheduleSelectedDate).toBe('2026-01-15')
    expect(store.scheduleViewMonth).toBe(0)
  })

  it('renders lunar day label under each solar day', () => {
    const store = useCockpitStore()
    store.openSchedule()
    store.scheduleViewYear = 2026
    const wrapper = mount(CockpitScheduleModal)
    // 2026-02-17 = 春节，应渲染农历标签「春节」
    const allDays = wrapper.findAll('.cockpit-schedule__mini-d')
    const springFestival = allDays.find(d => d.attributes('title')?.startsWith('2026-02-17'))
    expect(springFestival).toBeTruthy()
    expect(springFestival!.classes()).toContain('is-festival')
    expect(springFestival!.find('.cockpit-schedule__mini-lunar').text()).toBe('春节')
  })
})
