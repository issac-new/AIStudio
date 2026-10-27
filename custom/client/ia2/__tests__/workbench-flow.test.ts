// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/workbench-flow.test.ts
// v12 工作台守门（2026-09-19 统一视图 Task 4）：左栏工作流导航（面板纯交互）
// + WorkbenchView 装配（行构建钩子/默认选择/路由跳转/挂接徽章）。
// v12.3（2026-09-20）：态势条迁页头（工作台退役守门在尾段 describe）+
// 三栏栏控折叠（flow.layout）；态势内联面板行为守门迁 ia-shell-header-sit.test.ts。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

vi.mock('@/custom/ia2/workflow', () => ({
  fetchWorkflowRuns: vi.fn(async () => [
    { id: 'wf-x1', name: 'wf-test-run', mode: 'parallel', status: 'done', createdAt: 1,
      steps: [
        { targetKind: 'identity', ref: 'worker-coder', instructions: 'i', status: 'ok', reply: 'r' },
        { targetKind: 'identity', ref: 'data-arch', instructions: 'i', status: 'ok', reply: 'r' },
      ] },
  ]),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// ── store 桩 ──
const roomStubs = vi.hoisted(() => {
  const rooms = [
    { roomId: '!r1:host', name: '应急指挥中心' },
    { roomId: '!r2:host', name: 'swarmstudio-发布' },
  ]
  const state = {
    sortedRooms: rooms,
    getRoomUnreadCount: (r: { roomId: string }) => (r.roomId === '!r1:host' ? 2 : 0),
    getRoomMemberList: (roomId: string) => ({
      admins: [], mods: [], invited: [],
      defaults: roomId === '!r1:host'
        ? [{ userId: '@you:host', name: '你' }, { userId: '@tl:host', name: 'TL' }]
        : [{ userId: '@x:host', name: 'x' }],
    }),
    createRoom: vi.fn(async () => { state.sortedRooms = [...rooms, { roomId: '!new:host', name: '新房间' }] }),
    // D3 兜底：onSelect 对 room 直调 selectRoom（幂等清未读/确保时间线挂载）
    selectRoom: vi.fn(),
  }
  return { state, useMatrixRoomStore: () => state }
})
// 工厂内包 reactive：state 身份恒定（组件 setup 闭包的是同一对象），后续测试
// 直接给 sortedRooms 赋新数组即可触发 useSessionRows 的 computed 翻案。
vi.mock('@/custom/matrix-chat/stores/matrix-room', async () => {
  const { reactive } = await import('vue')
  roomStubs.state = reactive(roomStubs.state)
  return { useMatrixRoomStore: () => roomStubs.state }
})
// 深链可靠装载（2026-10-01）：client store 桩——authenticated=true 但 client=null
// 模拟「已登录未建连」（ensureDeepLinkClient 应触发 initClient）；用例内可换 client。
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

const chatStubs = vi.hoisted(() => {
  const state = {
    sessions: [
      { id: 'sess-1', title: 'agent 会话 A', updatedAt: 1700 },
      { id: 'sess-2', title: 'agent 会话 B', updatedAt: 3000 },
    ],
    unreadMessages: new Map([['sess-1', { count: 4, lastPreview: '', lastRole: '', lastTs: 0 }]]),
  }
  return { state, useChatStore: () => state }
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: chatStubs.useChatStore }))

const kanbanStubs = vi.hoisted(() => {
  const state = {
    tasks: [
      { id: 't-402', tenant: '群:话题:@u:!r1:sess-1:matrix', session_id: null },
      { id: 't-407', tenant: null, session_id: 'sess-2' },
    ],
    moveTask: vi.fn(),
    blockTask: vi.fn(),
  }
  return { state, useKanbanStore: () => state }
})
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: kanbanStubs.useKanbanStore }))

const workspaceStubs = vi.hoisted(() => ({
  state: {
    refreshAllBoards: vi.fn(async () => true),
    tasks: [
      { id: 't-402', title: 'v2.28 发布', priority: 'P1', status: 'review', assignee: 'worker-coder', workspace: '', tenant: '群:话题:@u:!r1:sess-1:matrix', boardSlug: 'swarm', createdAt: 1000 },
      { id: 't-415', title: 'release notes', priority: 'P2', status: 'running', assignee: '你', workspace: '', tenant: null, boardSlug: 'swarm', createdAt: 2000 },
    ],
  },
  useWorkspaceStore: () => workspaceStubs.state,
}))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

const runsStubs = vi.hoisted(() => {
  const state = {
    runs: [{ runId: 'run-9', graphId: 'loop-lp-1', status: 'awaiting-input', updatedAt: null, stage: null, iteration: 0, lastActivityAt: null, cost: 0, events: [], pendingInterruptId: 'it-1' }],
    // V5 补遗⑤ M6：循环行落运行详情须能按 graphId 命中最新 run（原桩恒空）
    sortedRuns: [{ runId: 'run-9', graphId: 'loop-lp-1', status: 'awaiting-input', updatedAt: null, stage: null, iteration: 0, lastActivityAt: null, cost: 0, events: [], pendingInterruptId: 'it-1' }],
    resumeRun: vi.fn(),
  }
  return { state, useRunCenterStore: () => state }
})
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: runsStubs.useRunCenterStore }))

