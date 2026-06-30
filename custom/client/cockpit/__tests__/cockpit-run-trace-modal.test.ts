// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// ── mock profiles store ──
const mockProfiles = [
  { name: 'orchestrator', active: true },
  { name: 'worker-coder', active: false },
  { name: 'worker-researcher', active: false },
]
vi.mock('@/stores/hermes/profiles', () => ({
  useProfilesStore: () => ({ profiles: mockProfiles, activeProfileName: 'orchestrator' }),
}))

// ── mock sessions API (fetchHermesSessions 从 state.db 获取，跨 profile) ──
// 时间戳统一用今天（秒级），匹配 overview 默认"仅加载今天"的时间窗。
const { todaySec, mockFetchHermesSessions, mockFetchSessionMessagesPage } = vi.hoisted(() => {
  const _now = Date.now()
  const _startOfDay = new Date(_now); _startOfDay.setHours(0, 0, 0, 0)
  const _todaySec = Math.floor(_startOfDay.getTime() / 1000) + 3600 // 今天 01:00（秒）
  return {
    todaySec: _todaySec,
    mockFetchHermesSessions: vi.fn(async (_source?: string, _limit?: number, profile?: string) => {
      if (profile === 'orchestrator') return [
        { id: 's1', title: 'Hermes Session 1', model: 'gpt-4', ended_at: null, started_at: _todaySec, last_active: _todaySec + 4000, message_count: 10, source: 'cli' },
        // t_child 的 worker 会话（标题精确匹配 matchSessionTaskId）
        { id: 'wc1', title: 'work kanban task t_child', model: 'gpt-4', ended_at: _todaySec + 1000, started_at: _todaySec + 100, last_active: _todaySec + 1100, message_count: 5, source: 'cli' },
      ]
      if (profile === 'worker-coder') return [
        { id: 'w1', title: 'Worker Coder Session', model: 'gpt-4', ended_at: _todaySec + 2000, started_at: _todaySec + 1000, last_active: _todaySec + 2000, message_count: 3, source: 'cli' },
      ]
      if (profile === 'worker-researcher') return [
        { id: 'r1', title: 'Worker Researcher Session', model: 'claude', ended_at: _todaySec + 3000, started_at: _todaySec + 2000, last_active: _todaySec + 3000, message_count: 2, source: 'cli' },
      ]
      return []
    }),
    mockFetchSessionMessagesPage: vi.fn(async () => ({ messages: [], total: 0, offset: 0, limit: 500, hasMore: false, session: {} })),
  }
})
vi.mock('@/api/hermes/sessions', () => ({
  fetchHermesSessions: mockFetchHermesSessions,
  fetchSessionMessagesPage: mockFetchSessionMessagesPage,
}))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    loadSessions: vi.fn(async () => {}),
    messages: [],
    sendMessage: vi.fn(async () => {}),
    switchSession: vi.fn(async () => {}),
    sessions: [
      { id: 's1', title: 'Session 1', model: 'gpt-4', endedAt: null, updatedAt: Date.now() },
      { id: 's2', title: 'Session 2', model: 'claude', endedAt: 1000, updatedAt: 2000 },
    ],
    isSessionUnread: vi.fn(() => false),
    getSessionUnreadCount: vi.fn(() => 0),
    getSessionUnreadInfo: vi.fn(() => null),
    clearSessionUnread: vi.fn(),
    isSessionCompletedUnread: vi.fn(() => false),
    clearSessionCompletedUnread: vi.fn(),
  }),
}))

// ── mock kanban store ──
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({
    tasks: [],
    boards: [{ slug: 'default', name: 'default', total: 0 }],
    fetchTasks: vi.fn(async () => {}),
    fetchAssignees: vi.fn(async () => {}),
    startEventStream: vi.fn(),
    fetchBoards: vi.fn(async () => {}),
    setSelectedBoard: vi.fn(),
  }),
}))

// ── mock group-chat/matrix ──
vi.mock('@/stores/hermes/group-chat', () => ({
  useGroupChatStore: () => ({
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    loadRooms: vi.fn(async () => {}),
    joinRoom: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    sortedMessages: [],
    rooms: [],
    getRoomUnread: vi.fn(() => 0),
    clearRoomUnread: vi.fn(),
    clearAllUnread: vi.fn(),
    lastMessageMap: {},
  }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [], roomList: [], sortedRooms: [], getRoomUnreadCount: vi.fn(() => 0) }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({
  useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }),
}))

// ── mock kanban-extras ──
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({
  searchSessions: vi.fn(async () => []),
  listWorkspaceFiles: vi.fn(async () => []),
  getTimeline: vi.fn(async () => ({ items: [], total: 0 })),
}))

