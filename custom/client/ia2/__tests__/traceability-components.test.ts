// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/traceability-components.test.ts
// P3 Task 7 — 双向关联 + 追溯矩阵组件 jsdom 冒烟：
//   RunLinks             任务详情"来源 run"（反查命中 → runId 深链 / 空态 / 失败态）
//   TraceabilityMatrix   追溯矩阵（loop 分组表渲染 / run 深链 / 任务回看板 open-task / 失败重试）
//   NodeInspector        persistence 节点产物任务链接（run → 任务深链 /app/tasks?task=）
//   TasksView            页签切换 + 深链预选（?tab/status/task → kanban store 过滤器）
// REST 与重 store 全桩（同 orchestrate/overview 冒烟纪律）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── loop/run REST 桩（loopRest 被 RunLinks/TraceabilityMatrix 消费；
//    runRest 被 runcenter store 与 NodeInspector 消费）──
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
// TasksView 的看板页签重组件打桩（import 链带上游 vite define + 重 store，装配接线在
// ia-views.test 单独断言；本文件聚焦页签/预选/矩阵行为）
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { template: '<div class="kanban-stub" />' },
}))

import RunLinks from '../components/RunLinks.vue'
import TraceabilityMatrix from '../components/TraceabilityMatrix.vue'
import NodeInspector from '@/custom/loop/runcenter/components/NodeInspector.vue'
import TasksView from '../views/TasksView.vue'
import type { TraceLoopEvent } from '../adapters/traceability'
import type { RunGraphNode, ReplayEventLike } from '@/custom/loop/runcenter/adapters/run-graph'

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
      { path: '/app/tasks', name: 'ia2.tasks', component: { template: '<div tasks />' } },
      { path: '/app/runs/:runId', name: 'ia2.runDetail', component: { template: '<div run />' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  loopRest.listLoops.mockResolvedValue([])
  loopRest.getEvents.mockResolvedValue([])
  runRest.listRuns.mockResolvedValue([])
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

// ---------------------------------------------------------------------------
// TraceabilityMatrix（追溯矩阵页签本体）
// ---------------------------------------------------------------------------

describe('TraceabilityMatrix', () => {
  function matrixStubs() {
    kanbanState.tasks = [
      { id: 't_1', title: '修登录页', status: 'done' },
    ]
  }

  it('loop 分组表渲染：goal/run 徽标/迭代/任务标题/验证轮次', async () => {
    loopRest.listLoops.mockResolvedValue([{ id: 'l1', name: 'Alpha', goal: '修复登录' }])
    loopRest.getEvents.mockResolvedValue([
      { type: 'loop.tick-complete', ts: '2026-09-09T10:00:00Z', loopId: 'l1', iteration: 1 },
      { type: 'loop.verification-complete', ts: '2026-09-10T09:00:00Z', loopId: 'l1', contractId: 'task/a', passed: false },
      { type: 'loop.verification-complete', ts: '2026-09-10T09:30:00Z', loopId: 'l1', contractId: 'task/a', passed: true },
      PERSIST({ contractId: 'task/a', taskId: 't_1', runId: 'run-l1-2' }),
    ])
    runRest.listRuns.mockResolvedValue([
      { runId: 'run-l1-2', graphId: 'loop-l1', status: 'completed', updatedAt: '2026-09-10T10:05:00Z' },
    ])
    matrixStubs()
    const router = makeRouter()
    const wrapper = mount(TraceabilityMatrix, { global: { plugins: [router] } })
    await flushPromises()

    const group = wrapper.find('[data-loop-id="l1"]')
    expect(group.exists()).toBe(true)
    expect(group.find('.ia-trace__name').text()).toBe('Alpha')
    expect(group.find('.ia-trace__goal').text()).toBe('修复登录')
    expect(group.find('.ia-trace__runlink').text()).toBe('run-l1-2')
    expect(group.find('.ia-trace__iter').text()).toBe('#2')
    expect(group.find('.ia-trace__tasklink').text()).toBe('修登录页')
    expect(group.find('.ia-trace__rounds').text()).toContain('1/2')
    expect(runRest.listRuns).toHaveBeenCalled()
  })

  it('任务点击 emit open-task 携带 taskId（宿主切回看板定位）；run 点击深链运行详情', async () => {
    loopRest.listLoops.mockResolvedValue([{ id: 'l1', name: 'A', goal: 'g' }])
    loopRest.getEvents.mockResolvedValue([
      PERSIST({ contractId: 'task/a', taskId: 't_1', runId: 'run-l1-1' }),
    ])
    matrixStubs()
    const router = makeRouter()
    const wrapper = mount(TraceabilityMatrix, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('.ia-trace__tasklink').trigger('click')
    expect(wrapper.emitted('open-task')![0]).toEqual(['t_1'])
    await wrapper.find('.ia-trace__runlink').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/runs/run-l1-1')
  })

  it('listLoops 整体失败 → 失败态 + 重试；空 loop 列表 → 空态', async () => {
    loopRest.listLoops.mockRejectedValue(new Error('api down'))
    const router = makeRouter()
    matrixStubs()
    const failed = mount(TraceabilityMatrix, { global: { plugins: [router] } })
    await flushPromises()
    expect(failed.find('.ia-trace__failed').exists()).toBe(true)

    loopRest.listLoops.mockResolvedValue([])
    const empty = mount(TraceabilityMatrix, { global: { plugins: [router] } })
    await flushPromises()
    expect(empty.find('.ia-trace__empty-title').exists()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// NodeInspector（run → 任务，persistence 节点）
// ---------------------------------------------------------------------------

describe('NodeInspector 产物任务链接', () => {
  const events: ReplayEventLike[] = [
    { kind: 'run.started', ts: 1 },
    { kind: 'loop.persisted', ts: 2, payload: { contractId: 'task/a', artifact: 'kanban:t_9', taskId: 't_9' } },
  ]
  const node = (id: string) => ({
    id, type: 'function', status: 'done', iteration: 1, durationMs: 10,
  } as unknown as RunGraphNode)

  it('persistence 节点 + 事件流含 taskId → 渲染产物任务链接，点击深链工作项', async () => {
    const router = makeRouter()
    const wrapper = mount(NodeInspector, {
      props: { node: node('persistence'), events, runId: 'run-1' },
      global: { plugins: [router] },
    })
    await flushPromises()
    const section = wrapper.find('[data-persisted-tasks]')
    expect(section.exists()).toBe(true)
    expect(section.find('.ni-panel__task-link').text()).toBe('t_9')
    await section.find('.ni-panel__task-link').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/tasks?task=t_9')
  })

  it('非 persistence 节点不渲染；payload 缺 taskId 的事件不产生链接', async () => {
    const router = makeRouter()
    const other = mount(NodeInspector, {
      props: { node: node('validation'), events, runId: 'run-1' },
      global: { plugins: [router] },
    })
    expect(other.find('[data-persisted-tasks]').exists()).toBe(false)

    const legacy = mount(NodeInspector, {
      props: { node: node('persistence'), events: [{ kind: 'loop.persisted', ts: 1, payload: { contractId: 'task/a' } }], runId: 'run-1' },
      global: { plugins: [router] },
    })
    await flushPromises()
    expect(legacy.find('[data-persisted-tasks]').exists()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TasksView（页签 + 深链预选）
// ---------------------------------------------------------------------------

describe('TasksView 页签与深链预选', () => {
  it('默认看板页签；切追溯页签挂矩阵；query 预选 status/task 写入看板过滤器', async () => {
    const router = makeRouter()
    await router.push('/app/tasks?status=blocked&task=t_42')
    await router.isReady()
    const wrapper = mount(TasksView, { global: { plugins: [router] } })
    expect(kanbanState.filterStatus).toBe('blocked')
    expect(kanbanState.searchQuery).toBe('t_42')

    await wrapper.find('[data-testid="ia-tasks-tab-trace"]').trigger('click')
    expect(wrapper.find('[data-testid="ia-trace"]').exists()).toBe(true)
    expect(wrapper.find('.kanban-stub').exists()).toBe(false)
  })

  it('非法 status/未知 tab 忽略不炸；追溯任务点击切回看板并预选搜索', async () => {
    const router = makeRouter()
    await router.push('/app/tasks?status=not-a-status&tab=weird')
    await router.isReady()
    const wrapper = mount(TasksView, { global: { plugins: [router] } })
    expect(kanbanState.filterStatus).toBeNull()
    expect(wrapper.find('.kanban-stub').exists()).toBe(true)

    await wrapper.find('[data-testid="ia-tasks-tab-trace"]').trigger('click')
    // 模拟矩阵 open-task：切回看板 + 搜索预选（经 emit 触发宿主行为）
    ;(wrapper.findComponent({ name: 'TraceabilityMatrix' }).vm as unknown as {
      $emit: (e: string, ...a: unknown[]) => void
    }).$emit('open-task', 't_77')
    await wrapper.vm.$nextTick()
    expect(kanbanState.searchQuery).toBe('t_77')
    expect(wrapper.find('.kanban-stub').exists()).toBe(true)
  })
})
