// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell-header-sit.test.ts
// 页头态势面板守门（v12.3 2026-09-20 用户裁定：六态势 chips 自 WorkbenchView
// 迁入 IaShellHeader，SitDetailPanel 就地浮层）。
// v12.4（2026-09-20 用户裁定）：chips 收窄为等我/任务/在线（会话/循环/管理
// 退役）；任务口径=跨板未完成未归档 + 分状态统计；等我口径=useDecisionRows
// 待我决策的任务及会话（review 任务/中断运行/fleet 审批/评审门）。数据面走真
// composables（useSitCounts/useDecisionRows/useDecisionActions——store 桩注入；
// 决策动作断言 kanbanApi 层，板定位=任务自身 boardSlug）。i18n 走全局 setup
// mock（t 直返 key）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ path: '/app', fullPath: '/app', query: {} }),
  createRouter: () => ({ push: pushMock, install: () => {}, beforeEach: () => {}, afterEach: () => {} }),
  createWebHashHistory: () => ({}),
}))

// ── store 桩（形状对齐 workbench-flow.test.ts，单一数据面）──

const roomStubs = vi.hoisted(() => ({
  state: {
    sortedRooms: [{ roomId: '!r1:host', name: '应急指挥中心' }],
    getRoomUnreadCount: () => 2,
    getRoomMemberList: () => ({ admins: [], mods: [], invited: [], defaults: [] }),
  },
  useMatrixRoomStore: () => roomStubs.state,
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: roomStubs.useMatrixRoomStore }))

const chatStubs = vi.hoisted(() => ({
  state: { sessions: [{ id: 'sess-1', title: 'agent 会话 A', updatedAt: 1700 }], unreadMessages: new Map() },
  useChatStore: () => chatStubs.state,
}))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: chatStubs.useChatStore }))

const kanbanStubs = vi.hoisted(() => ({
  state: { tasks: [] },
  useKanbanStore: () => kanbanStubs.state,
}))
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: kanbanStubs.useKanbanStore }))

const workspaceStubs = vi.hoisted(() => ({
  state: {
    refreshAllBoards: vi.fn(async () => true),
    tasks: [
      { id: 't-402', title: 'v2.28 发布', priority: 'P1', status: 'review', assignee: 'worker-coder', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 1000 },
      { id: 't-415', title: 'release notes', priority: 'P2', status: 'running', assignee: '你', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 2000 },
      { id: 't-460', title: '指挥室联动', priority: 'P3', status: 'todo', assignee: null, workspace: '', tenant: null, boardSlug: '[已移除]', createdAt: 3000 },
    ],
    boards: [
      { slug: 'swarm', name: 'Swarm 主板', total: 2 },
      { slug: '[已移除]', name: '[已移除]', total: 1 },
    ],
    rawTasks: [
      { board: 'swarm', task: { id: 't-402', title: 'v2.28 发布', status: 'review', priority: 2, assignee: 'worker-coder', created_at: 1, tenant: null, session_id: null } },
      { board: 'swarm', task: { id: 't-415', title: 'release notes', status: 'running', priority: 1, assignee: '你', created_at: 2, tenant: null, session_id: 'sess-1' } },
      { board: '[已移除]', task: { id: 't-460', title: '指挥室联动', status: 'todo', priority: 0, assignee: null, created_at: 3, tenant: null, session_id: '!r1:host' } },
    ],
    scheduleOpen: false, openSchedule: vi.fn(), closeSchedule: vi.fn(),
  },
  useWorkspaceStore: () => workspaceStubs.state,
}))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

const runsStubs = vi.hoisted(() => ({
  state: {
    runs: [{ runId: 'run-9', graphId: 'loop-lp-1', status: 'awaiting-input', updatedAt: null, stage: null, iteration: 0, lastActivityAt: null, cost: 0, events: [], pendingInterruptId: 'it-1' }],
    sortedRuns: [], resumeRun: vi.fn(),
  },
  useRunCenterStore: () => runsStubs.state,
}))
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: runsStubs.useRunCenterStore }))

