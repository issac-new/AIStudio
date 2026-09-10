// @vitest-environment jsdom
// P3 Task 8 重构：CockpitScheduleModal 弹窗本体复用（总览挂载），但挂载状态/
// 待办/聚合任务改由 ia2 workspace store 承载（cockpit store 随路由退役删除）。
// 组件→store 的交互面（导航/选日/加待办/关弹窗）与视觉断言保持原样。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'

// Mock global Vite define
vi.stubGlobal('__APP_VERSION__', '0.0.0-test')

// ── mock cockpit-kv（待办持久层，workspace store extract-shared 同源）──
vi.mock('@/custom/cockpit/store/cockpit-kv', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/custom/cockpit/store/cockpit-kv')>()
  return {
    ...actual,
    loadUserTodos: vi.fn(() => []),
    saveUserTodos: vi.fn(),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const routerMocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerMocks.push }),
  useRoute: () => ({ params: {}, query: {} }),
}))

// ── workspace store 的外部 IO 桩（重图隔离：kanban REST / 聚合 WS 不实例化）──
vi.mock('@/api/hermes/kanban', () => ({
  listBoards: vi.fn(async () => []),
  listTasks: vi.fn(async () => []),
}))
vi.mock('@/custom/cockpit/adapters/teams-adapter', () => ({
  fetchKanbanOverview: vi.fn(async () => ({ boards: [], tasks: [] })),
}))
vi.mock('@/custom/cockpit/adapters/fleet-adapter', () => ({
  connectOverviewStream: vi.fn(() => ({ close: vi.fn() })),
  connectFleetStream: vi.fn(() => ({ close: vi.fn() })),
}))

import CockpitScheduleModal from '@/custom/cockpit/components/CockpitScheduleModal.vue'
import { useWorkspaceStore } from '@/custom/ia2/store/workspace'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

// CockpitTask 工厂（原用例经 kanban fallback 映射；现直接注入聚合形状）
const ct = (over: Record<string, any> = {}): CockpitTask => ({
  id: 't1', title: 'T', priority: 'P3', status: 'todo',
  assignee: 'alice', workspace: '', tenant: null, boardSlug: 'default', createdAt: 0,
  ...over,
})

describe('CockpitScheduleModal（workspace store 承载）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders modal when schedule is open', async () => {
    const store = useWorkspaceStore()
    store.openSchedule()
    await nextTick()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.find('.cockpit-schedule-modal').exists()).toBe(true)
    expect(wrapper.find('.cockpit-schedule__title').text()).toContain('cockpit.schedule')
  })

  it('shows empty state when no events for selected date', () => {
    const store = useWorkspaceStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.text()).toContain('cockpit.scheduleEmpty')
  })

  it('add todo button toggles input form', async () => {
    const store = useWorkspaceStore()
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
    const store = useWorkspaceStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    await wrapper.find('.cockpit-schedule__close').trigger('click')
    expect(store.scheduleOpen).toBe(false)
  })

  it('navigates years via nav buttons', async () => {
    const store = useWorkspaceStore()
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
    const store = useWorkspaceStore()
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
    const store = useWorkspaceStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    expect(wrapper.find('.cockpit-schedule__cal').exists()).toBe(true)
    expect(wrapper.find('.cockpit-schedule__day').exists()).toBe(true)
  })

  it('marks a mini day with has-count when tasks exist for today', async () => {
    const store = useWorkspaceStore()
    store.tasks = [ct({ id: 't-ct', title: '计数任务', status: 'todo', priority: 'P0', createdAt: Date.now() })]
    store.openSchedule()
    await nextTick()
    const wrapper = mount(CockpitScheduleModal)
    // 今日所在 mini 格子应带 has-count 且按 P0 着色
    const todayCell = wrapper.find('.cockpit-schedule__mini-d.is-today')
    expect(todayCell.exists()).toBe(true)
    expect(todayCell.classes()).toContain('has-count')
    expect(todayCell.classes()).toContain('is-p0')
  })

  it('renders events sorted by time ascending in day panel', async () => {
    // 锚定到今天 08:00/20:00,避免午夜前后 1 小时内 now-1h 落到昨天导致日面板只剩 1 条
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const base = dayStart.getTime()
    // 两个任务，later 在前 push 但时间更晚 → 右栏应按时间升序（earlier 在上）
    const store = useWorkspaceStore()
    store.tasks = [
      ct({ id: 't-late', title: '晚任务', status: 'todo', priority: 'P3', createdAt: base + 20 * 3600_000 }),
      ct({ id: 't-early', title: '早任务', status: 'todo', priority: 'P3', createdAt: base + 8 * 3600_000 }),
    ]
    store.openSchedule()
    await nextTick()
    const wrapper = mount(CockpitScheduleModal)
    const titles = wrapper.findAll('.cockpit-schedule__ev-title').map(n => n.text())
    expect(titles.length).toBeGreaterThanOrEqual(2)
    // 升序：早任务应在晚任务之前
    expect(titles.indexOf('早任务')).toBeLessThan(titles.indexOf('晚任务'))
  })

  it('applies priority visual classes to task event rows', async () => {
    const store = useWorkspaceStore()
    store.tasks = [ct({ id: 't-p0', title: 'P0任务', status: 'blocked', priority: 'P0', createdAt: Date.now() })]
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
    const store = useWorkspaceStore()
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    const minis = wrapper.findAll('.cockpit-schedule__mini')
    expect(minis).toHaveLength(12)
    // 当前查看月应高亮
    const cur = minis.find(m => m.classes().includes('is-cur'))
    expect(cur).toBeTruthy()
  })

  it('clicking a mini day selects that date', async () => {
    const store = useWorkspaceStore()
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
    const store = useWorkspaceStore()
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

  it('clicking a task event navigates to /app/tasks with task query（cockpit selectTask 已退役）', async () => {
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
    const store = useWorkspaceStore()
    store.tasks = [ct({ id: 't-nav', title: '跳转任务', status: 'todo', priority: 'P3', createdAt: dayStart.getTime() + 3600_000 })]
    store.openSchedule()
    const wrapper = mount(CockpitScheduleModal)
    const ev = wrapper.find('.cockpit-schedule__ev')
    expect(ev.exists()).toBe(true)
    await ev.trigger('click')
    expect(routerMocks.push).toHaveBeenCalledWith({ path: '/app/tasks', query: { task: 't-nav' } })
    expect(store.scheduleOpen).toBe(false)
  })
})
