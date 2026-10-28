// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/daily-workbench-coherence.test.ts
// Task 4（2026-10-27 产品一致性）：日常阶段语义与工作台注意力守门。
// 契约（spec 2026-10-27-product-coherence-refactor「日常阶段语义」决策行）：
//   - 旅程首页（JourneyView）= 日常口径：五步读真实配置信号（daily-setup-signals），
//     交付阶段读跨板任务状态；不再把最近推演 run 当日常完成度；
//   - dailyStageState 的 done 语义 =「已流转」（后续阶段有工作），侧栏/阶段页/
//     首页不得画绿✓或「已完成」；
//   - Workbench 无路由选择时不隐式选首会话：中栏中性空态、对象标题区无房间名，
//     flow.select(null)；wf/loop 分域跳转（Task 3）保留；
//   - useAttentionRows({ includeWaitItems }) 局部选择：Workbench 右栏排除已在
//     决策队列的项，顶条/侧栏徽标默认口径不变；
//   - TaskDecisionPanel「待我处理」计数与行按业务键去重；分组空态只描述本分组；
//   - StageSetupSteps 无信号时隐藏 0/5 计数；
//   - Task 2 移交：日常面板（trace/g5/delivery）与页头跳转只解析 daily——
//     同 board 同 taskId 的 sim 行不混入、不覆盖。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router, type RouteRecordRaw } from 'vue-router'

// ── 真实 workspace store 的数据面桩（模式对齐 task-identity.test.ts）──
const ctx = vi.hoisted(() => {
  const dailyRaw = (over: Record<string, unknown> = {}) => ({
    id: 'shared', title: '日常验收', status: 'review', assignee: 'me', priority: 2,
    created_at: 100, completed_at: null, started_at: null, last_heartbeat_at: null,
    tenant: null, session_id: null, workspace_path: '/daily', branch_name: 'daily-branch',
    body: null, result: null, ...over,
  })
  const toCockpitTask = vi.fn((task: { id: string; title: string; status: string; assignee: string | null; workspace_path: string | null; tenant: string | null; created_at: number }, board: string) => ({
    id: task.id,
    title: task.title,
    priority: 'P2' as const,
    status: task.status,
    assignee: task.assignee,
    workspace: task.workspace_path,
    tenant: task.tenant,
    boardSlug: board,
    createdAt: task.created_at * 1000,
    sessionId: null,
  }))
  return {
    dailyRaw, toCockpitTask,
    teams: { fetchKanbanOverview: vi.fn() },
    simObserver: { fetchSimObserverOverview: vi.fn() },
    fleet: { connectOverviewStream: vi.fn(() => ({ close: vi.fn() })) },
    kanbanApi: { listBoards: vi.fn(async () => []), listTasks: vi.fn(async () => []) },
    adminRegistry: { fetchRegistry: vi.fn(), saveRegistry: vi.fn() },
    profiles: { fetchProfiles: vi.fn() },
  }
})
vi.mock('@/custom/shared/adapters/teams-adapter', () => ctx.teams)
vi.mock('@/custom/shared/adapters/fleet-adapter', () => ctx.fleet)
vi.mock('@/custom/shared/adapters/task-adapter', () => ({ toCockpitTask: ctx.toCockpitTask }))
vi.mock('@/api/hermes/kanban', () => ctx.kanbanApi)
vi.mock('@/custom/shared/api/sim-observer', () => ctx.simObserver)
vi.mock('@/custom/shared/store/cockpit-kv', () => ({
  loadUserTodos: vi.fn(() => []), saveUserTodos: vi.fn(),
}))
// 日常搭建信号两源（daily-setup-signals 动态 import，同样被拦截）
vi.mock('@/custom/governance/api/adminRegistry', () => ctx.adminRegistry)
vi.mock('@/api/hermes/profiles', () => ctx.profiles)
// run-state 读取面：日常首页不得再打 sim run-state（旧实现 ?run=r 即拉）
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

