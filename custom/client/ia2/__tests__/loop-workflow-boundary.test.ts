// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/loop-workflow-boundary.test.ts
// Task 3（2026-10-27 产品一致性）：Legacy Loop 与 Workflow Run 分域守门。
// 契约（spec 2026-10-27-product-coherence-refactor「Loop 与 Workflow」决策行）：
//   - Legacy Loop（cron/自治/预算，/api/loop/loops）→ /app/l/:loopId 薄详情
//     （复用 loopStore 与既有运行详情，不新建运行器；无运行时设置仍可见）；
//   - Workflow Run（/api/ia2/workflow/runs）→ ?wf=<runId>；
//   - 禁止跨 API 用裸 ID：blocked Loop 注意力行不得把 loopId 塞进 ?wf= 查工作流 API；
//   - Workflow 详情失败有错误+重试（不永久 loading）、列表失败不是空态、
//     取消 ?wf=new 要清 URL、首载有 running 时轮询 4s、创建成功 URL 更新真实 ID。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── 工作流 API 桩（分域断言的观测点）──
const wfApi = vi.hoisted(() => ({
  fetchWorkflowRuns: vi.fn(),
  fetchWorkflowRun: vi.fn(),
  startWorkflow: vi.fn(),
  deleteWorkflowRun: vi.fn(async () => {}),
}))
vi.mock('@/custom/ia2/workflow', () => ({
  fetchWorkflowRuns: wfApi.fetchWorkflowRuns,
  fetchWorkflowRun: wfApi.fetchWorkflowRun,
  startWorkflow: wfApi.startWorkflow,
  deleteWorkflowRun: wfApi.deleteWorkflowRun,
}))
vi.mock('@/custom/ia2/identity-chat', () => ({
  fetchIdentities: vi.fn(async () => [{ id: 'hermes-a', online: true }]),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// ── store 桩（模式对齐 workbench-flow.test.ts）──
const roomStubs = vi.hoisted(() => {
  const state = {
    sortedRooms: [{ roomId: '!r1:host', name: '应急指挥中心' }],
    getRoomUnreadCount: () => 0,
    getRoomMemberList: () => ({ admins: [], mods: [], invited: [], defaults: [] }),
    createRoom: vi.fn(async () => {}),
    selectRoom: vi.fn(),
  }
  return { state, useMatrixRoomStore: () => state }
})
vi.mock('@/custom/matrix-chat/stores/matrix-room', async () => {
  const { reactive } = await import('vue')
  roomStubs.state = reactive(roomStubs.state)
  return { useMatrixRoomStore: () => roomStubs.state }
})
const matrixClientStubs = vi.hoisted(() => {
  const state = {
    client: null as unknown,
    authenticated: true,
    syncState: '',
    refreshCredentials: vi.fn(),
    initClient: vi.fn(async () => {}),
  }
  return { state, useMatrixClientStore: () => state }
})
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: matrixClientStubs.useMatrixClientStore }))
const chatStubs = vi.hoisted(() => ({
  state: { sessions: [], unreadMessages: new Map() },
  useChatStore: () => chatStubs.state,
}))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: chatStubs.useChatStore }))
const kanbanStubs = vi.hoisted(() => ({
  state: { tasks: [], moveTask: vi.fn(), blockTask: vi.fn() },
  useKanbanStore: () => kanbanStubs.state,
}))
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: kanbanStubs.useKanbanStore }))
const workspaceStubs = vi.hoisted(() => ({
  state: {
    refreshAllBoards: vi.fn(async () => true),
    tasks: [],
    dailyTasks: [],
    simTasks: [],
    rawTasks: [],
  },
  useWorkspaceStore: () => workspaceStubs.state,
}))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))
const runsStubs = vi.hoisted(() => {
  const state = {
    runs: [] as Array<Record<string, unknown>>,
    sortedRuns: [] as Array<Record<string, unknown>>,
    resumeRun: vi.fn(),
  }
  return { state, useRunCenterStore: () => state }
})
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: runsStubs.useRunCenterStore }))
const cockpitStubs = vi.hoisted(() => ({
  state: { fleetSessions: [], respondFleetApproval: vi.fn(), openRunTraceGlobal: vi.fn() },
  useCockpitStore: () => cockpitStubs.state,
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))
vi.mock('@/api/hermes/kanban', () => ({
  completeTasks: vi.fn(async () => ({ results: [] })),
  blockTask: vi.fn(async () => ({})),
  reopenReview: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({
  loopRest: { getContracts: vi.fn(async () => []), listLoops: vi.fn(async () => []) },
}))
const popoutStubs = vi.hoisted(() => ({ openPanelWindow: vi.fn(async () => {}) }))
vi.mock('../wm/popout', () => ({ openPanelWindow: popoutStubs.openPanelWindow }))
vi.mock('@/custom/matrix-teams/stores/review-center', () => ({
  useReviewCenterStore: () => ({ pendingReviews: [], sendVerdict: vi.fn() }),
}))

// loopStore 桩：loops 喂 useSitCounts（blocked loop → 注意力行）；
// currentLoop/fetchLoop 喂 LegacyLoopView 薄详情。
const LOOP_FIXTURE = {
  id: 'lp-1', name: '每日分诊', goal: '每日 09:00 分诊收件箱', stopCondition: '连续 3 天零发现',
  pattern: 'daily-triage',
  schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'Asia/Shanghai' },
  stage: 'scheduling', status: 'blocked', autonomyLevel: 'L2', stateAdapter: 'local',
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-10-26T09:00:00Z',
  lastTickAt: null, nextTickAt: '2026-10-27T09:00:00Z',
  budget: { maxCostPerTick: 2, maxCostTotal: 50, killMode: 'notify', warningThreshold: 80 },
  stats: { totalIterations: 12, tasksDiscovered: 20, tasksCompleted: 15, tasksBlocked: 1, totalCost: 9.5, currentIteration: 12 },
} as const
const BLOCKED_LOOP = { ...LOOP_FIXTURE, id: 'lp-9', name: '受阻的循环', status: 'blocked' }
const loopStubs = vi.hoisted(() => {
  const state = {
    loops: [] as Array<Record<string, unknown>>,
    currentLoop: null as Record<string, unknown> | null,
    currentContracts: [] as unknown[],
    currentEvents: [] as unknown[],
    loading: false,
    error: null as string | null,
    fetchLoop: vi.fn(async (id: string) => {
      state.currentLoop = state.loops.find(l => l.id === id) ?? null
    }),
  }
  return { state, useLoopStore: () => state }
})
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: loopStubs.useLoopStore }))
const groupStubs = vi.hoisted(() => ({
  state: { rooms: [], messages: [] as unknown[], setUserInfo: vi.fn(), createNewRoom: vi.fn(async () => ({})), deleteRoom: vi.fn(async () => {}) },
  useGroupChatStore: () => groupStubs.state,
}))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: groupStubs.useGroupChatStore }))
const registryStubs = vi.hoisted(() => ({
  state: { duties: {}, accounts: [] },
  useTeamRegistryStore: () => registryStubs.state,
}))
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({ useTeamRegistryStore: registryStubs.useTeamRegistryStore }))

vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({
  default: { name: 'KanbanTaskDrawer', props: ['show', 'taskId'], template: '<div class="drawer-stub" v-if="show" />' },
}))
vi.mock('@/custom/matrix-chat/components/MatrixRoomCanvas.vue', () => ({
  default: { name: 'MatrixRoomCanvas', template: '<div class="room-canvas-stub" />' },
}))
vi.mock('@/views/hermes/ChatView.vue', () => ({ default: { name: 'ChatView', template: '<div class="chat-view-stub" />' } }))
vi.mock('@/views/hermes/GroupChatView.vue', () => ({ default: { name: 'GroupChatView', template: '<div class="group-view-stub" />' } }))
// 创建向导桩：按钮触发 created 事件（onLoopCreated 深链分派）
vi.mock('@/custom/loop/components/LoopCreateWizard.vue', () => ({
  default: {
    name: 'LoopCreateWizard',
    emits: ['close', 'created'],
    template: '<button type="button" data-testid="wizard-stub-created" @click="$emit(\'created\', \'lp-new\')">created</button>',
  },
}))

import WorkbenchView from '../views/WorkbenchView.vue'
import WorkflowPanel from '../components/WorkflowPanel.vue'
import FlowNavPanel from '../components/flow/FlowNavPanel.vue'
import LegacyLoopView from '../views/LegacyLoopView.vue'
import { buildIaRoutes } from '../routes'

