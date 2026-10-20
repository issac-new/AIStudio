// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/traceability-components.test.ts
// P3 Task 7 — 双向关联 + 追溯矩阵组件 jsdom 冒烟：
//   RunLinks             任务详情"来源 run"（反查命中 → runId 深链 / 空态 / 失败态）
// REST 与重 store 全桩（同 orchestrate/overview 冒烟纪律）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── loop/run REST 桩（本文件仅 RunLinks 消费 loopRest；runRest 桩保留供同链组件复用）──
const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [] as Array<{ runId: string; graphId: string; status: string; updatedAt: string | null }>),
    // getMind 默认「图不可用」（合法空态）；失败场景用例内覆写为 reject
    getMind: vi.fn(async () => ({ available: false, thoughts: [], relations: [], runs: [] })),
    replay: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
    forkRun: vi.fn(async () => ({ runId: 'f', forkedFrom: 'x', superStep: 0 })),
    startRun: vi.fn(async () => ({ runId: 'f', instance: {} })),
    exportRun: vi.fn(async () => ({ run: {}, spec: null, events: [] })),
    getSpec: vi.fn(async () => null),
  },
  loopRest: {
    listLoops: vi.fn(async () => [] as Array<{ id: string; name?: string; goal?: string }>),
    getEvents: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
  },
}))

vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest,
  connectGraph: vi.fn(() => ({ connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })),
  disconnectGraph: vi.fn(),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))
// naive-ui NSpin 桩（jsdom 无需真实加载动画）
vi.mock('naive-ui', () => ({ NSpin: { template: '<div class="nspin-stub" />' } }))
// 看板页签重组件打桩（import 链带上游 vite define + 重 store；本文件已不挂载，桩保留
// ia-views.test 单独断言；本文件聚焦页签/预选/矩阵行为）
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { props: ['openTaskId', 'autoOpenCreate'], template: '<div class="kanban-stub" :data-open-task="openTaskId" />' },
}))
// 全链路追踪页签（2026-10-01）：RunTraceOverview 打桩（useKanbanTaskGraph 数据面
// 与弹窗态链重；页签接线守门在此，面板实体由 cockpit 域测试覆盖）
vi.mock('@/custom/cockpit/components/RunTraceOverview.vue', () => ({
  default: {
    name: 'RunTraceOverview',
    template: '<div class="rto-stub" data-testid="rto-stub" @click="$emit(\'select-session\', \'sess-1\'); $emit(\'close\')" />',
    emits: ['select-session', 'close'],
  },
}))
// cockpit store 桩（历史挂载面已退役；桩保留避免 import 链回潮）
const cockpitOpenTrace = vi.hoisted(() => vi.fn())
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({ openRunTrace: cockpitOpenTrace }),
}))

import RunLinks from '../components/RunLinks.vue'
import type { TraceLoopEvent } from '../adapters/traceability'

// ── kanban store 状态桩（真身 import 链带上游 vite define，单测不可达——
//    同 cockpit-attention 纪律整桩替换；filterStatus/searchQuery 记录预选写入）──
const kanbanState = vi.hoisted(() => ({
  tasks: [] as Array<{ id: string; title: string; status: string }>,
  filterStatus: null as string | null,
  searchQuery: '',
  fetchTasks: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({
    get tasks() { return kanbanState.tasks },
    set tasks(v: Array<{ id: string; title: string; status: string }>) { kanbanState.tasks = v },
    get filterStatus() { return kanbanState.filterStatus },
    get searchQuery() { return kanbanState.searchQuery },
    setStatusFilter: (s?: string) => { kanbanState.filterStatus = s || null },
    setSearchQuery: (q: string) => { kanbanState.searchQuery = q },
    fetchTasks: kanbanState.fetchTasks,
  }),
}))

const PERSIST = (over: Partial<TraceLoopEvent>): TraceLoopEvent => ({
  type: 'loop.persisted', ts: '2026-09-10T10:00:00Z', loopId: 'l1', contractId: 'task/a', ...over,
})

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/board', name: 'ia2.board', component: { template: '<div tasks />' } },
      { path: '/app/runs/:runId', name: 'ia2.runDetail', component: { template: '<div run />' } },
      // A0 三中心拆分：迁出签深链重定向落点桩（trace/accounts/observatory →
      // 推演中心签；组件实体由 sim 侧测试覆盖，此处只断言导航不死链）
      { path: '/app/sim', name: 'ia2.sim', component: { template: '<div sim />' } },
      { path: '/app/sim/trace', name: 'ia2.simTrace', component: { template: '<div sim-trace />' } },
      { path: '/app/sim/delivery', name: 'ia2.simDelivery', component: { template: '<div sim-delivery />' } },
      { path: '/app/sim/ops', name: 'ia2.simOps', component: { template: '<div sim-ops />' } },
      { path: '/app/gov', name: 'ia2.governance', component: { template: '<div gov />' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  loopRest.listLoops.mockResolvedValue([])
  loopRest.getEvents.mockResolvedValue([])
  kanbanState.tasks = []
  kanbanState.filterStatus = null
  kanbanState.searchQuery = ''
})

// ---------------------------------------------------------------------------
// RunLinks（任务 → run）
// ---------------------------------------------------------------------------

describe('RunLinks', () => {
  it('show=false 不渲染不发请求；打开后反查命中 → runId 深链', async () => {
    loopRest.listLoops.mockResolvedValue([{ id: 'l1', name: 'A', goal: 'g' }])
    loopRest.getEvents.mockResolvedValue([
      PERSIST({ contractId: 'task/a', taskId: 't_9', runId: 'run-l1-1', artifact: 'kanban:t_9' }),
    ])
    const router = makeRouter()
    const hidden = mount(RunLinks, { props: { taskId: 't_9', show: false }, global: { plugins: [router] } })
    expect(hidden.find('[data-testid="ia-runlinks"]').exists()).toBe(false)
    expect(loopRest.listLoops).not.toHaveBeenCalled()

    const wrapper = mount(RunLinks, { props: { taskId: 't_9', show: true }, global: { plugins: [router] } })
    await flushPromises()
    expect(loopRest.listLoops).toHaveBeenCalledTimes(1)
    const item = wrapper.find('.ia-runlinks__item')
    expect(item.exists()).toBe(true)
    expect(item.text()).toContain('run-l1-1')
    await item.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/runs/run-l1-1')
  })

  it('无关联渲染空态；反查失败且零命中渲染失败态（不误报"无关联"）', async () => {
    loopRest.listLoops.mockResolvedValue([{ id: 'l1' }])
    loopRest.getEvents.mockResolvedValue([PERSIST({ contractId: 'task/x', taskId: 't_other', runId: 'run-1' })])
    const router = makeRouter()
    const empty = mount(RunLinks, { props: { taskId: 't_none', show: true }, global: { plugins: [router] } })
    await flushPromises()
    expect(empty.find('.ia-runlinks__muted').exists()).toBe(true)

    loopRest.getEvents.mockRejectedValue(new Error('down'))
    const failed = mount(RunLinks, { props: { taskId: 't_none', show: true }, global: { plugins: [router] } })
    await flushPromises()
    expect(failed.find('.ia-runlinks__error').exists()).toBe(true)
  })
})