const cockpitStubs = vi.hoisted(() => {
  const state = {
    fleetSessions: [{ id: 'fs-1', profile: 'p', title: 'fleet 复验确认', status: 'idle', isAborting: false, queueLength: 0, runStartedAt: null, lastActiveAt: 42, source: '', agent: '', lastPreview: '', approvals: [{ approval_id: 'ap-1', preview: '', choices: [] }], clarifies: [], subagents: [] }],
    respondFleetApproval: vi.fn(),
    openRunTraceGlobal: vi.fn(),
  }
  return { state, useCockpitStore: () => state }
})
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))

const kanbanApiStubs = vi.hoisted(() => ({
  completeTasks: vi.fn(async () => ({ results: [] })),
  blockTask: vi.fn(async () => ({})),
  reopenReview: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/api/hermes/kanban', () => ({ completeTasks: kanbanApiStubs.completeTasks, blockTask: kanbanApiStubs.blockTask, reopenReview: kanbanApiStubs.reopenReview }))
// v12.4 中栏独立窗口走 wm/popout（web 降级 window.open）——桩住断言调用参数
const popoutStubs = vi.hoisted(() => ({ openPanelWindow: vi.fn(async () => {}) }))
vi.mock('../wm/popout', () => ({ openPanelWindow: popoutStubs.openPanelWindow }))
// 评审中心桩（v12.4 WorkbenchView 等我口径收编 useDecisionRows 的 gate 源）
vi.mock('@/custom/matrix-teams/stores/review-center', () => ({
  useReviewCenterStore: () => ({ pendingReviews: [], sendVerdict: vi.fn() }),
}))

vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({
  default: { name: 'KanbanTaskDrawer', props: ['show', 'taskId'], template: '<div class="drawer-stub" v-if="show" :data-taskid="taskId" />' },
}))
vi.mock('@/custom/matrix-chat/components/MatrixRoomCanvas.vue', () => ({
  default: { name: 'MatrixRoomCanvas', template: '<div class="room-canvas-stub" data-testid="room-canvas-stub" />' },
}))
vi.mock('@/views/hermes/ChatView.vue', () => ({
  default: { name: 'ChatView', template: '<div class="chat-view-stub" />' },
}))
vi.mock('@/views/hermes/GroupChatView.vue', () => ({
  default: { name: 'GroupChatView', template: '<div class="group-view-stub" data-testid="group-view-stub" />' },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest: { getSpec: vi.fn(async () => null), replay: vi.fn(async () => []), exportRun: vi.fn(async () => ({})) },
  connectGraph: vi.fn(), disconnectGraph: vi.fn(),
}))
const loopStubs = vi.hoisted(() => {
  const state = {
    loops: [{
      id: 'lp-1', name: 'release-pipeline', goal: '', stopCondition: '', pattern: 'daily-triage',
      schedule: { mode: 'manual' }, stage: 'validation', status: 'awaiting-review',
      autonomyLevel: 'L2', stateAdapter: 'local',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-19T14:00:00Z',
      lastTickAt: null, nextTickAt: null,
      stats: { totalIterations: 3, tasksDiscovered: 4, tasksCompleted: 2, tasksBlocked: 0, totalCost: 0, currentIteration: 3 },
    }],
    currentLoop: null,
    currentContracts: [{ id: 'c1', loopId: 'lp-1', status: 'submitted', assignee: 'maker', persistedTaskId: 't-415' }],
    currentEvents: [],
    fetchLoop: vi.fn(async (id: string) => {
      state.currentLoop = state.loops.find((l: { id: string }) => l.id === id) ?? null
    }),
  }
  return { state, useLoopStore: () => state }
})
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: loopStubs.useLoopStore }))

const groupStubs = vi.hoisted(() => ({
  state: {
    rooms: [{ id: 'gr-1', name: '产品群聊', lastActiveAt: 900 }],
    messages: [] as unknown[],
    setUserInfo: vi.fn(),
    createNewRoom: vi.fn(async () => ({ room: { id: 'gr-new', name: '新群聊' }, agents: [] })),
    deleteRoom: vi.fn(async () => {}),
  },
  useGroupChatStore: () => groupStubs.state,
}))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: groupStubs.useGroupChatStore }))

const registryStubs = vi.hoisted(() => {
  const state = {
    duties: { '!r2:host': { assigneeKind: 'account', assigneeId: '@tl:host', roomName: '值班室', updatedBy: '', updatedAt: '' } },
    accounts: [{ userId: '@tl:host', displayName: 'TL', agentTeams: [{ slug: 'swarm', name: 'swarm', profiles: ['p'] }], isLeader: true, declared: true as const }],
  }
  return { state, useTeamRegistryStore: () => state }
})
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({ useTeamRegistryStore: registryStubs.useTeamRegistryStore }))

import FlowNavPanel from '../components/flow/FlowNavPanel.vue'
import WorkbenchView from '../views/WorkbenchView.vue'
import { useFlowStore } from '../store/flow'
import type { FlowLoopRow, FlowSessionRow } from '../adapters/flow'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  // 分组/排序偏好走 settings-layers 持久化；jsdom 同文件跨用例共享，清掉防串味
  localStorage.clear()
})