const RUNNING_RUN = {
  id: 'wf-r1', name: '夜巡工作流', mode: 'serial', status: 'running', createdAt: 1,
  steps: [{ targetKind: 'identity', ref: 'hermes-a', instructions: 'x', status: 'running' }],
}
const DONE_RUN = {
  id: 'wf-d1', name: '已完工作流', mode: 'parallel', status: 'done', createdAt: 1,
  steps: [{ targetKind: 'identity', ref: 'hermes-a', instructions: 'x', status: 'ok' }],
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
  wfApi.fetchWorkflowRuns.mockResolvedValue([])
  wfApi.fetchWorkflowRun.mockResolvedValue(null)
  wfApi.startWorkflow.mockResolvedValue(null)
  loopStubs.state.loops = []
  loopStubs.state.currentLoop = null
  loopStubs.state.error = null
  loopStubs.state.loading = false
  runsStubs.state.runs = []
  runsStubs.state.sortedRuns = []
})

// ── 分域契约：路由表 ────────────────────────────────────────────────

describe('Loop/Workflow 分域 — 路由契约', () => {
  it('/app/l/:loopId 是组件路由（Legacy Loop 薄详情），不再是丢参重定向', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildIaRoutes() })
    const resolved = router.resolve('/app/l/lp-1')
    expect(resolved.name).toBe('ia2.loopCanvas')
    expect(resolved.params.loopId).toBe('lp-1')
    const record = resolved.matched[resolved.matched.length - 1]
    expect(record?.redirect, '/app/l 不得再是重定向（曾丢 loopId）').toBeFalsy()
    const loader = record?.components?.default as unknown as () => Promise<{ default: unknown }>
    expect(typeof loader).toBe('function')
    const mod = await loader()
    expect(mod.default).toBe(LegacyLoopView)
  })
})

// ── LegacyLoopView 薄详情 ────────────────────────────────────────────

