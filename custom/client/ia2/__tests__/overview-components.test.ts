// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/overview-components.test.ts
// P3 Task 4 — 总览组件 jsdom 冒烟：五组件 props→渲染→事件，OverviewView 装配
// （注意力条/四卡片/今日计划/空态引导/日程弹窗接线）。
// i18n 走全局 setup 的 key 直返 mock；外部 store（cockpit）与 REST 全部桩化。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── REST/loop-rest 桩（runs store 真身，行为与 runs-metrics.test.ts 同形状）──
const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [] as Array<{ runId: string; graphId: string; status: string; updatedAt: string | null }>),
    replay: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
    forkRun: vi.fn(async () => ({ runId: 'f', forkedFrom: 'x', superStep: 0 })),
    startRun: vi.fn(async () => ({ runId: 'f', instance: {} })),
    exportRun: vi.fn(async () => ({ run: {}, spec: null, events: [] })),
    getSpec: vi.fn(async () => null),
  },
  loopRest: {
    listLoops: vi.fn(async () => [] as Array<{ id: string }>),
    getEvents: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
  },
}))

vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest,
  connectGraph: vi.fn(() => ({ connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })),
  disconnectGraph: vi.fn(),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))

// ── workspace store 桩（重图隔离；Task 8 store 拆分后视图依赖 ia2 workspace）──
const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [] as Array<{ id: string; title: string; status: string; priority: number | string | null; boardSlug?: string }>,
    userTodos: [] as Array<{ id: string; title: string; date: string; remindAt?: number | null }>,
    scheduleOpen: false,
    refreshAllBoards: vi.fn(async () => true),
    initFleetStream: vi.fn(),
    startReminderScheduler: vi.fn(),
    openSchedule: vi.fn(),
    closeSchedule: vi.fn(),
    loadTodos: vi.fn(),
    watchKanbanTasks: vi.fn(),
  }
  const useWorkspaceStore = () => state
  return { state, useWorkspaceStore }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

// ── 日程弹窗桩（组件本体属 cockpit 域，装配接线单独断言）──
const scheduleModal = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/custom/cockpit/components/CockpitScheduleModal.vue', () => ({
  default: { setup: () => { scheduleModal.count += 1 }, template: '<div class="schedule-modal-stub" />' },
}))

import AttentionStrip from '../components/AttentionStrip.vue'
import ActiveRunsCard from '../components/ActiveRunsCard.vue'
import InboxPreviewCard from '../components/InboxPreviewCard.vue'
import ScheduleCard from '../components/ScheduleCard.vue'
import MetricsCards from '../components/MetricsCards.vue'
import OverviewView from '../views/OverviewView.vue'
import { mergeAttention, type OverviewMetrics } from '../adapters/overview'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  workspaceStubs.state.tasks = []
  workspaceStubs.state.userTodos = []
  workspaceStubs.state.scheduleOpen = false
  scheduleModal.count = 0
})

// ── AttentionStrip ──
describe('AttentionStrip', () => {
  it('按归并行渲染条目（梯队 class + 文案），空表渲染空态文案', () => {
    const rows = mergeAttention([
      { id: 't1', title: '修登录页', status: 'blocked', priority: 0, createdAt: 1 },
      { id: 't2', title: '审文案', status: 'review', priority: null, createdAt: 2 },
    ])
    const withItems = mount(AttentionStrip, { props: { items: rows } })
    expect(withItems.findAll('.ia-attn__item')).toHaveLength(2)
    expect(withItems.find('.ia-attn__item--blocked').classes()).toContain('ia-attn__item--blocked')
    expect(withItems.text()).toContain('修登录页')

    const empty = mount(AttentionStrip, { props: { items: [] } })
    expect(empty.find('.ia-attn__empty').exists()).toBe(true)
  })

  it('点击条目 emit select 并携带 taskId', async () => {
    const rows = mergeAttention([{ id: 't9', title: '阻塞任务', status: 'blocked', priority: null, createdAt: 1 }])
    const wrapper = mount(AttentionStrip, { props: { items: rows } })
    await wrapper.find('.ia-attn__item').trigger('click')
    expect(wrapper.emitted('select')![0][0]).toMatchObject({ taskId: 't9', status: 'blocked' })
  })
})