const SESSIONS: FlowSessionRow[] = [
  { kind: 'room', id: '!r1', name: '应急指挥中心', unread: 2, taskIds: ['t-402'], teamTag: '[已移除]', dutyName: null, lastActivityAt: 200 },
  { kind: 'chat', id: 'c1', name: 'researcher', unread: 0, taskIds: [], teamTag: '', dutyName: null, lastActivityAt: 100 },
]
const LOOPS: FlowLoopRow[] = [
  { kind: 'loop', id: 'lp-1', name: 'release-pipeline', stageIndex: 3, stageTotal: 5, stageTone: 'run', progressPct: 70, statusKey: 'awaitingYou', awaitingYou: true, blocked: false, updatedAt: 1 },
]

describe('FlowNavPanel — 左栏工作流导航（纯交互）', () => {
  function mountPanel(props: { sessions?: FlowSessionRow[]; loops?: FlowLoopRow[]; selection?: { kind: string; id: string } | null } = {}) {
    return mount(FlowNavPanel, {
      props: {
        sessions: props.sessions ?? SESSIONS,
        loops: props.loops ?? LOOPS,
        selection: props.selection ?? null,
      },
    })
  }

  it('分组渲染会话行（未读红点/📋挂接徽章/团队标签）与工作流行（五轮 H 换面）', async () => {
    const w = mountPanel()
    const room = w.find('[data-testid="flow-session-!r1"]')
    expect(room.text()).toContain('应急指挥中心')
    expect(room.find('.flow-nav__unr').text()).toBe('2')
    expect(room.text()).toContain('📋1')
    expect(room.text()).toContain('[已移除]')
    // 五轮 H：循环卡已换面工作流行（数据自取 /api/ia2/workflow/runs，mock 见文件头）
    await new Promise(r => setTimeout(r, 30))
    const wfRow = w.find('[data-testid^="wf-row-"]')
    expect(wfRow.exists()).toBe(true)
    expect(wfRow.text()).toContain('wf-test-run')
  })

  it('分类聚类：按工作区分组（会话经挂接任务反查；无挂接落未关联组）', async () => {
    const w = mount(FlowNavPanel, {
      props: {
        sessions: SESSIONS,
        loops: LOOPS,
        selection: null,
        workspaceBySession: { 'room:!r1': '/lab/pay' },
      },
    })
    await w.find('[data-testid="flow-group-by"]').setValue('workspace')
    expect(w.find('[data-testid="flow-group-workspace-0"]').exists()).toBe(true)
    expect(w.text()).toContain('/lab/pay')
    expect(w.text()).toContain('未关联工作区')
    w.unmount()
  })

  it('过滤 chips 与搜索框联动（会话/循环互斥、任务号匹配）', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-filter-loop"]').trigger('click')
    expect(w.find('[data-testid="flow-session-!r1"]').exists()).toBe(false)
    await new Promise(r => setTimeout(r, 20))
    expect(w.find('[data-testid^="wf-row-"]').exists()).toBe(true)
    await w.find('[data-testid="flow-filter-session"]').trigger('click')
    expect(w.find('[data-testid^="wf-row-"]').exists()).toBe(false)
    await w.find('[data-testid="flow-filter-all"]').trigger('click')
    await w.find('[data-testid="flow-search"]').setValue('t-402')
    expect(w.find('[data-testid="flow-session-!r1"]').exists()).toBe(true)
    expect(w.find('[data-testid="flow-session-c1"]').exists()).toBe(false)
  })

  it('行点击 emit select；空态渲染', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-session-!r1"]').trigger('click')
    expect(w.emitted('select')![0][0]).toEqual({ kind: 'room', id: '!r1' })
    await new Promise(r => setTimeout(r, 20))
    const wfRow = w.find('[data-testid^="wf-row-"]')
    await wfRow.trigger('click')
    const sel = w.emitted('select')![1][0] as { kind: string; id: string }
    expect(sel.kind).toBe('loop')
    const empty = mountPanel({ sessions: [], loops: [] })
    expect(empty.find('[data-testid="flow-empty"]').exists()).toBe(true)
  })

  it('通道行可点击展开状态详情（五轮 I：死功能激活）——再点收起', async () => {
    const w = mount(FlowNavPanel, { props: { sessions: [], loops: [], selection: null, agents: [
      { name: 'zcode', busyState: 'idle' as const, sessionCount: 1, source: 'platform' as const },
      { name: 'feishu', busyState: 'offline' as const, sessionCount: 0, source: 'platform' as const },
    ] } })
    await w.find('[data-testid="flow-agent-zcode"]').trigger('click')
    expect(w.find('[data-testid="flow-channel-zcode"]').exists()).toBe(true)
    expect(w.find('[data-testid="flow-channel-zcode"]').text()).toContain('来源')
    await w.find('[data-testid="flow-agent-zcode"]').trigger('click')
    expect(w.find('[data-testid="flow-channel-zcode"]').exists()).toBe(false)
  })

  it('v14 单一聊天列表：三类混排按最近活动降序、kind 图标行首、旧三小节退役', () => {
    const w = mountPanel()
    expect(w.find('[data-testid="flow-cluster-chat-all"]').exists()).toBe(true)
    expect(w.find('[data-testid="flow-group-chats"]').exists()).toBe(true)
    // 旧三小节（房间/群聊/会话分节）退役
    expect(w.find('[data-testid="flow-cluster-room"]').exists()).toBe(false)
    expect(w.find('[data-testid="flow-cluster-group"]').exists()).toBe(false)
    expect(w.find('[data-testid="flow-cluster-chat"]').exists()).toBe(false)
    // 混排降序：room(200) 先于 chat(100)；行首 kind 图标
    const rows = w.findAll('.flow-nav__row')
    expect(rows[0].attributes('data-kind')).toBe('room')
    expect(rows[1].attributes('data-kind')).toBe('chat')
    expect(rows[0].find('.flow-nav__kind').text()).toBe('#')
    expect(rows[1].find('.flow-nav__kind').text()).toBe('💬')
    // group 行混排插入（lastActivityAt 最大者居首）且带 ✕ 删除
    const w2 = mountPanel({ sessions: [...SESSIONS, { kind: 'group', id: 'gr-9', name: '远端协同群', unread: 0, taskIds: [], teamTag: '', dutyName: null, lastActivityAt: 999 }] })
    const rows2 = w2.findAll('.flow-nav__row')
    expect(rows2[0].attributes('data-kind')).toBe('group')
    expect(w2.find('[data-testid="flow-del-group-gr-9"]').exists()).toBe(true)
    expect(w2.find('[data-testid="flow-del-group-!r1"]').exists()).toBe(false)
  })

  it('v14 群聊行 ✕ emit delete-group（不触发行选中）', async () => {
    const w = mountPanel({ sessions: [{ kind: 'group', id: 'gr-9', name: '远端协同群', unread: 0, taskIds: [], teamTag: '', dutyName: null, lastActivityAt: 1 }] })
    await w.find('[data-testid="flow-del-group-gr-9"]').trigger('click')
    expect(w.emitted('delete-group')![0][0]).toBe('gr-9')
    expect(w.emitted('select')).toBeUndefined()
  })

  it('R4a 任务簇：📋N 点击就地展开任务 chip；chip 点击 emit open-task、双击 emit jump-ide；行双击携带首个任务', async () => {
    const w = mountPanel()
    const row = w.find('[data-testid="flow-session-!r1"]')
    expect(w.find('[data-testid="flow-cluster-tasks-!r1"]').exists()).toBe(false)
    await row.find('.flow-nav__cnt--btn').trigger('click')
    expect(w.find('[data-testid="flow-cluster-tasks-!r1"]').exists()).toBe(true)
    const chip = w.find('[data-testid="flow-task-t-402"]')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    expect(w.emitted('open-task')![0][0]).toBe('t-402')
    await chip.trigger('dblclick')
    expect(w.emitted('jump-ide')![0][0]).toBe('t-402')
    await row.trigger('dblclick')
    expect(w.emitted('jump-ide')![1][0]).toBe('t-402')
    // 无挂接任务行双击：裸进（null）
    await w.find('[data-testid="flow-session-c1"]').trigger('dblclick')
    expect(w.emitted('jump-ide')![2][0]).toBe(null)
    await row.find('.flow-nav__cnt--btn').trigger('click')
    expect(w.find('[data-testid="flow-cluster-tasks-!r1"]').exists()).toBe(false)
  })

  it('栏底动作（五轮 G）：主按钮直达统一聊天且为唯一入口——▾ 菜单/特殊形态/建房输入全退役', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-new-session"]').trigger('click')
    expect(w.emitted('open-identity-chat')).toHaveLength(1)
    expect(w.find('[data-testid="flow-new-menu"]').exists()).toBe(false)
    expect(w.find('[data-testid="flow-new-session-more"]').exists()).toBe(false)
    expect(w.find('[data-testid="flow-create-input"]').exists()).toBe(false)
    expect(w.find('[data-testid="flow-new-loop"]').exists()).toBe(false)
    await w.find('[data-testid="flow-gov"]').trigger('click')
    expect(w.emitted('open-gov')).toHaveLength(1)
  })
})