// ── mock kanban api ──
// 示例任务树：t_parent(running) → t_child(done)；t_child 的 worker 会话标题为 "work kanban task t_child"
// 默认隐藏已完成/已归档任务，故 t_child 默认不显示，需勾选"已完成"后才纳入。
// 时间戳用今天（todaySec），匹配 overview 默认"仅加载今天"的时间窗。
const mockKanbanTasks = [
  { id: 't_parent', title: '父任务', body: null, assignee: null, status: 'running', priority: 2, created_by: null, created_at: todaySec, started_at: todaySec, completed_at: null, workspace_kind: 'git', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
  { id: 't_child', title: '子任务', body: null, assignee: null, status: 'done', priority: 2, created_by: null, created_at: todaySec + 100, started_at: todaySec + 100, completed_at: todaySec + 1100, workspace_kind: 'git', workspace_path: null, tenant: null, project_id: null, result: null, skills: null },
]
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return {
    ...actual,
    listBoards: vi.fn(async () => [{ slug: 'default', name: 'default', archived: false, total: 2 }]),
    listTasks: vi.fn(async (opts?: any) => mockKanbanTasks.map(t => ({ ...t, board: opts?.board ?? 'default' }))),
    getTask: vi.fn(async (id: string) => {
      const t = mockKanbanTasks.find(x => x.id === id)
      if (!t) return null
      const parents = id === 't_child' ? ['t_parent'] : []
      const children = id === 't_parent' ? ['t_child'] : []
      return {
        task: { ...t, session_id: id === 't_parent' ? 's1' : null },
        latest_summary: null,
        comments: [],
        events: [],
        runs: [{ id: 1, task_id: id, profile: 'orchestrator', status: 'completed', outcome: null, summary: null, error: null, metadata: null, worker_pid: null, started_at: todaySec, ended_at: todaySec + 1000 }],
        parents,
        children,
      }
    }),
    addComment: vi.fn(async () => ({ ok: true })),
    patchTask: vi.fn(async () => ({})),
  }
})

// run-trace-adapter 静态导入 @/api/client 的 request helper（→ router → location），
// 在 jsdom 外的环境不稳定，mock 掉避免模块链加载。
vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<any>('@/api/client')
  return { ...actual, request: vi.fn(async () => null) }
})

vi.mock('@/api/hermes/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/sessions')
  return { ...actual, fetchHermesSessions: mockFetchHermesSessions, fetchSessionMessagesPage: mockFetchSessionMessagesPage, searchSessions: vi.fn(async () => []) }
})

// vue-flow 在 jsdom 下渲染不稳定，mock 为简单占位组件。
vi.mock('@vue-flow/core', () => ({
  VueFlow: { name: 'VueFlow', props: ['nodes', 'edges'], template: '<div class="vue-flow-stub" data-run-trace-graph><div v-for="n in nodes" :key="n.id" :data-node-id="n.id" class="trace-node-card is-l1 is-active" @click="$emit(\'node-click\', { node: n })">{{ n.data?.label }}</div></div>', emits: ['node-click'] },
  useVueFlow: () => ({ onPaneReady: () => {}, fitView: () => {}, setNodes: () => {}, setEdges: () => {} }),
  MarkerType: { ArrowClosed: 'arrowclosed', Arrow: 'arrow' },
}))

// d3-force 在 jsdom 下需 requestAnimationFrame，mock 为简单坐标计算避免异步。
// 所有 force 工厂返回带链式方法的对象（每个方法返回自身）。
vi.mock('d3-force', () => {
  const makeForce = () => {
    const f: any = (links?: any) => f
    f.id = () => f
    f.distance = () => f
    f.strength = () => f
    f.radius = () => f
    f.x = () => f
    f.y = () => f
    return f
  }
  const sim: any = { force: () => sim, stop: () => sim, tick: () => sim }
  return {
    forceSimulation: () => sim,
    forceLink: makeForce(),
    forceManyBody: makeForce(),
    forceCollide: makeForce(),
    forceX: makeForce(),
    forceY: makeForce(),
  }
})

vi.mock('../composables/useRunTrace', () => ({
  extractKanbanTaskId: (title: string) => {
    const m = title?.match(/work kanban task (t_\w+)/i)
    return m ? m[1] : null
  },
  useRunTrace: () => ({
    nodes: {
      value: [
        { id: 'run:s1:r1', kind: 'workflow', label: 'Run r1', status: 'running', startedAt: 1, evidence: 'L1', children: [] },
        { id: 'skill:s1:auth:1', kind: 'skill', label: 'auth-refactor', status: 'running', startedAt: 2, evidence: 'L1', children: [
          { id: 'think:1', kind: 'thinking', ts: 3, text: '先读现有实现。', attribution: 'inferred' },
        ] },
      ],
    },
    edges: { value: [{ id: 'e1', from: 'run:s1:r1', to: 'skill:s1:auth:1', kind: 'call', evidence: 'L1' }] },
    focusedNodeId: { value: 'run:s1:r1' },
    l2Available: { value: false },
    mode: { value: 'live' as const },
    scrubberTime: { value: Date.now() },
    replayProgress: { value: 0 },
    sessionStartedAt: { value: Date.now() - 3600000 },
    sessionEnded: { value: false },
    relatedSessions: { value: [] },
    relatedSessionIds: { value: new Set<string>() },
    aggregateMode: { value: true },
    fetchL2Data: vi.fn(async () => {}),
    switchToLive: vi.fn(),
    switchToReplay: vi.fn(),
    scrubTo: vi.fn(),
    scrubEnd: vi.fn(),
    route: vi.fn(),
    setAllSessionsRef: vi.fn(),
    loadRelatedSessions: vi.fn(async () => []),
  }),
}))