// ── 卡片基类行为 ──
describe('ActiveRunsCard / InboxPreviewCard', () => {
  it('活跃运行卡：主数字 = running+awaiting，副行分解 + 最近活动 token；点击 emit open', async () => {
    const wrapper = mount(ActiveRunsCard, {
      props: { agg: { running: 2, awaiting: 1, lastActivityAt: '2026-09-10T10:00:00Z' }, now: Date.parse('2026-09-10T10:00:30Z') },
    })
    expect(wrapper.find('.ia-card__num').text()).toBe('3')
    expect(wrapper.text()).toContain('ia2.overview.awaitingPart')
    expect(wrapper.text()).toContain('runcenter.time.justNow')
    await wrapper.find('.ia-card').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('等你决策卡：awaiting 主数字 + 最久等待时长；零等待落 —', async () => {
    const NOW = Date.parse('2026-09-10T12:00:00Z')
    const busy = mount(InboxPreviewCard, {
      props: { agg: { awaiting: 2, longestWaitMs: 2 * 3_600_000 + 60_000 }, now: NOW },
    })
    expect(busy.find('.ia-card__num').text()).toBe('2')
    expect(busy.text()).toContain('2h 01m')
    await busy.find('.ia-card').trigger('click')
    expect(busy.emitted('open')).toHaveLength(1)

    const idle = mount(InboxPreviewCard, { props: { agg: { awaiting: 0, longestWaitMs: null }, now: NOW } })
    expect(idle.find('.ia-card__num').text()).toBe('0')
    expect(idle.text()).toContain('—')
  })
})

// ── ScheduleCard ──
describe('ScheduleCard', () => {
  const NOW = new Date(2026, 8, 10, 12, 0).getTime()

  it('只统计今日待办，下一条闹钟以 HH:mm+标题展示；点击 emit open', async () => {
    const wrapper = mount(ScheduleCard, {
      props: {
        todos: [
          { id: 'a', title: '明日事务', date: '2026-09-11', remindAt: NOW },
          { id: 'b', title: '下午评审', date: '2026-09-10', remindAt: new Date(2026, 8, 10, 15, 0).getTime() },
          { id: 'c', title: '无闹钟', date: '2026-09-10', remindAt: null },
        ],
        nowMs: NOW,
      },
    })
    expect(wrapper.find('.ia-card__num').text()).toBe('2')
    expect(wrapper.text()).toContain('⏰')
    expect(wrapper.text()).toContain('15:00')
    expect(wrapper.text()).toContain('下午评审')
    await wrapper.find('.ia-card').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('零待办渲染空态；已过闹钟不再作为"下一条"', () => {
    const empty = mount(ScheduleCard, { props: { todos: [], nowMs: NOW } })
    expect(empty.find('.ia-card__sub').text()).toContain('ia2.overview.scheduleEmpty')

    const past = mount(ScheduleCard, {
      props: { todos: [{ id: 'p', title: '已过期闹钟', date: '2026-09-10', remindAt: new Date(2026, 8, 10, 8, 0).getTime() }], nowMs: NOW },
    })
    expect(past.text()).not.toContain('8:00')
    expect(past.text()).not.toContain('08:00')
  })
})

// ── MetricsCards ──
describe('MetricsCards', () => {
  it('三项指标渲染：成功率百分比 / 平均耗时 / 熔断计数', () => {
    const metrics: OverviewMetrics = {
      successRate: 2 / 3, completed: 2, failed: 1,
      avgDurationMs: 1_200_000, durationSamples: 2, stuckCount: 3,
    }
    const wrapper = mount(MetricsCards, { props: { metrics } })
    expect(wrapper.text()).toContain('67%')
    expect(wrapper.text()).toContain('20m 00s')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.findAll('.ia-metrics__row')).toHaveLength(3)
  })

  it('无数据落 —（null 指标与 loading）', () => {
    const wrapper = mount(MetricsCards, { props: { metrics: null, loading: true } })
    expect(wrapper.text()).toContain('ia2.overview.metricLoading')
    const dashes = mount(MetricsCards, { props: { metrics: null, loading: false } })
    expect(dashes.text()).toContain('—')
  })
})

// ── OverviewView 装配 ──
function makeRouter(): Router {
  const stub = { template: '<div class="area-stub" />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', component: stub },
      { path: '/app/orchestrate', name: 'ia2.orchestrate', component: stub },
      { path: '/app/runs', name: 'ia2.runs', component: stub },
      { path: '/app/inbox', name: 'ia2.inbox', component: stub },
      { path: '/app/tasks', name: 'ia2.tasks', component: stub },
    ],
  })
}