describe('WorkbenchView — 装配（行构建/默认选择/路由跳转）', () => {
  function makeRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/app',
        children: [
          { path: '', name: 'ia2.collab', component: WorkbenchView },
          { path: 's/chat', name: 'ia2.collabChat', component: WorkbenchView },
          { path: 's/chat/:sessionId', name: 'ia2.collabSession', component: WorkbenchView },
          { path: 's/room/:roomId', name: 'ia2.commsRoom', component: WorkbenchView },
          { path: 's/group/:roomId', name: 'ia2.groupRoom', component: WorkbenchView },
          // Task 3（2026-10-27 分域）：/app/l 是 Legacy Loop 薄详情组件路由（本地桩）
          { path: 'l/:loopId', name: 'ia2.loopCanvas', component: { template: '<div loop-detail />' } },
          { path: 'runs', name: 'ia2.runs', component: { template: '<div runs />' } },
          { path: 'runs/:runId', name: 'ia2.runDetail', component: { template: '<div run-detail />' } },
          { path: 'eng', name: 'ia2.eng', redirect: () => ({ name: 'ia2.deliveryCases' }) },
          { path: 'cases', name: 'ia2.deliveryCases', component: { template: '<div cases />' } },
          { path: 'board', name: 'ia2.board', component: { template: '<div board />' } },
        ],
        component: { template: '<router-view />' },
      }, {
        path: '/ide',
        name: 'ide.shell',
        component: { template: '<div ide />' },
      }],
    })
  }

  async function mountAt(path: string) {
    const router = makeRouter()
    router.push(path)
    await router.isReady()
    const wrapper = mount(WorkbenchView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, router }
  }

  it('无路由选择=中性空态（不隐式选首会话）；路由选中后 flow store 同步；挂接/未读/duty 团队徽章', async () => {
    // 2026-10-27 Task 4：路由是唯一选择来源——'' 不再隐式选首会话
    // （对象标题区曾显示用户从未打开过的房间名）。
    const { wrapper, router } = await mountAt('/app')
    const flow = useFlowStore()
    expect(flow.selected).toBeNull()
    expect(wrapper.find('[data-testid="wb-canvas-none"]').exists()).toBe(true)
    // 徽章与选择无关：房间 rank = now - i*1000（now ≈ Date.now() ≫ 会话 updatedAt 3000），首房间居首
    const row = wrapper.find('[data-testid="flow-session-!r1:host"]')
    expect(row.text()).toContain('📋1')
    expect(row.find('.flow-nav__unr').text()).toBe('2')
    // duty 团队标签：!r2 的值守 TL(@tl:host) → 其 agentTeam slug swarm
    expect(wrapper.find('[data-testid="flow-session-!r2:host"]').text()).toContain('swarm')
    // 路由选中（同序首房间）→ flow store 同步
    await router.push({ name: 'ia2.commsRoom', params: { roomId: '!r1:host' } })
    await flushPromises()
    expect(flow.selected).toEqual({ kind: 'room', id: '!r1:host' })
  })

  it('点击会话/循环行 → 路由子路径；循环行落运行详情（V5 ⑤ M6：画布并入详情页）', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-session-!r2:host"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.commsRoom')
    expect(router.currentRoute.value.params.roomId).toBe('!r2:host')
    await wrapper.find('[data-testid="flow-session-sess-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collabSession')
    expect(router.currentRoute.value.params.sessionId).toBe('sess-1')
    // 五轮 H：循环行已换工作流行（wf-x1 来自 mock）→ 直达工作流详情 ?wf=
    await flushPromises()
    await wrapper.find('[data-testid="wf-row-wf-x1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collab')
    expect(router.currentRoute.value.query.wf).toBe('wf-x1')
  })

  it('＋新循环入口已退役（⑤ S5：/app/eng 重定向交付案例）；⚙管理直达看板（2026-10-21 治理面收口）', async () => {
    const { wrapper, router } = await mountAt('/app')
    expect(wrapper.find('[data-testid="flow-new-loop"]').exists()).toBe(false)
    await router.push('/app/eng')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.deliveryCases')
    const { wrapper: w2, router: r2 } = await mountAt('/app')
    await w2.find('[data-testid="flow-gov"]').trigger('click')
    await flushPromises()
    expect(r2.currentRoute.value.name).toBe('ia2.board')
  })

  // ── 深链房间可靠装载（2026-10-01 产品修复）──
  // 死锁链：深链列表外房间 → SessionCanvas 不渲染 → MatrixRoomCanvas 的
  // onMounted initClient 兜底不触发 → 房间永不进列表。视图层三守门：
  // 同步中态+initClient 兜底 / 到位自愈 / 超时不可达+重试补 join。
  it('深链到列表外房间：显示同步中态（非"未选择"误导空态）并触发 initClient 兜底', async () => {
    matrixClientStubs.state.client = null
    matrixClientStubs.state.initClient.mockClear()
    const { wrapper } = await mountAt('/app/s/room/!missing:host')
    const st = wrapper.find('[data-testid="wb-canvas-deeplink-state"]')
    expect(st.exists()).toBe(true)
    expect(st.text()).toContain('正在同步会话')
    expect(wrapper.text()).not.toContain('未选择会话或循环')
    expect(matrixClientStubs.state.initClient).toHaveBeenCalled()
  })

  it('房间同步到位后自愈：列表出现该房 → 画布切真实会话（不再停留同步态）', async () => {
    const had = [...roomStubs.state.sortedRooms]
    const { wrapper } = await mountAt('/app/s/room/!late:host')
    expect(wrapper.find('[data-testid="wb-canvas-deeplink-state"]').exists()).toBe(true)
    // matrix Sync 推送到达：房间进列表（reactive state，属性赋值即触发 computed）
    roomStubs.state.sortedRooms = [...had, { roomId: '!late:host', name: '后到的房间' }]
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-canvas-deeplink-state"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="room-canvas-stub"]').exists()).toBe(true)
    roomStubs.state.sortedRooms = had
  })

  it('15s 看门狗：超时判不可达 + 重试按钮；重试对已建连 client 主动补 joinRoom', async () => {
    const had = [...roomStubs.state.sortedRooms]
    vi.useFakeTimers()
    try {
      const joinRoom = vi.fn(async () => ({}))
      matrixClientStubs.state.client = { joinRoom }
      const { wrapper } = await mountAt('/app/s/room/!invited:host')
      expect(wrapper.find('[data-testid="wb-canvas-ph-retry"]').exists()).toBe(false)
      vi.advanceTimersByTime(15000)
      await flushPromises()
      const st = wrapper.find('[data-testid="wb-canvas-deeplink-state"]')
      expect(st.text()).toContain('会话不可达或未加入')
      const retry = wrapper.find('[data-testid="wb-canvas-ph-retry"]')
      expect(retry.exists()).toBe(true)
      await retry.trigger('click')
      await flushPromises()
      expect(joinRoom).toHaveBeenCalledWith('!invited:host')
    } finally {
      vi.useRealTimers()
      matrixClientStubs.state.client = null
      roomStubs.state.sortedRooms = had
    }
  })

  it('R4b 群聊入列与分派：群聊行在群聊簇 → 点击路由 ia2.groupRoom → 中栏 GroupChatView', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-session-gr-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.groupRoom')
    expect(router.currentRoute.value.params.roomId).toBe('gr-1')
    expect(wrapper.find('[data-testid="group-view-stub"]').exists()).toBe(true)
  })

  it('房间页邀请分流（五轮 F）：room 类型弹 Matrix 邀请对话框不跳路由；非 room 维持跳历史页', async () => {
    const { wrapper, router } = await mountAt('/app/s/room/!r1:host')
    await flushPromises()
    // room 语境：点「＋邀请」→ 对话框出现、路由不动
    await wrapper.find('[data-testid="participants-invite"]').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'MatrixInviteDialog' }).exists()).toBe(true)
    expect(router.currentRoute.value.name).toBe('ia2.commsRoom')
  })

  it('五轮 G：agent 单聊/群聊/建房旧入口退役（统一聊天窗口为唯一新聊天路径）；群聊 ✕ 确认后 → store.deleteRoom', async () => {
    const { wrapper } = await mountAt('/app')
    expect(wrapper.find('[data-testid="flow-new-chat-agent"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="flow-new-chat-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="flow-new-session-more"]').exists()).toBe(false)
    // 删除群聊（非当前选中）：先过不可逆确认（D6，2026-10-22 走查批）；
    // 确认取消 → 零调用；确认放行 → 只调 store，不动路由
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { wrapper: w2, router: r2 } = await mountAt('/app')
    await w2.find('[data-testid="flow-del-group-gr-1"]').trigger('click')
    await flushPromises()
    expect(groupStubs.state.deleteRoom).not.toHaveBeenCalled()
    confirmSpy.mockReturnValue(true)
    await w2.find('[data-testid="flow-del-group-gr-1"]').trigger('click')
    await flushPromises()
    expect(groupStubs.state.deleteRoom).toHaveBeenCalledWith('gr-1')
    expect(r2.currentRoute.value.name).toBe('ia2.collab')
    confirmSpy.mockRestore()
  })

  it('R4a 动线⑤：左栏任务簇 chip → 就地开抽屉；行双击 → ide.shell?task=（useIdeJump）', async () => {
    const { wrapper } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-session-!r1:host"] .flow-nav__cnt--btn').trigger('click')
    await wrapper.find('[data-testid="flow-task-t-402"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.drawer-stub').attributes('data-taskid')).toBe('t-402')
    const { wrapper: w2, router: r2 } = await mountAt('/app')
    await w2.find('[data-testid="flow-session-!r1:host"]').trigger('dblclick')
    await flushPromises()
    expect(r2.currentRoute.value.name).toBe('ide.shell')
    expect(r2.currentRoute.value.query.task).toBe('t-402')
    // 无挂接任务行（!r2 无 tenant/session_id 挂接）双击：裸进 IDE
    const { wrapper: w3, router: r3 } = await mountAt('/app')
    await w3.find('[data-testid="flow-session-!r2:host"]').trigger('dblclick')
    await flushPromises()
    expect(r3.currentRoute.value.name).toBe('ide.shell')
    expect(r3.currentRoute.value.query.task).toBeUndefined()
  })
})