import CockpitRunTraceModal from '../components/CockpitRunTraceModal.vue'
import { useCockpitStore } from '../store/cockpit'

// 内存 localStorage polyfill
class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

describe('CockpitRunTraceModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    ;(globalThis as any).localStorage = new MemStorage()
  })

  it('does not render when closed', () => {
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    expect(w.find('[data-run-trace-modal]').exists()).toBe(false)
  })

  it('renders graph, time band, and inspector when opened', () => {
    const store = useCockpitStore()
    store.openRunTrace({ taskId: 'task-1', sessionId: 's1', runId: 'r1' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    expect(w.find('[data-run-trace-modal]').exists()).toBe(true)
    expect(w.text()).toContain('Run Observatory')
    expect(w.find('[data-run-trace-graph]').exists()).toBe(true)
    expect(w.find('[data-run-trace-timeband]').exists()).toBe(true)
    expect(w.find('[data-run-trace-inspector]').exists()).toBe(true)
  })

  it('opens skill drilldown when a skill node is selected', async () => {
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: 's1', runId: 'r1' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    await w.find('[data-node-id="skill:s1:auth:1"]').trigger('click')
    expect(w.find('[data-run-trace-skill-drilldown]').exists()).toBe(true)
    expect(w.text()).toContain('先读现有实现')
  })

  it('marks inferred skill timeline items and evidence tiers', async () => {
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: 's1', runId: 'r1' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    expect(w.find('.trace-node-card.is-l1').exists()).toBe(true)
    await w.find('[data-node-id="skill:s1:auth:1"]').trigger('click')
    expect(w.text()).toContain('推断')
  })

  it('renders scrubber with live mode indicator', () => {
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: 's1', runId: 'r1' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    expect(w.find('[data-run-trace-scrubber]').exists()).toBe(true)
    // Live mode indicator (green mode badge)
    expect(w.find('.run-trace-scrubber__mode.is-live').exists()).toBe(true)
    // Live mode dot in header (green pulse)
    expect(w.find('.run-trace-modal__dot.is-live').exists()).toBe(true)
  })

  it('shows overview (task topology graph) when sessionId is empty', async () => {
    mockFetchHermesSessions.mockClear()
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: '' }) // Empty → show overview
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    // Wait for async task tree + session loading
    await new Promise(r => setTimeout(r, 400))
    await w.vm.$nextTick()
    expect(w.find('[data-run-trace-overview]').exists()).toBe(true)
    expect(w.find('[data-run-trace-topology]').exists()).toBe(true)
    expect(w.text()).toContain('kanban 任务树拓扑')
    // 默认隐藏已完成/已归档：t_parent(running) 显示，t_child(done) 不显示
    expect(w.text()).toContain('t_parent')
    expect(w.text()).not.toContain('t_child')
  })

  it('toggling "已完成" filter reloads done tasks', async () => {
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: '' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    await new Promise(r => setTimeout(r, 400))
    await w.vm.$nextTick()
    // 默认 t_child(done) 不显示
    expect(w.text()).not.toContain('t_child')
    // 点击"已完成"标签 → 重新加载
    const doneBtn = w.findAll('.run-trace-overview__filter').find(b => b.text().includes('已完成'))!
    await doneBtn.trigger('click')
    await new Promise(r => setTimeout(r, 400))
    await w.vm.$nextTick()
    // 现在 t_child 出现
    expect(w.text()).toContain('t_child')
  })

  it('clicking a task node opens the focused task-tree detail view', async () => {
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: '' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    await new Promise(r => setTimeout(r, 400))
    await w.vm.$nextTick()
    // 初始无“返回全部”按钮
    expect(w.find('.run-trace-overview__back-all').exists()).toBe(false)
    // 点击拓扑图中的任务节点（stub 渲染为 .trace-node-card，点击触发 node-click → focus-task）
    const nodes = w.findAll('[data-run-trace-topology] .trace-node-card')
    expect(nodes.length).toBeGreaterThan(0)
    await nodes[0].trigger('click')
    await new Promise(r => setTimeout(r, 150))
    await w.vm.$nextTick()
    // 聚焦后出现“返回全部”按钮 + 右侧时间轴面板
    expect(w.find('.run-trace-overview__back-all').exists()).toBe(true)
    expect(w.find('[data-trace-timeline-panel]').exists()).toBe(true)
    // 点击返回全部 → 按钮与面板消失，恢复全部任务
    await w.find('.run-trace-overview__back-all').trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.run-trace-overview__back-all').exists()).toBe(false)
    expect(w.find('[data-trace-timeline-panel]').exists()).toBe(false)
  })
})