// ── 其余 store 桩（形状对齐 loop-workflow-boundary.test.ts / ia-shell-header-sit.test.ts）──
const roomStubs = vi.hoisted(() => {
  const state = {
    sortedRooms: [{ roomId: '!r1:host', name: '应急指挥中心' }] as Array<{ roomId: string; name: string }>,
    getRoomUnreadCount: () => 0,
    getRoomMemberList: () => ({ admins: [], mods: [], invited: [], defaults: [] }),
    activeRoomMessages: [] as unknown[],
    selectRoom: vi.fn(),
    refreshRoomList: vi.fn(),
    createRoom: vi.fn(async () => {}),
  }
  return { state, useMatrixRoomStore: () => state }
})
vi.mock('@/custom/matrix-chat/stores/matrix-room', async () => {
  roomStubs.state = reactive(roomStubs.state)
  return { useMatrixRoomStore: roomStubs.useMatrixRoomStore }
})
const matrixClientStubs = vi.hoisted(() => {
  const state = {
    client: null as unknown,
    authenticated: true,
    refreshCredentials: vi.fn(),
    initClient: vi.fn(async () => {}),
  }
  return { state, useMatrixClientStore: () => state }
})
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: matrixClientStubs.useMatrixClientStore }))
const chatStubs = vi.hoisted(() => {
  const state = { sessions: [{ id: 'sess-1', title: 'agent 会话', updatedAt: 1700 }], unreadMessages: new Map() }
  return { state, useChatStore: () => chatStubs.state }
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: chatStubs.useChatStore }))
vi.mock('@/stores/hermes/group-chat', () => ({
  useGroupChatStore: () => ({ rooms: [], messages: [], setUserInfo: vi.fn(), createNewRoom: vi.fn(async () => ({})), deleteRoom: vi.fn(async () => {}) }),
}))
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({
  useTeamRegistryStore: () => ({ duties: {}, accounts: [] }),
}))
vi.mock('@/custom/matrix-teams/stores/review-center', () => ({
  useReviewCenterStore: () => ({ pendingReviews: [], sendVerdict: vi.fn() }),
}))
const cockpitStubs = vi.hoisted(() => {
  const state = {
    searchQuery: '', runSearch: vi.fn(), clearSearch: vi.fn(), _sessionSearching: false,
    inboxItems: [] as unknown[], fleetSessions: [] as unknown[],
    respondFleetApproval: vi.fn(), openRunTraceGlobal: vi.fn(),
    scheduleDatesWithEvents: new Set<string>(), teams: [] as unknown[],
    currentUserName: '',
  }
  return { state, useCockpitStore: () => cockpitStubs.state }
})
vi.mock('@/custom/shared/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))
const loopStubs = vi.hoisted(() => {
  const state = {
    loops: [] as Array<Record<string, unknown>>,
    currentLoop: null, currentContracts: [], currentEvents: [],
    loading: false, error: null, fetchLoop: vi.fn(async () => {}),
  }
  return { state, useLoopStore: () => loopStubs.state }
})
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: loopStubs.useLoopStore }))
const runsStubs = vi.hoisted(() => {
  const state = { runs: [] as Array<Record<string, unknown>>, sortedRuns: [] as Array<Record<string, unknown>>, resumeRun: vi.fn() }
  return { state, useRunCenterStore: () => runsStubs.state }
})
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: runsStubs.useRunCenterStore }))
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: () => ({ tasks: [] }) }))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest: { getContracts: vi.fn(async () => []), listLoops: vi.fn(async () => []) } }))
vi.mock('../store/platforms', () => ({
  usePlatformsStore: () => ({ retain: vi.fn(), release: vi.fn(), gatewayState: 'offline', platforms: [] }),
}))
vi.mock('../composables/useNowTick', () => ({ useNowTick: () => ref(0) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))
vi.mock('@/stores/hermes/app', () => ({ useAppStore: () => ({ connected: true }) }))
vi.mock('@/api/client', () => ({ getStoredUsername: () => 'tester' }))

// ── 重组件桩（对齐 loop-workflow-boundary.test.ts；中栏画布只留可断言薄壳）──
vi.mock('@/custom/ia2/workflow', () => ({
  fetchWorkflowRuns: vi.fn(async () => []),
  fetchWorkflowRun: vi.fn(async () => null),
  startWorkflow: vi.fn(async () => null),
  deleteWorkflowRun: vi.fn(async () => {}),
}))
vi.mock('@/custom/ia2/identity-chat', () => ({ fetchIdentities: vi.fn(async () => []) }))
vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({
  default: { name: 'KanbanTaskDrawer', props: ['show', 'taskId'], template: '<div class="drawer-stub" v-if="show" />' },
}))
vi.mock('@/custom/matrix-chat/components/MatrixRoomCanvas.vue', () => ({
  default: { name: 'MatrixRoomCanvas', template: '<div data-testid="room-canvas-stub" />' },
}))
vi.mock('@/views/hermes/ChatView.vue', () => ({ default: { name: 'ChatView', template: '<div data-testid="chat-view-stub" />' } }))
vi.mock('@/views/hermes/GroupChatView.vue', () => ({ default: { name: 'GroupChatView', template: '<div data-testid="group-view-stub" />' } }))
vi.mock('@/custom/loop/components/LoopCreateWizard.vue', () => ({
  default: { name: 'LoopCreateWizard', emits: ['close', 'created'], template: '<div />' },
}))
vi.mock('../wm/popout', () => ({ openPanelWindow: vi.fn(async () => {}) }))
vi.mock('@/components/layout/ThemeSwitch.vue', () => ({ default: { name: 'ThemeSwitch', template: '<span class="theme-stub" />' } }))
vi.mock('../components/IaLocaleToggle.vue', () => ({ default: { name: 'IaLocaleToggle', template: '<span class="locale-stub" />' } }))
vi.mock('@/custom/ia2/api/gatekeeper', () => ({ nudgeRoute: vi.fn() }))