describe('WorkbenchView — 右栏任务与决策（Task 5）', () => {
  function makeTdpRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/app',
        component: { template: '<router-view />' },
        children: [
          { path: '', name: 'ia2.collab', component: WorkbenchView },
          { path: 's/chat', name: 'ia2.collabChat', component: WorkbenchView },
          { path: 's/chat/:sessionId', name: 'ia2.collabSession', component: WorkbenchView },
          { path: 's/room/:roomId', name: 'ia2.commsRoom', component: WorkbenchView },
          // Task 3（2026-10-27 分域）：/app/l 是 Legacy Loop 薄详情组件路由（本地桩）
          { path: 'l/:loopId', name: 'ia2.loopCanvas', component: { template: '<div loop-detail />' } },
          { path: 'runs', name: 'ia2.runs', component: { template: '<div runs />' } },
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

  async function mountTdp(path: string) {
    const router = makeTdpRouter()
    router.push(path)
    await router.isReady()
    const wrapper = mount(WorkbenchView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, router }
  }

  it('等我三源渲染：review 任务（验收/打回）+ awaiting 运行（确认）+ fleet 审批（确认）', async () => {
    const { wrapper } = await mountTdp('/app')
    expect(wrapper.find('[data-testid="tdp-wait-task:t-402"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tdp-wait-run:run-9"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tdp-wait-fleet:fs-1:ap-1"]').exists()).toBe(true)
  })

  it('动线④就地决策：验收→completeTasks(任务所在板)；打回→blockTask(reason)；确认运行→resumeRun；确认 fleet→respondFleetApproval', async () => {
    const { wrapper } = await mountTdp('/app')
    await wrapper.find('[data-testid="tdp-approve-t-402"]').trigger('click')
    await flushPromises()
    expect(kanbanApiStubs.completeTasks).toHaveBeenCalledWith(['t-402'], undefined, { board: 'swarm' })
    await wrapper.find('[data-testid="tdp-reject-t-402"]').trigger('click')
    await flushPromises()
    expect(kanbanApiStubs.reopenReview).toHaveBeenCalledWith(['t-402'], 'ia2.tdp.rejectReason', { board: 'swarm' })
    expect(kanbanApiStubs.blockTask).not.toHaveBeenCalled()
    await wrapper.find('[data-testid="tdp-confirm-run-run-9"]').trigger('click')
    expect(runsStubs.state.resumeRun).toHaveBeenCalledWith('run-9', true)
    await wrapper.find('[data-testid="tdp-confirm-fleet-fs-1"]').trigger('click')
    expect(cockpitStubs.state.respondFleetApproval).toHaveBeenCalledWith('fs-1', 'ap-1', 'once')
    // 拒绝链守门（24h review 2026-09-23：emit 断链曾致 run/fleet 拒绝按钮静默无效）
    await wrapper.find('[data-testid="tdp-reject-run-run-9"]').trigger('click')
    expect(runsStubs.state.resumeRun).toHaveBeenCalledWith('run-9', false)
    await wrapper.find('[data-testid="tdp-reject-fleet-fs-1"]').trigger('click')
    expect(cockpitStubs.state.respondFleetApproval).toHaveBeenCalledWith('fs-1', 'ap-1', 'deny')
  })

  it('挂接任务随会话选择变化：tenant 挂接；改派开抽屉；⌨跳 IDE（V5 ⑤ M6：循环挂接迁运行详情页）', async () => {
    // 2026-10-27 Task 4：无隐式默认选择——挂接任务断言须落在路由选中的房间上
    const { wrapper, router } = await mountTdp('/app/s/room/!r1:host')
    // 路由选中 !r1 → t-402（tenant 六段式挂接）；t-415 不在
    expect(wrapper.find('[data-testid="tdp-task-t-402"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tdp-task-t-415"]').exists()).toBe(false)
    // 五轮 H：循环行点击已改道工作流详情（旧 runDetail 迁移断言退役）
    // 改派 → 抽屉开（task-id 透传）
    await wrapper.find('[data-testid="tdp-reassign-t-402"]').trigger('click')
    expect(wrapper.find('.drawer-stub').attributes('data-taskid')).toBe('t-402')
    // ⌨ → ide.shell?task=
    await wrapper.find('[data-testid="tdp-ide-t-402"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ide.shell')
    expect(router.currentRoute.value.query.task).toBe('t-402')
  })

  it('全部时间线 → cockpit.openRunTraceGlobal；动态流渲染 FeedRow', async () => {
    const { wrapper } = await mountTdp('/app')
    await wrapper.find('[data-testid="tdp-timeline-all"]').trigger('click')
    expect(cockpitStubs.state.openRunTraceGlobal).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="tdp-feed"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ia2.feed.taskCreated')
  })
})

describe('WorkbenchView — v12.3 态势迁页头 + 三栏折叠（栏控）', () => {
  function makeRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/app',
        component: { template: '<router-view />' },
        children: [
          { path: '', name: 'ia2.collab', component: WorkbenchView },
          { path: 's/room/:roomId', name: 'ia2.commsRoom', component: WorkbenchView },
          // Task 3（2026-10-27 分域）：/app/l 是 Legacy Loop 薄详情组件路由（本地桩）
          { path: 'l/:loopId', name: 'ia2.loopCanvas', component: { template: '<div loop-detail />' } },
          { path: 'runs', name: 'ia2.runs', component: { template: '<div runs />' } },
          { path: 'runs/:runId', name: 'ia2.runDetail', component: { template: '<div run-detail />' } },
          { path: 'board', name: 'ia2.board', component: { template: '<div board />' } },
        ],
      }],
    })
  }

  async function mountWb(path: string) {
    const router = makeRouter()
    router.push(path)
    await router.isReady()
    const wrapper = mount(WorkbenchView, { global: { plugins: [router] } })
    await flushPromises()
    return { wrapper, router }
  }

  it('退役守门：六态势 chips 与内联面板迁页头——工作台源码不再渲染 SitlineBar/SitDetailPanel', () => {
    const src = readFileSync(resolve(__dirname, '../views/WorkbenchView.vue'), 'utf8')
    // 查 import/渲染语句而非裸词（迁移说明的注释允许提及组件名）
    expect(src).not.toContain('import SitlineBar')
    expect(src).not.toContain('<SitlineBar')
    expect(src).not.toContain('import SitDetailPanel')
    expect(src).not.toContain('<SitDetailPanel')
    // 页头是唯一渲染点（IaShellHeader 内联面板浮层）
    const header = readFileSync(resolve(__dirname, '../components/IaShellHeader.vue'), 'utf8')
    expect(header).toContain('<SitlineBar')
    expect(header).toContain('<SitDetailPanel')
  })

  it('默认三栏在位（左 250 | 中自适应 | 右 240 铁律不破）', async () => {
    const { wrapper } = await mountWb('/app')
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-center"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-root"]').classes()).not.toContain('wb--lf')
  })

  it('栏控单钮切换（2026-10-23 四轮）：三栏各一个最大化切换钮，中栏另有独立窗口；任意栏可独占/还原；导轨展开脱离独占', async () => {
    const { wrapper } = await mountWb('/app/s/chat/s1')
    // 三栏各一个切换钮（单钮；min 钮已并入切换），中栏多 ⧉ 独立窗口
    expect(wrapper.find('[data-testid="ia-col-left-max"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-col-left-min"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ia-col-center-max"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-col-center-popout"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-col-right-max"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-col-right-popout"]').exists()).toBe(false)
    // 左栏切换钮 → 左栏独占（右中齐折出导轨）；再点同钮 → 还原三栏
    await wrapper.find('[data-testid="ia-col-left-max"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wb-rail-right"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-rail-center"]').exists()).toBe(true)
    await wrapper.find('[data-testid="ia-col-left-max"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-center"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(true)
    // 中栏独占：右导轨 ◀ 展开即脱离独占（右栏恢复，中栏仍展）
    await wrapper.find('[data-testid="ia-col-center-max"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(false)
    await wrapper.find('[data-testid="wb-unfold-right"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(true)
    // 右栏独占：中栏导轨展开 → 脱离独占回到多栏
    const flow = useFlowStore()
    flow.toggleMax('right')
    await flushPromises()
    expect(flow.maximized).toBe('right')
    expect(wrapper.find('[data-testid="wb-center"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wb-rail-center"]').exists()).toBe(true)
    await wrapper.find('[data-testid="wb-unfold-center"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-center"]').exists()).toBe(true)
    expect(flow.maximized).toBe('none')
    // 中栏独立窗口：弹当前对象路由
    await wrapper.find('[data-testid="ia-col-center-popout"]').trigger('click')
    expect(popoutStubs.openPanelWindow).toHaveBeenCalledWith({ path: '/app/s/chat/s1' })
  })

  it('栏控折叠：toggleFold(left) 摘左栏；toggleFold(right) 摘右栏；还原恢复', async () => {
    const { wrapper } = await mountWb('/app')
    const flow = useFlowStore()
    flow.toggleFold('left')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wb-center"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(true)
    flow.toggleFold('left')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(true)
    flow.toggleFold('right')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(false)
    flow.toggleFold('right')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(true)
  })

  it('中栏最大化 = 两侧齐折（toggleCenterMax 派生态）；再切回全展', async () => {
    const { wrapper } = await mountWb('/app')
    const flow = useFlowStore()
    flow.toggleCenterMax()
    await flushPromises()
    expect(flow.centerMaximized).toBe(true)
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wb-center"]').exists()).toBe(true)
    flow.toggleCenterMax()
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(true)
  })
})