describe('LegacyLoopView — Loop 薄详情（/app/l/:loopId）', () => {
  function makeLoopRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/app',
        component: { template: '<router-view />' },
        children: [
          { path: '', name: 'ia2.collab', component: { template: '<div collab />' } },
          { path: 'l/:loopId', name: 'ia2.loopCanvas', component: LegacyLoopView },
          { path: 'runs/:runId', name: 'ia2.runDetail', component: { template: '<div run-detail />' } },
        ],
      }],
    })
  }

  async function mountLoop(path: string) {
    const router = makeLoopRouter()
    router.push(path)
    await router.isReady()
    const wrapper = mount(LegacyLoopView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, router }
  }

  it('无运行时设置可见：cron 调度/自治级别/预算渲染，运行区给「尚未产生运行」空态', async () => {
    loopStubs.state.loops = [LOOP_FIXTURE]
    runsStubs.state.sortedRuns = []
    const { wrapper } = await mountLoop('/app/l/lp-1')
    const settings = wrapper.find('[data-testid="legacy-loop-settings"]')
    expect(settings.exists()).toBe(true)
    expect(settings.text()).toContain('0 9 * * *')
    expect(settings.text()).toContain('L2')
    expect(settings.text()).toContain('50')
    expect(wrapper.find('[data-testid="legacy-loop-runs-empty"]').exists()).toBe(true)
  })

  it('有运行时列运行行；点击跳既有运行详情 ia2.runDetail（不新建运行器）', async () => {
    loopStubs.state.loops = [LOOP_FIXTURE]
    runsStubs.state.sortedRuns = [
      { runId: 'run-77', graphId: 'loop-lp-1', status: 'running', updatedAt: null, stage: null, iteration: 3, lastActivityAt: null, cost: 1.5, events: [], pendingInterruptId: null },
      { runId: 'run-76', graphId: 'other-graph', status: 'done', updatedAt: null, stage: null, iteration: 0, lastActivityAt: null, cost: 0, events: [], pendingInterruptId: null },
    ]
    const { wrapper, router } = await mountLoop('/app/l/lp-1')
    expect(wrapper.find('[data-testid="legacy-loop-run-run-77"]').exists()).toBe(true)
    // 他图运行不串门
    expect(wrapper.find('[data-testid="legacy-loop-run-run-76"]').exists()).toBe(false)
    await wrapper.find('[data-testid="legacy-loop-run-run-77"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.runDetail')
    expect(router.currentRoute.value.params.runId).toBe('run-77')
  })

  it('载入失败：错误可见 + 重试可再拉（不永久 loading）', async () => {
    loopStubs.state.loops = []
    loopStubs.state.fetchLoop.mockImplementation(async () => {
      loopStubs.state.currentLoop = null
      loopStubs.state.error = 'HTTP 404'
    })
    const { wrapper } = await mountLoop('/app/l/lp-404')
    const err = wrapper.find('[data-testid="legacy-loop-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('HTTP 404')
    await wrapper.find('[data-testid="legacy-loop-retry"]').trigger('click')
    await flushPromises()
    expect(loopStubs.state.fetchLoop).toHaveBeenCalledTimes(2)
  })
})

// ── WorkbenchView 分域跳转 ───────────────────────────────────────────

describe('WorkbenchView — 分域跳转（Loop ≠ Workflow）', () => {
  function makeWbRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/app',
        component: { template: '<router-view />' },
        children: [
          { path: '', name: 'ia2.collab', component: WorkbenchView },
          { path: 'l/:loopId', name: 'ia2.loopCanvas', component: { template: '<div loop-detail />' } },
          { path: 'runs/:runId', name: 'ia2.runDetail', component: { template: '<div run-detail />' } },
          { path: 'board', name: 'ia2.board', component: { template: '<div board />' } },
        ],
      }, {
        path: '/ide',
        name: 'ide.shell',
        component: { template: '<div ide />' },
      }],
    })
  }

  async function mountWb(path: string) {
    const router = makeWbRouter()
    router.push(path)
    await router.isReady()
    const wrapper = mount(WorkbenchView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, router }
  }

  it('blocked Loop 注意力行 → /app/l/:loopId；不把 loopId 塞 ?wf= 查工作流 API', async () => {
    loopStubs.state.loops = [BLOCKED_LOOP]
    const { wrapper, router } = await mountWb('/app')
    const row = wrapper.find('[data-testid="att-att-loop:lp-9"]')
    expect(row.exists(), 'blocked loop 应产生注意力行').toBe(true)
    wfApi.fetchWorkflowRun.mockClear()
    await row.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.loopCanvas')
    expect(router.currentRoute.value.params.loopId).toBe('lp-9')
    expect(router.currentRoute.value.query.wf).toBeUndefined()
    // 跨域裸 ID 断言：loopId 从未进工作流详情 API
    expect(wfApi.fetchWorkflowRun).not.toHaveBeenCalled()
  })

  it('创建向导成功 → 深链 /app/l/:loopId（路由命中且 loopId 不丢）', async () => {
    const { wrapper, router } = await mountWb('/app')
    await wrapper.find('[data-testid="wb-loop-wizard-entry"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wizard-stub-created"]').exists()).toBe(true)
    await wrapper.find('[data-testid="wizard-stub-created"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.loopCanvas')
    expect(router.currentRoute.value.params.loopId).toBe('lp-new')
  })

  it('Workflow 创建成功 → URL 更新为真实运行 ID（?wf=new 不残留）', async () => {
    wfApi.startWorkflow.mockResolvedValue({ ...RUNNING_RUN, id: 'wf-created' })
    wfApi.fetchWorkflowRun.mockResolvedValue({ ...RUNNING_RUN, id: 'wf-created' })
    const { wrapper, router } = await mountWb('/app?wf=new')
    expect(wrapper.find('[data-testid="wf-composer"]').exists()).toBe(true)
    await wrapper.find('[data-testid="wf-run-btn"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.wf).toBe('wf-created')
    expect(router.currentRoute.value.query.wf).not.toBe('new')
  })

  it('取消新建 → ?wf=new 从 URL 清除（不留半开深链）', async () => {
    const { wrapper, router } = await mountWb('/app?wf=new')
    expect(wrapper.find('[data-testid="wf-composer"]').exists()).toBe(true)
    await wrapper.find('[data-testid="wf-cancel"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.wf).toBeUndefined()
  })
})

