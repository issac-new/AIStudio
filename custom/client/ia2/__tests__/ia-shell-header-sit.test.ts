// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell-header-sit.test.ts
// 页头态势面板守门（v12.3 2026-09-20 用户裁定：六态势 chips 自 WorkbenchView
// 迁入 IaShellHeader，SitDetailPanel 就地浮层）。行为断言承接 v12.2 工作台
// 内联面板（workbench-flow.test.ts 尾段退役守门），动线差异：页头无中栏画布
// 与看板抽屉——任务行走看板预选路由（ia2.board?task=），会话/循环行同样经
// 路由落到工作台子路径。数据面走真 composables（useSitCounts/useSessionRows/
// useDecisionRows/useDecisionActions——store 桩注入；决策动作断言 kanbanApi 层，
// 板定位=任务自身 boardSlug）。i18n 走全局 setup mock（t 直返 key）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ path: '/app', fullPath: '/app', query: {} }),
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

// 评审中心桩（useDecisionRows 的 gate 源；决策动作断言在 kanbanApi 层）
vi.mock('@/custom/matrix-teams/stores/review-center', () => ({
  useReviewCenterStore: () => ({ pendingReviews: [], sendVerdict: vi.fn() }),
}))

// 轻组件桩：探测组（retain 轮询；storeToRefs 逐键要求 ref——值全 ref 化）/
// 栏控（ide store 链）/语言直切/主题
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
vi.mock('../components/IaWindowControls.vue', () => ({ default: { name: 'IaWindowControls', template: '<div class="wm-stub" />' } }))

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

describe('IaShellHeader — 态势 chips + 内联面板（v12.3 迁入）', () => {
  it('六段 chips 在页头渲染（等我/任务/会话/循环/在线；计数自桩数据面）', async () => {
    const w = await mountHeader()
    // 等我=3（review t-402 + awaiting run-9 + fleet ap-1）；任务=2（1 运行）；
    // 会话=2（房 1 + 会话 1）；循环=1；在线：人 1 / 机 1
    expect(w.find('[data-testid="sit-waiting"]').text()).toContain('3')
    expect(w.find('[data-testid="sit-tasks"]').text()).toContain('2')
    expect(w.find('[data-testid="sit-sessions"]').text()).toContain('2')
    expect(w.find('[data-testid="sit-loops"]').exists()).toBe(true)
    expect(w.find('[data-testid="sit-online"]').text()).toContain('3')
    w.unmount()
  })

  it('任务段：就地展开浮层；任务行 → 看板预选路由（页头无抽屉）；同段再点收起', async () => {
    const w = await mountHeader()
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sit-panel-tasks"]').exists()).toBe(true)
    expect(w.find('[data-testid="sit-tasks"]').classes()).toContain('sit__item--on')
    expect(w.find('[data-testid="sitp-task-t-402"]').exists()).toBe(true)
    await w.find('[data-testid="sitp-task-t-402"]').trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({ name: 'ia2.board', query: { task: 't-402' } })
    expect(w.find('[data-testid="sit-panel-tasks"]').exists()).toBe(false)
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    expect(w.find('[data-testid="sit-panel-tasks"]').exists()).toBe(true)
    await w.find('[data-testid="sit-tasks"]').trigger('click')
    expect(w.find('[data-testid="sit-panel-tasks"]').exists()).toBe(false)
    w.unmount()
  })

  it('等我段：面板行上就地决策（验收 completeTasks/打回 reopenReview，任务所在板）', async () => {
    const w = await mountHeader()
    await w.find('[data-testid="sit-waiting"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sit-panel-waiting"]').exists()).toBe(true)
    await w.find('[data-testid="sitp-approve"]').trigger('click')
    await flushPromises()
    expect(kanbanApiStubs.completeTasks).toHaveBeenCalledWith(['t-402'], undefined, { board: 'swarm' })
    await w.find('[data-testid="sitp-reject"]').trigger('click')
    await flushPromises()
    expect(kanbanApiStubs.reopenReview).toHaveBeenCalledWith(['t-402'], 'ia2.tdp.rejectReason', { board: 'swarm' })
    w.unmount()
  })

  it('循环段：面板行 → 循环画布子路径；会话段：面板行 → 房间子路径（路由承载选择）', async () => {
    const w = await mountHeader()
    await w.find('[data-testid="sit-loops"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sitp-loop-lp-1"]').exists()).toBe(true)
    await w.find('[data-testid="sitp-loop-lp-1"]').trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({ name: 'ia2.loopCanvas', params: { loopId: 'lp-1' } })
    expect(w.find('[data-testid="sit-panel-loops"]').exists()).toBe(false)
    await w.find('[data-testid="sit-sessions"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="sitp-session-room-!r1:host"]').exists()).toBe(true)
    await w.find('[data-testid="sitp-session-room-!r1:host"]').trigger('click')
    await flushPromises()
    expect(pushMock).toHaveBeenCalledWith({ name: 'ia2.commsRoom', params: { roomId: '!r1:host' } })
    w.unmount()
  })

  it('在线段：三栏明细（人/智能体队/机器）+ 管理台入口开 people 区', async () => {
    const w = await mountHeader()
    await w.find('[data-testid="sit-online"]').trigger('click')
    await flushPromises()
    const panel = w.find('[data-testid="sit-panel-online"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('TL')
    expect(panel.text()).toContain('swarm')
    expect(panel.text()).toContain('p')
    await w.find('[data-testid="sitp-open-gov"]').trigger('click')
    const flow = useFlowStore()
    expect(flow.govOpen).toBe(true)
    expect(flow.govSection).toBe('people')
    w.unmount()
  })
})