describe('WorkbenchView — P4③ 群任务流转时间线（2026-09-29 消息源按选择类别分派）', () => {
  function makeFlowRouter(): Router {
    return createRouter({
      history: createMemoryHistory(),
      routes: [{
        path: '/app',
        component: { template: '<router-view />' },
        children: [
          { path: '', name: 'ia2.collab', component: WorkbenchView },
          { path: 's/chat', name: 'ia2.collabChat', component: WorkbenchView },
          { path: 's/chat/:sessionId', name: 'ia2.collabSession', component: WorkbenchView },
          { path: 's/room/:roomId', name: 'ia2.commsRoom', component: WorkbenchView },
          { path: 's/group/:roomId', name: 'ia2.groupRoom', component: WorkbenchView },
          { path: 'board', name: 'ia2.board', component: { template: '<div board />' } },
        ],
      }, {
        path: '/ide', name: 'ide.shell', component: { template: '<div ide />' },
      }],
    })
  }

  const GROUP_MSGS = [
    { id: 'm1', senderName: 'bella', content: '派发任务 card=t_ab12cd34 @fanfan-agent:matrix.test 请开始系统分析', timestamp: 1759000040000 },
    { id: 'm2', senderName: 'fanfan-agent', content: '【完成回执】t_ab12cd34 已完成', timestamp: 1759000050000 },
    { id: 'm3', senderName: 'mei', content: '流式生成中的无关内容', timestamp: 1759000060000, isStreaming: true },
  ]

  it('group 选择：group-chat store 消息解析出派发+完成回执 → 右栏时间线渲染（streaming 不入流）', async () => {
    ;(groupStubs.state as { messages?: unknown[] }).messages = GROUP_MSGS
    const router = makeFlowRouter()
    router.push('/app/s/group/gr-1')
    await router.isReady()
    const wrapper = mount(WorkbenchView, { global: { plugins: [router] } })
    await flushPromises()
    const sec = wrapper.find('[data-testid="tdp-flow-sec"]')
    expect(sec.exists()).toBe(true)
    expect(sec.text()).toContain('fanfan-agent')
    expect(sec.text()).toContain('完成回执')
    expect(sec.text()).not.toContain('流式生成中的无关内容')
    delete (groupStubs.state as { messages?: unknown[] }).messages
  })

  it('room 选择走 matrix-room 消息源：群消息不串门（修复前分析群面板未出数的反向守门）', async () => {
    ;(groupStubs.state as { messages?: unknown[] }).messages = GROUP_MSGS
    const router = makeFlowRouter()
    router.push('/app/s/room/!r1:host')
    await router.isReady()
    const wrapper = mount(WorkbenchView, { global: { plugins: [router] } })
    await flushPromises()
    // room 选择不读群消息（matrix-room 桩无消息）→ 时间线不渲染，群消息零残留
    expect(wrapper.find('[data-testid="tdp-flow-sec"]').exists()).toBe(false)
    delete (groupStubs.state as { messages?: unknown[] }).messages
  })
})