import { authFetch } from '../../ide/utils/auth-fetch'
import { useWorkspaceStore } from '@/custom/shared/store/workspace'
import { useFlowStore } from '../store/flow'
import { useAttentionRows } from '../composables/useAttentionRows'
import { useDailyStageProgress } from '../composables/useDailyStageProgress'
import { __resetDailySetupSignalsForTest } from '../composables/daily-setup-signals'
import JourneyView from '../views/journey/JourneyView.vue'
import WorkbenchView from '../views/WorkbenchView.vue'
import IaSideNav from '../components/IaSideNav.vue'
import IaSideNavItem from '../components/IaSideNavItem.vue'
import TaskDecisionPanel from '../components/flow/TaskDecisionPanel.vue'
import StageSetupSteps from '../views/stage/StageSetupSteps.vue'
import DailyTracePanel from '../views/stage/DailyTracePanel.vue'
import DailyG5Panel from '../views/stage/DailyG5Panel.vue'
import DailyDeliveryPanel from '../views/stage/DailyDeliveryPanel.vue'
import IaShellHeader from '../components/IaShellHeader.vue'
import type { DecisionRow } from '../composables/useDecisionRows'
import type { AttentionRow } from '../adapters/overview'

const mockedFetch = vi.mocked(authFetch)

// ── 数据面工具 ────────────────────────────────────────────────────────

const ORG_WITH_ROWS = '| 项 | 值 |\n| --- | --- |\n| 组织 | 示例组织 |'
const ORG_EMPTY = '| 项 | 值 |\n| --- | --- |'

function overviewOf(rows: Array<{ board: string; task: ReturnType<typeof ctx.dailyRaw> }>) {
  return {
    boards: [{ slug: 'main', name: 'Main', total: rows.length }],
    tasks: rows.map(r => ctx.toCockpitTask(r.task, r.board)),
    rawTasks: rows,
  }
}

function simFixture(tasks: Array<{ board: string; task: ReturnType<typeof ctx.dailyRaw> }>, runId = 'run-7') {
  return {
    available: true, runId, posture: 'standard', startedAt: 1, rooms: [],
    boards: [...new Set(tasks.map(t => t.board))].map(slug => ({ slug, name: slug, total: 1 })),
    tasks: tasks.map(t => ({ board: t.board, task: { ...t.task, source: 'sim', runId } })),
  }
}