const cockpitStubs = vi.hoisted(() => ({
  state: {
    searchQuery: '', runSearch: vi.fn(), clearSearch: vi.fn(), _sessionSearching: false,
    inboxItems: [] as unknown[],
    fleetSessions: [{ id: 'fs-1', profile: 'p', title: 'fleet 复验确认', status: 'idle', isAborting: false, queueLength: 0, runStartedAt: null, lastActiveAt: 42, source: '', agent: '', lastPreview: '', approvals: [{ approval_id: 'ap-1', preview: '', choices: [] }], clarifies: [], subagents: [] }],
    respondFleetApproval: vi.fn(),
    scheduleDatesWithEvents: new Set<string>(),
    teams: [{ id: 'team-1', name: '主力队', profiles: ['p'], boards: ['swarm'], pinnedSessions: [] }],
  },
  useCockpitStore: () => cockpitStubs.state,
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))

const loopStubs = vi.hoisted(() => ({
  state: {
    loops: [{
      id: 'lp-1', name: 'release-pipeline', goal: '', stopCondition: '', pattern: 'daily-triage',
      schedule: { mode: 'manual' }, stage: 'validation', status: 'awaiting-review',
      autonomyLevel: 'L2', stateAdapter: 'local',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-19T14:00:00Z',
      lastTickAt: null, nextTickAt: null,
      stats: { totalIterations: 3, tasksDiscovered: 4, tasksCompleted: 2, tasksBlocked: 0, totalCost: 0, currentIteration: 3 },
    }],
    currentLoop: null, currentContracts: [], currentEvents: [], fetchLoop: vi.fn(async () => {}),
  },
  useLoopStore: () => loopStubs.state,
}))
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: loopStubs.useLoopStore }))

const registryStubs = vi.hoisted(() => ({
  state: {
    duties: {},
    accounts: [{ userId: '@tl:host', displayName: 'TL', agentTeams: [{ slug: 'swarm', name: 'swarm', profiles: ['p'] }], isLeader: true, declared: true as const }],
  },
  useTeamRegistryStore: () => registryStubs.state,
}))
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({ useTeamRegistryStore: registryStubs.useTeamRegistryStore }))