describe('OverviewView — 首屏装配', () => {
  async function mountView() {
    const router = makeRouter()
    router.push('/app')
    await router.isReady()
    const wrapper = mount(OverviewView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, router }
  }

  it('布局：注意力条 → 四卡片一行 → 今日计划；数据源武装只发既有订阅/一次性拉取', async () => {
    workspaceStubs.state.tasks = [
      { id: 't1', title: '阻塞任务', status: 'blocked', priority: 0 },
    ]
    workspaceStubs.state.userTodos = [{ id: 'td1', title: '评审', date: '2026-09-10', remindAt: null }]
    loopRest.listLoops.mockResolvedValue([
      { id: 'l1', name: '晨检循环', status: 'idle', nextTickAt: new Date(Date.now() - 3_600_000).toISOString() },
    ])
    runRest.listRuns.mockResolvedValue([
      { runId: 'r1', graphId: 'g', status: 'running', updatedAt: new Date().toISOString() },
      { runId: 'r2', graphId: 'g', status: 'completed', updatedAt: new Date().toISOString() },
    ])
    runRest.replay.mockResolvedValue([])

    const { wrapper } = await mountView()
    // 注意力条收编 cockpit kanban 聚合（blocked 任务上条）
    expect(wrapper.find('.ia-attn').exists()).toBe(true)
    expect(wrapper.text()).toContain('阻塞任务')
    // 四卡片
    expect(wrapper.findAll('.ia-overview__cards > *')).toHaveLength(4)
    // 今日计划含到期 idle loop
    expect(wrapper.find('.ia-plan').exists()).toBe(true)
    expect(wrapper.text()).toContain('晨检循环')
    // 数据源武装：一次性 REST + 既有聚合 WS + 介入域订阅；无新轮询定时器
    expect(runRest.listRuns).toHaveBeenCalled()
    expect(runRest.replay).toHaveBeenCalled()
    expect(workspaceStubs.state.refreshAllBoards).toHaveBeenCalled()
    expect(workspaceStubs.state.initFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.startReminderScheduler).toHaveBeenCalled()
  })

  it('空态三步引导：零 run 零任务时出现，任一 run 存在即消失', async () => {
    runRest.listRuns.mockResolvedValue([])
    const { wrapper } = await mountView()
    expect(wrapper.find('.ia-guide').exists()).toBe(true)
    expect(wrapper.text()).toContain('ia2.overview.guideStep1')
    expect(wrapper.text()).toContain('ia2.overview.guideStep3')

    runRest.listRuns.mockResolvedValue([
      { runId: 'r1', graphId: 'g', status: 'completed', updatedAt: new Date().toISOString() },
    ])
    const { wrapper: withRun } = await mountView()
    expect(withRun.find('.ia-guide').exists()).toBe(false)
  })

  it('卡片点击跳区域；注意力条目跳工作项区带筛选预选（P3 Task 7）；日程卡打开原弹窗', async () => {
    workspaceStubs.state.tasks = [{ id: 't1', title: '待审任务', status: 'review', priority: null }]
    const { wrapper, router } = await mountView()

    const cards = wrapper.findAll('.ia-overview__cards > .ia-card')
    await cards[0].trigger('click')   // 活跃运行
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/runs')

    await wrapper.find('.ia-attn__item').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/tasks')
    // 深链预选：状态过滤器 + 任务搜索（TasksView 端消费写入看板过滤器）
    expect(router.currentRoute.value.query).toEqual({ status: 'review', task: 't1' })

    // 日程卡：cockpit store 单例开弹窗（生产 store 为响应式代理，此处断言动作接线）
    await cards[2].trigger('click')
    await flushPromises()
    expect(workspaceStubs.state.openSchedule).toHaveBeenCalled()
  })

  it('日程弹窗挂载：scheduleOpen 时视图内挂载原 CockpitScheduleModal（复用不复制）', async () => {
    workspaceStubs.state.scheduleOpen = true
    const { wrapper } = await mountView()
    expect(wrapper.find('.schedule-modal-stub').exists()).toBe(true)
  })

  it('状态分布行点击 → /app/tasks?status=:（装配级：emit payload 必须进路由 query，Task 8 修复回归）', async () => {
    workspaceStubs.state.tasks = [
      { id: 't1', title: 'a', status: 'blocked', priority: 0 },
      { id: 't2', title: 'b', status: 'running', priority: 1 },
    ]
    const { wrapper, router } = await mountView()
    const rows = wrapper.findAll('.ia-status-dist__row')
    // 主链序：running 在 blocked 前（STATUS_FLOW）
    expect(rows.map(r => r.attributes('data-status'))).toEqual(['running', 'blocked'])
    await rows[1].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/tasks')
    expect(router.currentRoute.value.query).toEqual({ status: 'blocked' })
  })
})