// ── WorkflowPanel 行为加固 ───────────────────────────────────────────

describe('WorkflowPanel — 错误/重试/轮询', () => {
  it('首载有 running：轮询重排为 4s（修复前首载空列表先排 30s）', async () => {
    vi.useFakeTimers()
    try {
      wfApi.fetchWorkflowRuns.mockResolvedValue([RUNNING_RUN])
      const w = mount(WorkflowPanel)
      await flushPromises()
      expect(wfApi.fetchWorkflowRuns).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(4000)
      await flushPromises()
      expect(wfApi.fetchWorkflowRuns, '首载 running 应在 4s 处二次拉取').toHaveBeenCalledTimes(2)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('列表失败显示错误态（可重试），不得伪装成「还没有工作流」空态', async () => {
    wfApi.fetchWorkflowRuns.mockRejectedValue(new Error('HTTP 500'))
    const w = mount(WorkflowPanel)
    await flushPromises()
    const err = w.find('[data-testid="wf-list-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('HTTP 500')
    expect(w.text()).not.toContain('还没有工作流')
    wfApi.fetchWorkflowRuns.mockResolvedValue([DONE_RUN])
    await w.find('[data-testid="wf-list-retry"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="wf-list-error"]').exists()).toBe(false)
    expect(w.text()).toContain('已完工作流')
  })

  it('详情失败：错误 + 重试（不永久 loading）；重试成功渲染详情', async () => {
    wfApi.fetchWorkflowRun.mockRejectedValueOnce(new Error('HTTP 404')).mockResolvedValue(DONE_RUN)
    const w = mount(WorkflowPanel, { props: { runId: 'wf-d1' } })
    await flushPromises()
    const err = w.find('[data-testid="wf-detail-error"]')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('HTTP 404')
    await w.find('[data-testid="wf-detail-retry"]').trigger('click')
    await flushPromises()
    expect(wfApi.fetchWorkflowRun).toHaveBeenCalledTimes(2)
    expect(w.find('[data-testid="wf-detail"]').exists()).toBe(true)
  })

  it('左栏 FlowNavPanel 同源：首载 running 也走 4s 轮询；失败不显示为空列表', async () => {
    vi.useFakeTimers()
    try {
      wfApi.fetchWorkflowRuns.mockResolvedValue([RUNNING_RUN])
      const w = mount(FlowNavPanel, {
        props: { sessions: [], loops: [], selection: null },
      })
      await flushPromises()
      expect(wfApi.fetchWorkflowRuns).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(4000)
      await flushPromises()
      expect(wfApi.fetchWorkflowRuns, 'FlowNavPanel 首载 running 应在 4s 处二次拉取').toHaveBeenCalledTimes(2)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
    wfApi.fetchWorkflowRuns.mockRejectedValue(new Error('HTTP 502'))
    const w2 = mount(FlowNavPanel, { props: { sessions: [], loops: [], selection: null } })
    await flushPromises()
    expect(w2.find('[data-testid="wf-nav-error"]').exists(), '左栏列表失败应显示错误提示').toBe(true)
    w2.unmount()
  })
})