/** 信号三源固定（org/accounts/agents） */
function seedSignals(org: string | null, roster: string | null, agents: Array<unknown> | null): void {
  ctx.adminRegistry.fetchRegistry.mockImplementation(async (kind: 'org' | 'roster') =>
    (kind === 'org' ? org : roster) === null
      ? Promise.reject(new Error('registry down'))
      : Promise.resolve({ markdown: kind === 'org' ? (org as string) : (roster as string), commit: 'c1' }))
  ctx.profiles.fetchProfiles.mockImplementation(() =>
    agents === null ? Promise.reject(new Error('profiles down')) : Promise.resolve(agents as never[]))
}

async function seedWorkspace(dailyRows: Array<{ board: string; task: ReturnType<typeof ctx.dailyRaw> }>, simRows: Array<{ board: string; task: ReturnType<typeof ctx.dailyRaw> }> = []) {
  ctx.teams.fetchKanbanOverview.mockResolvedValue(overviewOf(dailyRows))
  ctx.simObserver.fetchSimObserverOverview.mockResolvedValue(simFixture(simRows))
  const workspace = useWorkspaceStore()
  await workspace.refreshAllBoards(true)
  return workspace
}

// ── 路由表 ────────────────────────────────────────────────────────────

function journeyRoutes(): RouteRecordRaw[] {
  return [
    { path: '/app', name: 'ia2.journey', component: JourneyView },
    { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
    { path: '/app/stage/setup', name: 'ia2.stage1', component: { template: '<div />' } },
    { path: '/app/stage/reqs', name: 'ia2.stage2', component: { template: '<div />' } },
    { path: '/app/stage/design', name: 'ia2.stage3', component: { template: '<div />' } },
    { path: '/app/stage/build', name: 'ia2.stage4', component: { template: '<div />' } },
    { path: '/app/stage/accept', name: 'ia2.stage5', component: { template: '<div />' } },
    { path: '/app/stage/govern', name: 'ia2.stage6', component: { template: '<div />' } },
    { path: '/app/accounts', name: 'ia2.accounts', component: { template: '<div />' } },
    { path: '/app/teams', name: 'ia2.teams', component: { template: '<div />' } },
    { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
    { path: '/app/gov/org-assets', name: 'ia2.govOrgAssets', component: { template: '<div />' } },
    { path: '/app/stage/setup/assets', name: 'ia2.stage1-assets', component: { template: '<div />' } },
    { path: '/hermes/agents', name: 'hermes.agentManager', component: { template: '<div />' } },
  ]
}

function wbRoutes(): RouteRecordRaw[] {
  return [{
    path: '/app',
    component: { template: '<router-view />' },
    children: [
      { path: '', name: 'ia2.collab', component: WorkbenchView },
      { path: 's/room/:roomId', name: 'ia2.commsRoom', component: WorkbenchView },
      { path: 's/group/:roomId', name: 'ia2.groupRoom', component: WorkbenchView },
      { path: 's/chat/:sessionId', name: 'ia2.collabSession', component: WorkbenchView },
      { path: 'l/:loopId', name: 'ia2.loopCanvas', component: { template: '<div loop-detail />' } },
      { path: 'runs/:runId', name: 'ia2.runDetail', component: { template: '<div run-detail />' } },
      { path: 'board', name: 'ia2.board', component: { template: '<div board />' } },
      { path: 'inbox', name: 'ia2.inbox', component: { template: '<div inbox />' } },
    ],
  }, {
    path: '/ide',
    name: 'ide.shell',
    component: { template: '<div ide />' },
  }]
}

function navRoutes(): RouteRecordRaw[] {
  return [
    { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
    { path: '/app/stage/build', name: 'ia2.stage4', component: { template: '<div />' } },
  ]
}

async function mountWith(component: unknown, routes: RouteRecordRaw[], at: string, extra: Record<string, unknown> = {}) {
  const router: Router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(at)
  await router.isReady()
  const w = mount(component as never, { global: { plugins: [router], ...extra } })
  await flushPromises()
  return { w, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  localStorage.clear()
  __resetDailySetupSignalsForTest()
  mockedFetch.mockReset()
  roomStubs.state.sortedRooms = [{ roomId: '!r1:host', name: '应急指挥中心' }]
})

// ── JourneyView：日常口径首页 ─────────────────────────────────────────

describe('JourneyView — 日常口径（不读推演 run）', () => {
  it('首页状态来自日常任务与配置信号：后续有工作=已流转，不得展示本阶段完成', async () => {
    seedSignals(ORG_WITH_ROWS, ORG_EMPTY, [])
    await seedWorkspace([
      { board: 'main', task: ctx.dailyRaw({ id: 'd1', title: '日常在办', status: 'running' }) },
    ], [
      { board: 'main', task: ctx.dailyRaw({ id: 's1', title: '推演完成', status: 'done' }) },
    ])
    const { w } = await mountWith(JourneyView, journeyRoutes(), '/app')
    // 标题改「工作总览」语义（日常口径，不再叫流程总览/运行语境）
    expect(w.find('.jrn__title').text()).toContain('工作总览')
    // ?run= 深链也不读 sim run-state（旧实现 query.run 即拉 run-state）
    expect(mockedFetch).not.toHaveBeenCalled()
    // ④ 有在办=进行中；② 后续有工作=已流转（不画「完成」）
    expect(w.find('[data-testid="jrn-state-4"]').text()).toContain('进行中')
    expect(w.find('[data-testid="jrn-state-2"]').text()).toContain('已流转')
    expect(w.find('[data-testid="jrn-state-2"]').text()).not.toContain('完成')
    // ⑥ 只看日常：sim done 卡不把⑥推成完成/进行中
    expect(w.find('[data-testid="jrn-state-6"]').text()).toContain('未开始')
    // 五步读真实信号：org 有行=完成；agents 空=current 序首 accounts；teams 无信号=未跟踪
    expect(w.find('[data-testid="jrn-step-state-1"]').text()).toContain('完成')
    expect(w.find('[data-testid="jrn-step-state-3"]').text()).toContain('未纳入跟踪')
    w.unmount()
  })

  it('?run= 深链不触发 run-state 拉取（推演进度回推演区看）', async () => {
    seedSignals(ORG_WITH_ROWS, ORG_EMPTY, [])
    await seedWorkspace([])
    const { w } = await mountWith(JourneyView, journeyRoutes(), '/app?run=r')
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(w.find('[data-testid="jrn-bottleneck"]').exists()).toBe(false)
    expect(w.find('[data-testid="jrn-error"]').exists()).toBe(false)
    w.unmount()
  })

  it('已有组织时不展示「还没有进行中的运行」，改日常空态引导', async () => {
    seedSignals(ORG_WITH_ROWS, ORG_WITH_ROWS, [])
    await seedWorkspace([])
    const { w } = await mountWith(JourneyView, journeyRoutes(), '/app')
    expect(w.find('[data-testid="jrn-guide"]').exists(), '搭建引导不得出现').toBe(false)
    const guide = w.find('[data-testid="jrn-guide-daily"]')
    expect(guide.exists()).toBe(true)
    expect(guide.text()).not.toContain('运行')
    // 日常空态引导：指向工作台/看板（而非「从第 1 步开始」）
    expect(guide.text()).not.toContain('从第 1 步')
    w.unmount()
  })

  it('组织未建立时给搭建引导（日常措辞，不提运行）', async () => {
    seedSignals(ORG_EMPTY, ORG_EMPTY, [])
    await seedWorkspace([])
    const { w } = await mountWith(JourneyView, journeyRoutes(), '/app')
    const guide = w.find('[data-testid="jrn-guide"]')
    expect(guide.exists()).toBe(true)
    expect(guide.text()).toContain('建立组织')
    expect(guide.text()).not.toContain('运行')
    w.unmount()
  })
})

// ── useDailyStageProgress：五步真实信号接线 ───────────────────────────

describe('useDailyStageProgress — stepState 接线 daily-setup-signals', () => {
  const Probe = defineComponent({
    setup: () => ({ progress: useDailyStageProgress() }),
    template: '<div />',
  })

  it('信号源失败=untracked（不猜、不冒充）；可判步骤按 org→accounts→agents 序 current', async () => {
    seedSignals(null, null, null)
    await seedWorkspace([])
    const w = mount(Probe)
    await flushPromises()
    const p = w.vm.progress as ReturnType<typeof useDailyStageProgress>
    expect(p.stepState({ key: 'org', keys: ['x'] } as never)).toBe('untracked')
    expect(p.stepState({ key: 'accounts', keys: ['x'] } as never)).toBe('untracked')
    expect(p.stepState({ key: 'teams', keys: [] } as never)).toBe('untracked')
    w.unmount()
  })

  it('org 完成、accounts 缺、agents 空：org=done、accounts=current、agents=pending', async () => {
    seedSignals(ORG_WITH_ROWS, ORG_EMPTY, [])
    await seedWorkspace([])
    const w = mount(Probe)
    await flushPromises()
    const p = w.vm.progress as ReturnType<typeof useDailyStageProgress>
    expect(p.stepState({ key: 'org', keys: ['x'] } as never)).toBe('done')
    expect(p.stepState({ key: 'accounts', keys: ['x'] } as never)).toBe('current')
    expect(p.stepState({ key: 'agents', keys: [] } as never)).toBe('pending')
    w.unmount()
  })
})

// ── WorkbenchView：无路由选中=中性空态 ────────────────────────────────

describe('WorkbenchView — 无路由选择不隐式选首会话', () => {
  it('无 routeSel：中栏中性空态、对象标题区无房间名、flow.select(null)', async () => {
    await seedWorkspace([])
    const { w } = await mountWith(WorkbenchView, wbRoutes(), '/app')
    expect(w.find('[data-testid="wb-canvas-none"]').exists()).toBe(true)
    // 对象标题区（中栏）不得出现左侧列表里的房间名
    const center = w.find('[data-testid="wb-center"]')
    expect(center.exists()).toBe(true)
    expect(center.text()).not.toContain('应急指挥中心')
    // store 选择投影=null（旧实现隐式选首会话）
    expect(useFlowStore().selected).toBeNull()
    w.unmount()
  })

  it('路由选中房间后行为不变：中栏房间画布、flow.select 同步', async () => {
    await seedWorkspace([])
    const { w } = await mountWith(WorkbenchView, wbRoutes(), '/app/s/room/!r1:host')
    expect(w.find('[data-testid="room-canvas-stub"]').exists()).toBe(true)
    expect(useFlowStore().selected).toEqual({ kind: 'room', id: '!r1:host' })
    w.unmount()
  })
})

// ── useAttentionRows：includeWaitItems 局部选择 ───────────────────────

describe('useAttentionRows — 局部排除决策队列项', () => {
  function probeOf(options?: { includeWaitItems?: boolean }) {
    return defineComponent({
      setup: () => ({ rows: useAttentionRows(options).attentionRows.value }),
      template: '<div />',
    })
  }

  it('默认口径不变（等我仍进注意力面）；includeWaitItems:false 排除已进决策队列项', async () => {
    await seedWorkspace([
      { board: 'main', task: ctx.dailyRaw({ id: 'r1', title: '待人验收', status: 'review' }) },
      { board: 'main', task: ctx.dailyRaw({ id: 'b1', title: '受阻卡', status: 'blocked' }) },
    ])
    const full = mount(probeOf())
    await flushPromises()
    expect((full.vm.rows as AttentionRow[]).map(r => r.taskId).sort()).toEqual(['b1', 'task:r1'])
    full.unmount()

    const local = mount(probeOf({ includeWaitItems: false }))
    await flushPromises()
    // review 任务已在右栏「等我」队列——需关注节不再重复呈现
    expect((local.vm.rows as AttentionRow[]).map(r => r.taskId)).toEqual(['b1'])
    local.unmount()
  })
})

// ── TaskDecisionPanel：业务键去重 + 分组空态 ─────────────────────────

describe('TaskDecisionPanel — 待我处理按业务键去重', () => {
  const wait: DecisionRow[] = [{
    id: 'task:t1', kind: 'task-review', title: '任务 T1', subKey: 'ia2.wait.subReview', ts: 100, taskId: 't1',
  }]
  const attention: AttentionRow[] = [
    { id: 'att-task:t1', taskId: 'task:t1', kind: 'task', title: '任务 T1', status: 'review', severity: 'medium', priority: 1, createdAt: 100 },
    { id: 'att-b9', taskId: 'b9', kind: 'task', title: '受阻卡', status: 'blocked', severity: 'high', priority: 1, createdAt: 90 },
  ]

  it('同一业务键只计一次：计数与需关注行均去重', async () => {
    const w = mount(TaskDecisionPanel, {
      props: { waitItems: wait, attentionRows: attention, linkedTasks: [], feedRows: [] },
    })
    // 旧实现：waitItems 1 + attention 2 = 3（同一任务两处重复）；新：去重后 2
    expect(w.find('[data-testid="tdp-tab-pending"]').text()).toContain('2')
    expect(w.find('[data-testid="att-att-b9"]').exists()).toBe(true)
    expect(w.find('[data-testid="att-att-task-t1"]').exists(), '等我队列已有的条目不进需关注').toBe(false)
    w.unmount()
  })

  it('分组空态只描述对应分组（等我/需关注各表各的空）', async () => {
    const w = mount(TaskDecisionPanel, {
      props: { waitItems: [], attentionRows: [], linkedTasks: [], feedRows: [] },
    })
    expect(w.find('[data-testid="tdp-pane-pending"]').text()).toContain('ia2.tdp.waitEmpty')
    expect(w.find('[data-testid="att-empty"]').exists(), '需关注分组自身空态常驻（非整节消失）').toBe(true)
    expect(w.find('[data-testid="att-empty"]').text()).toBe('ia2.att.empty')
    w.unmount()
  })
})

// ── StageSetupSteps：无信号隐藏 0/5 ──────────────────────────────────

describe('StageSetupSteps — 无信号不展示 0/5 计数', () => {
  it('三源全不可判：隐藏计数（不拿 0/5 冒充进度）', async () => {
    seedSignals(null, null, null)
    await seedWorkspace([])
    const w = mount(StageSetupSteps)
    await flushPromises()
    expect(w.find('[data-testid="stg-setup-count"]').exists()).toBe(false)
    w.unmount()
  })

  it('可判步骤按实计分母：org+accounts 完成、agents 待办 → 2/3（teams/env 不进分母）', async () => {
    seedSignals(ORG_WITH_ROWS, ORG_WITH_ROWS, [])
    await seedWorkspace([])
    const w = mount(StageSetupSteps)
    await flushPromises()
    expect(w.find('[data-testid="stg-setup-count"]').text()).toBe('2/3')
    expect(w.find('[data-testid="stg-step-state-org"]').text()).toContain('完成')
    expect(w.find('[data-testid="stg-step-state-teams"]').text()).toContain('未纳入跟踪')
    w.unmount()
  })
})

// ── IaSideNavItem / IaSideNav：已流转不画绿✓ ─────────────────────────

describe('侧栏阶段状态 — done=已流转（中性呈现，不画绿✓）', () => {
  it('IaSideNavItem flowed：灰○ 中性点，不渲染 ✓；done（真完成）仍保留 ✓', () => {
    const flowed = mount(IaSideNavItem, {
      props: { lead: '1', leadKind: 'number', label: '需求', status: 'flowed', statusLabel: '已流转' },
    })
    const dot = flowed.find('.isn-item__status')
    expect(dot.exists()).toBe(true)
    expect(dot.classes()).toContain('isn-item__status--flowed')
    expect(dot.text()).toBe('○')
    expect(dot.text()).not.toBe('✓')
    expect(dot.attributes('aria-label')).toBe('已流转')
    flowed.unmount()

    const done = mount(IaSideNavItem, {
      props: { lead: '1', leadKind: 'number', label: '某真完成项', status: 'done', statusLabel: '已完成' },
    })
    expect(done.find('.isn-item__status').text()).toBe('✓')
    done.unmount()
  })

  it('IaSideNav 阶段行：后续阶段有工作的阶段不画 ✓（已流转 ○）', async () => {
    seedSignals(ORG_WITH_ROWS, ORG_EMPTY, [])
    await seedWorkspace([
      { board: 'main', task: ctx.dailyRaw({ id: 'd1', title: '日常在办', status: 'running' }) },
    ])
    const { w } = await mountWith(IaSideNav, navRoutes(), '/app/collab')
    // running 卡落④桶：①（有任意任务）=current 灯胆；②（后续有工作）=已流转 ○
    const flowed = w.find('[data-testid="ia-side-nav-stage2"] .isn-item__status')
    expect(flowed.exists()).toBe(true)
    expect(flowed.text()).toBe('○')
    expect(flowed.text()).not.toBe('✓')
    expect(flowed.classes()).toContain('isn-item__status--flowed')
    expect(flowed.classes()).not.toContain('isn-item__status--done')
    w.unmount()
  })
})

// ── Task 2 移交：日常面板与页头跳转只解析 daily ───────────────────────

describe('日常面板 — 同 board 同 taskId 只呈现/上抛 daily', () => {
  async function seedSameId(): Promise<void> {
    await seedWorkspace(
      [{ board: 'main', task: ctx.dailyRaw({ id: 'shared', title: '日常验收', status: 'review' }) }],
      [{ board: 'main', task: ctx.dailyRaw({ id: 'shared', title: '推演验收', status: 'review', session_id: 'sess-1' }) }],
    )
  }

  it('需求追溯：一行（daily），行键不冲突，点击上抛 daily ref key', async () => {
    await seedSameId()
    const { w } = await mountWith(DailyTracePanel, [{ path: '/x', component: DailyTracePanel }], '/x')
    const rows = w.findAll('[data-testid="daily-trace-shared"]')
    expect(rows).toHaveLength(1)
    expect(w.text()).toContain('日常验收')
    expect(w.text()).not.toContain('推演验收')
    await rows[0].trigger('click')
    expect(w.emitted('open-task')?.[0]).toEqual(['daily:main:shared'])
    w.unmount()
  })

  it('G5 发布前检查与交付健康：同样只列 daily 行', async () => {
    await seedSameId()
    const g5 = await mountWith(DailyG5Panel, [{ path: '/x', component: DailyG5Panel }], '/x')
    expect(g5.w.findAll('.dgp__row')).toHaveLength(1)
    expect(g5.w.text()).not.toContain('推演验收')
    g5.w.unmount()

    const dlv = await mountWith(DailyDeliveryPanel, [{ path: '/x', component: DailyDeliveryPanel }], '/x')
    expect(dlv.w.findAll('[data-testid="daily-delivery-shared"]')).toHaveLength(1)
    expect(dlv.w.text()).not.toContain('推演验收')
    dlv.w.unmount()
  })
})

describe('IaShellHeader — 任务跳转解析 daily 优先', () => {
  it('同 ID 的 sim 行不覆盖 daily：跳转按 daily 挂接会话分派', async () => {
    await seedWorkspace(
      [{ board: 'main', task: ctx.dailyRaw({ id: 'shared', title: '日常在办', status: 'running', session_id: '!r1:host' }) }],
      [{ board: 'main', task: ctx.dailyRaw({ id: 'shared', title: '推演在办', status: 'running', session_id: 'sess-1' }) }],
    )
    // 路由表须含跳转目标（ia2.commsRoom 等，对齐 custom/client/ia2/routes.ts）：
    // push 用 call-through spy，路由缺失会以 unhandled rejection 打断测试进程。
    const { w, router } = await mountWith(IaShellHeader, [
      { path: '/app', name: 'ia2.collab', component: { template: '<div />' } },
      { path: '/app/s/room/:roomId', name: 'ia2.commsRoom', component: { template: '<div />' } },
      { path: '/app/s/group/:roomId', name: 'ia2.groupRoom', component: { template: '<div />' } },
      { path: '/app/s/chat/:sessionId', name: 'ia2.collabSession', component: { template: '<div />' } },
    ], '/app', {
      stubs: { CockpitIcon: true, RouterLink: { props: ['to'], template: '<a><slot /></a>' } },
    })
    const push = vi.spyOn(router, 'push')
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="sitp-task-shared"]').trigger('click')
    await flushPromises()
    // daily 挂接的是 matrix 房间 → 房间画布；若被 sim 覆盖会误跳 IDE（agent 会话）
    expect(push).toHaveBeenCalledWith({ name: 'ia2.commsRoom', params: { roomId: '!r1:host' } })
    w.unmount()
  })
})

