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
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: roomStubs.useMatrixRoomStore }))

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
    sortedRuns: [],
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
vi.mock('@/custom/loop/runcenter/components/RunGraphCanvas.vue', () => ({
  default: { name: 'RunGraphCanvas', props: ['graph', 'entryNode'], template: '<div class="rgc-stub" />' },
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

  it('分组渲染会话行（未读红点/📋挂接徽章/团队标签）与循环卡（进度%/阶段分段/状态）', () => {
    const w = mountPanel()
    const room = w.find('[data-testid="flow-session-!r1"]')
    expect(room.text()).toContain('应急指挥中心')
    expect(room.find('.flow-nav__unr').text()).toBe('2')
    expect(room.text()).toContain('📋1')
    expect(room.text()).toContain('[已移除]')
    const loop = w.find('[data-testid="flow-loop-lp-1"]')
    expect(loop.text()).toContain('release-pipeline')
    expect(loop.text()).toContain('70%')
    expect(loop.text()).toContain('ia2.loop.status.awaitingYou')
    // 阶段分段：3 done + 1 run + 1 todo
    const segs = loop.findAll('.flow-nav__seg')
    expect(segs).toHaveLength(5)
    expect(segs[0].classes()).toContain('flow-nav__seg--done')
    expect(segs[3].classes()).toContain('flow-nav__seg--run')
    expect(segs[4].classes()).toContain('flow-nav__seg--todo')
  })

  it('过滤 chips 与搜索框联动（会话/循环互斥、任务号匹配）', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-filter-loop"]').trigger('click')
    expect(w.find('[data-testid="flow-session-!r1"]').exists()).toBe(false)
    expect(w.find('[data-testid="flow-loop-lp-1"]').exists()).toBe(true)
    await w.find('[data-testid="flow-filter-session"]').trigger('click')
    expect(w.find('[data-testid="flow-loop-lp-1"]').exists()).toBe(false)
    await w.find('[data-testid="flow-filter-all"]').trigger('click')
    await w.find('[data-testid="flow-search"]').setValue('t-402')
    expect(w.find('[data-testid="flow-session-!r1"]').exists()).toBe(true)
    expect(w.find('[data-testid="flow-session-c1"]').exists()).toBe(false)
  })

  it('行点击 emit select；空态渲染', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-session-!r1"]').trigger('click')
    expect(w.emitted('select')![0][0]).toEqual({ kind: 'room', id: '!r1' })
    await w.find('[data-testid="flow-loop-lp-1"]').trigger('click')
    expect(w.emitted('select')![1][0]).toEqual({ kind: 'loop', id: 'lp-1' })
    const empty = mountPanel({ sessions: [], loops: [] })
    expect(empty.find('[data-testid="flow-empty"]').exists()).toBe(true)
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

  it('栏底动作：v14「＋新聊天」三分型菜单（单聊/群聊 emit、房间转内联输入）、＋新循环、⚙管理', async () => {
    const w = mountPanel()
    await w.find('[data-testid="flow-new-session"]').trigger('click')
    expect(w.find('[data-testid="flow-new-menu"]').exists()).toBe(true)
    await w.find('[data-testid="flow-new-chat-agent"]').trigger('click')
    expect(w.emitted('new-chat')).toHaveLength(1)
    // 选择后菜单收起
    expect(w.find('[data-testid="flow-new-menu"]').exists()).toBe(false)
    await w.find('[data-testid="flow-new-session"]').trigger('click')
    await w.find('[data-testid="flow-new-chat-group"]').trigger('click')
    expect(w.emitted('create-group')).toHaveLength(1)
    // matrix 房间：转内联输入 → 输入+确认 emit create-room
    await w.find('[data-testid="flow-new-session"]').trigger('click')
    await w.find('[data-testid="flow-new-chat-room"]').trigger('click')
    expect(w.find('[data-testid="flow-create-input"]').exists()).toBe(true)
    await w.find('[data-testid="flow-create-input"]').setValue('新房间')
    await w.find('[data-testid="flow-create-ok"]').trigger('click')
    expect(w.emitted('create-room')![0][0]).toBe('新房间')
    await w.find('[data-testid="flow-new-loop"]').trigger('click')
    expect(w.emitted('new-loop')).toHaveLength(1)
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
          // M6：/app/l 循环画布退役；循环行点击落运行详情/列表
          { path: 'runs', name: 'ia2.runs', component: { template: '<div runs />' } },
          { path: 'runs/:runId', name: 'ia2.runDetail', component: { template: '<div run-detail />' } },
          { path: 'eng', name: 'ia2.eng', component: { template: '<div class="eng-stub" />' } },
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

  it('默认选择=最近活动会话（房间 rank 领先）→ flow store 同步；挂接/未读/duty 团队徽章', async () => {
    const { wrapper } = await mountAt('/app')
    const flow = useFlowStore()
    // 房间 rank = now - i*1000（now ≈ Date.now() ≫ 会话 updatedAt 3000），首房间居首
    expect(flow.selected).toEqual({ kind: 'room', id: '!r1:host' })
    // 挂接徽章：!r1 关联 t-402（tenant 六段式 roomId 段）
    const row = wrapper.find('[data-testid="flow-session-!r1:host"]')
    expect(row.text()).toContain('📋1')
    expect(row.find('.flow-nav__unr').text()).toBe('2')
    // duty 团队标签：!r2 的值守 TL(@tl:host) → 其 agentTeam slug swarm
    expect(wrapper.find('[data-testid="flow-session-!r2:host"]').text()).toContain('swarm')
  })

  it('点击会话/循环行 → 路由子路径；中栏画布按选择分派', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-session-!r2:host"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.commsRoom')
    expect(router.currentRoute.value.params.roomId).toBe('!r2:host')
    await wrapper.find('[data-testid="flow-session-sess-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collabSession')
    expect(router.currentRoute.value.params.sessionId).toBe('sess-1')
    // M6：循环行点击落最新 run 详情（graphId === loop-<loopId>）；中栏 RunCanvas 分支已退役
    const sortedRunsBackup = runsStubs.state.sortedRuns
    runsStubs.state.sortedRuns = [...runsStubs.state.runs]
    await wrapper.find('[data-testid="flow-loop-lp-1"]').trigger('click')
    await flushPromises()
    runsStubs.state.sortedRuns = sortedRunsBackup
    expect(router.currentRoute.value.name).toBe('ia2.runDetail')
    expect(router.currentRoute.value.params.runId).toBe('run-9')
    // 无 run 的循环 → 兜底运行列表（sortedRuns 空）
    const { wrapper: w2, router: r2 } = await mountAt('/app')
    await w2.find('[data-testid="flow-loop-lp-1"]').trigger('click')
    await flushPromises()
    expect(r2.currentRoute.value.name).toBe('ia2.runs')
  })

  it('＋新循环 → /app/runs（S5：/app/eng 工程页退役）；⚙管理 → flow.govOpen', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-new-loop"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    const { wrapper: w2 } = await mountAt('/app')
    await w2.find('[data-testid="flow-gov"]').trigger('click')
    expect(useFlowStore().govOpen).toBe(true)
  })

  it('R4b 群聊入列与分派：群聊行在群聊簇 → 点击路由 ia2.groupRoom → 中栏 GroupChatView', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-session-gr-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.groupRoom')
    expect(router.currentRoute.value.params.roomId).toBe('gr-1')
    expect(wrapper.find('[data-testid="group-view-stub"]').exists()).toBe(true)
  })

  it('v14 新建动线：agent 单聊 → /app/s/chat 新会话态；群聊 ✕ → store.deleteRoom', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-new-session"]').trigger('click')
    await wrapper.find('[data-testid="flow-new-chat-agent"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collabChat')
    // 删除群聊（非当前选中）：只调 store，不动路由
    const { wrapper: w2, router: r2 } = await mountAt('/app')
    await w2.find('[data-testid="flow-del-group-gr-1"]').trigger('click')
    await flushPromises()
    expect(groupStubs.state.deleteRoom).toHaveBeenCalledWith('gr-1')
    expect(r2.currentRoute.value.name).toBe('ia2.collab')
  })

  it('R4a 动线⑤：左栏任务簇 chip → 看板预选；行双击 → ide.shell?task=（useIdeJump）', async () => {
    const { wrapper, router } = await mountAt('/app')
    await wrapper.find('[data-testid="flow-session-!r1:host"] .flow-nav__cnt--btn').trigger('click')
    await wrapper.find('[data-testid="flow-task-t-402"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.board')
    expect(router.currentRoute.value.query.task).toBe('t-402')
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
          // M6：/app/l 循环画布退役；循环行点击落运行详情/列表
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

  it('挂接任务随选择变化：会话（tenant 挂接）右栏联动；改派开抽屉；⌨跳 IDE（M6 后循环契约挂接在运行详情页）', async () => {
    const { wrapper, router } = await mountTdp('/app')
    // 默认选择 !r1 → t-402（tenant 六段式挂接）；t-415 不在
    expect(wrapper.find('[data-testid="tdp-task-t-402"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tdp-task-t-415"]').exists()).toBe(false)
    // M6：循环行点击不再切换右栏（导航去 /app/runs 家族，契约挂接在详情页解析）
    await wrapper.find('[data-testid="flow-loop-lp-1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.runs')
    // 改派 → 抽屉开（task-id 透传；以默认挂接任务驱动）
    const { wrapper: w2 } = await mountTdp('/app')
    await w2.find('[data-testid="tdp-reassign-t-402"]').trigger('click')
    expect(w2.find('.drawer-stub').attributes('data-taskid')).toBe('t-402')
    // ⌨ → ide.shell?task=
    const { wrapper: w3, router: r3 } = await mountTdp('/app')
    await w3.find('[data-testid="tdp-ide-t-402"]').trigger('click')
    await flushPromises()
    expect(r3.currentRoute.value.name).toBe('ide.shell')
    expect(r3.currentRoute.value.query.task).toBe('t-402')
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
          // M6：/app/l 循环画布退役；循环行点击落运行详情/列表
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

  it('v12.4 三栏栏控迁各栏顶部控制条：折叠钮+18px 导轨展开；中栏最大化/独立窗口', async () => {
    const { wrapper } = await mountWb('/app/s/chat/s1')
    // 三栏各自控制条在位（左=折叠/中=最大化+独立/右=折叠）
    expect(wrapper.find('[data-testid="ia-col-left-fold"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-col-left-max"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ia-col-center-max"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-col-center-popout"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-col-right-fold"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-col-right-popout"]').exists()).toBe(false)
    // 左折 → 导轨出现，导轨 ▶ 展开恢复
    await wrapper.find('[data-testid="ia-col-left-fold"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wb-rail-left"]').exists()).toBe(true)
    await wrapper.find('[data-testid="wb-unfold-left"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(true)
    // 中栏最大化 = 两侧齐折；右导轨 ◀ 展开恢复右栏（左仍折）
    await wrapper.find('[data-testid="ia-col-center-max"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(false)
    await wrapper.find('[data-testid="wb-unfold-right"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(false)
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