const kanbanApiStubs = vi.hoisted(() => ({
  completeTasks: vi.fn(async () => ({ results: [] })),
  blockTask: vi.fn(async () => ({})),
  reopenReview: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/api/hermes/kanban', () => ({ completeTasks: kanbanApiStubs.completeTasks, blockTask: kanbanApiStubs.blockTask, reopenReview: kanbanApiStubs.reopenReview }))

// 群聊 store 桩（R4b：useSessionRows 第三源；真 store 拉上游 router 链）
vi.mock('@/stores/hermes/group-chat', () => ({
  useGroupChatStore: () => ({ rooms: [] as unknown[] }),
}))

// 评审中心桩（useDecisionRows 的 gate 源；决策动作断言在 kanbanApi 层）——
// v12.4 给 1 条 pending 评审门：等我计数必须收编（待我决策的任务及会话）
const reviewStubs = vi.hoisted(() => ({
  state: {
    pendingReviews: [{ caseId: 'CASE-7', gate: 'G2', at: 1700, signoffs: [{ at: 1700 }], pending: true }],
    sendVerdict: vi.fn(),
  },
  useReviewCenterStore: () => reviewStubs.state,
}))
vi.mock('@/custom/matrix-teams/stores/review-center', () => ({ useReviewCenterStore: reviewStubs.useReviewCenterStore }))

// 轻组件桩：探测组（retain 轮询；storeToRefs 逐键要求 ref——值全 ref 化）/
// 语言直切/主题
vi.mock('../store/platforms', async () => {
  const { ref } = await import('vue')
  const state = {
    gatewayState: ref('running' as string),
    platforms: ref([] as unknown[]),
    refreshing: ref(false),
    countdown: ref(30),
    rawData: ref<unknown>(null),
  }
  return {
    usePlatformsStore: () => ({
      ...state,
      retain: vi.fn(), release: vi.fn(), fetchGatewayStatus: vi.fn(async () => {}),
    }),
  }
})
vi.mock('@/stores/hermes/app', () => ({ useAppStore: () => ({ connected: true }) }))
vi.mock('@/components/layout/ThemeSwitch.vue', () => ({ default: { name: 'ThemeSwitch', template: '<span class="theme-stub" />' } }))
vi.mock('../components/IaLocaleToggle.vue', () => ({ default: { name: 'IaLocaleToggle', template: '<span class="locale-stub" />' } }))

import IaShellHeader from '../components/IaShellHeader.vue'
import { useFlowStore } from '../store/flow'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  pushMock.mockClear()
  vi.clearAllMocks()
})

async function mountHeader() {
  const w = mount(IaShellHeader, {
    props: { userName: 'tester' },
    global: { stubs: { CockpitIcon: true, RouterLink: { props: ['to'], template: '<a><slot /></a>' } } },
  })
  await flushPromises()
  return w
}

describe('IaShellHeader — 态势 chips + 内联面板（v12.4 收窄）', () => {
  it('两段 chips 在页头渲染（任务/在线；R6 合并 waiting 入 tasks；会话/循环/管理退役）', async () => {
    const w = await mountHeader()
    // R6：waiting chip 已退役并入 tasks；tasks chip = 开放态任务总数 2，
    // 待决策角标 = review t-402 + awaiting run-9 + fleet ap-1 + 评审门 CASE-7:G2 = 4
    expect(w.find('[data-testid="sit-waiting"]').exists()).toBe(false)
    expect(w.find('[data-testid="sit-tasks"]').text()).toContain('2')
    expect(w.find('[data-testid="sit-tasks-decide"]').text()).toContain('4')
    expect(w.find('[data-testid="sit-online"]').text()).toContain('3')
    // v12.4 退役断言：会话/循环 chips 与 ⚙管理入口不再渲染
    expect(w.find('[data-testid="sit-sessions"]').exists()).toBe(false)
    expect(w.find('[data-testid="sit-loops"]').exists()).toBe(false)
    expect(w.find('[data-testid="sit-gov"]').exists()).toBe(false)
    w.unmount()
  })

  it('v12.4 评审门进待决策区：tasks 面板含 gate 行，行内按钮进评审区（flow.openGov review）', async () => {
    const w = await mountHeader()
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await flushPromises()
    const panel = w.find('[data-testid="sitp-decide"]')
    expect(panel.text()).toContain('CASE-7 · G2')
    await w.find('[data-testid="sitp-decide-gate-open"]').trigger('click')
    const flow = useFlowStore()
    expect(flow.govOpen).toBe(true)
    expect(flow.govSection).toBe('review')
    w.unmount()
  })

  it('任务段：分状态统计 + 基本信息行（板名/优先级/指派）；行点击跳关联会话/编码工作空间', async () => {
    const w = await mountHeader()
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sit-panel-tasks"]').exists()).toBe(true)
    expect(w.find('[data-testid="sit-tasks"]').classes()).toContain('sit__item--on')
    // v12.4：分状态统计（review 1 / running 1 / todo 1，词表序）
    const stats = w.find('[data-testid="sitp-task-stats"]')
    expect(stats.exists()).toBe(true)
    expect(stats.find('[data-testid="sitp-stat-review"]').text()).toContain('1')
    expect(stats.find('[data-testid="sitp-stat-running"]').text()).toContain('1')
    expect(stats.find('[data-testid="sitp-stat-todo"]').text()).toContain('1')
    // v12.5：行基本信息（板名 + 优先级徽标 + 指派人）
    const row = w.find('[data-testid="sitp-task-t-402"]')
    expect(row.text()).toContain('Swarm 主板')
    expect(row.text()).toContain('P1')
    expect(row.text()).toContain('@worker-coder')
    // 无挂接会话 → IDE 编码工作空间（任务维度 + 会话列自动切挂靠会话）
    await row.trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({ path: '/app/ide', query: { task: 't-402' } })
    expect(w.find('[data-testid="sit-panel-tasks"]').exists()).toBe(false)
    // 挂接 matrix 房间 → 工作台房间画布（三栏左/中栏定位该会话）
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="sitp-task-t-460"]').trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({ name: 'ia2.commsRoom', params: { roomId: '!r1:host' } })
    // 挂接 agent 会话（sess-1）→ IDE（会话列 switch 命中）
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await flushPromises()
    await w.find('[data-testid="sitp-task-t-415"]').trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({ path: '/app/ide', query: { task: 't-415' } })
    // 同段再点收起
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    expect(w.find('[data-testid="sit-panel-tasks"]').exists()).toBe(true)
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    expect(w.find('[data-testid="sit-panel-tasks"]').exists()).toBe(false)
    w.unmount()
  })

  it('待决策区：行上就地决策（验收 completeTasks/打回 reopenReview，任务所在板）', async () => {
    const w = await mountHeader()
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sitp-decide"]').exists()).toBe(true)
    await w.find('[data-testid="sitp-decide-approve"]').trigger('click')
    await flushPromises()
    expect(kanbanApiStubs.completeTasks).toHaveBeenCalledWith(['t-402'], undefined, { board: 'swarm' })
    await w.find('[data-testid="sitp-decide-reject"]').trigger('click')
    await flushPromises()
    expect(kanbanApiStubs.reopenReview).toHaveBeenCalledWith(['t-402'], 'ia2.tdp.rejectReason', { board: 'swarm' })
    w.unmount()
  })

  it('在线段（v12.5 三级级联）：账号展开 → 机器 + 看板 → 板下 profile 清单；检索跨层过滤', async () => {
    const w = await mountHeader()
    await w.find('[data-testid="sit-online"]').trigger('click')
    await flushPromises()
    // 检索框在位；账号 TL 行显示计数（机器/板/profile）
    expect(w.find('[data-testid="sitp-online-search"]').exists()).toBe(true)
    const acct = w.find('[data-testid="sitp-acct-@tl:host"]')
    expect(acct.exists()).toBe(true)
    expect(acct.text()).toContain('TL')
    // ① 展开账号：机器行（fleet p）+ 看板行（Swarm 主板，teams profiles↔boards 关联）
    await acct.trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sitp-machine-m:fs-1"]').exists()).toBe(true)
    expect(w.find('[data-testid="sitp-machine-m:fs-1"]').text()).toContain('fleet 复验确认')
    const board = w.find('[data-testid="sitp-board-b:swarm"]')
    expect(board.exists()).toBe(true)
    expect(board.text()).toContain('Swarm 主板')
    // ② 展开板：profile 清单 chips
    await board.trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sitp-board-profiles-b:swarm"]').text()).toContain('p')
    // ③ 检索：命中 [已移除]（无关联）→ swarm 板行隐藏；清词复位
    const search = w.find('[data-testid="sitp-online-search"]')
    await search.setValue('[已移除]')
    await flushPromises()
    expect(w.find('[data-testid="sitp-board-b:swarm"]').exists()).toBe(false)
    await search.setValue('')
    await flushPromises()
    expect(w.find('[data-testid="sitp-board-b:swarm"]').exists()).toBe(true)
    // 管理台开 people 区
    await w.find('[data-testid="sitp-open-gov"]').trigger('click')
    const flow = useFlowStore()
    expect(flow.govOpen).toBe(true)
    expect(flow.govSection).toBe('people')
    w.unmount()
  })
})
