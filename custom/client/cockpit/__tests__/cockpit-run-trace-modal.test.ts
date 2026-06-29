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
const { mockFetchHermesSessions, mockFetchSessionMessagesPage } = vi.hoisted(() => ({
  mockFetchHermesSessions: vi.fn(async (_source?: string, _limit?: number, profile?: string) => {
    if (profile === 'orchestrator') return [
      { id: 's1', title: 'Hermes Session 1', model: 'gpt-4', ended_at: null, started_at: 1000, last_active: 5000, message_count: 10, source: 'cli' },
      { id: 's2', title: 'Hermes Session 2', model: 'claude', ended_at: 2000, started_at: 1000, last_active: 2000, message_count: 5, source: 'cli' },
    ]
    if (profile === 'worker-coder') return [
      { id: 'w1', title: 'Worker Coder Session', model: 'gpt-4', ended_at: 3000, started_at: 2000, last_active: 3000, message_count: 3, source: 'cli' },
    ]
    if (profile === 'worker-researcher') return [
      { id: 'r1', title: 'Worker Researcher Session', model: 'claude', ended_at: 4000, started_at: 3000, last_active: 4000, message_count: 2, source: 'cli' },
    ]
    return []
  }),
  mockFetchSessionMessagesPage: vi.fn(async () => ({ messages: [], total: 0, offset: 0, limit: 500, hasMore: false, session: {} })),
}))
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
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, getTask: vi.fn(async () => null), addComment: vi.fn(async () => ({ ok: true })), patchTask: vi.fn(async () => ({})) }
})

vi.mock('@/api/hermes/sessions', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/sessions')
  return { ...actual, searchSessions: vi.fn(async () => []) }
})

vi.mock('../composables/useRunTrace', () => ({
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
    expect(w.find('.run-trace-node.is-l1').exists()).toBe(true)
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

  it('shows session picker when sessionId is empty', async () => {
    mockFetchHermesSessions.mockClear()
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: '' }) // Empty → show picker
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    // Wait for async session loading (multiple profiles in parallel)
    await new Promise(r => setTimeout(r, 300))
    await w.vm.$nextTick()
    expect(w.find('.run-trace-session-picker').exists()).toBe(true)
    expect(w.text()).toContain('选择会话观察')
    // Should list sessions from chatStore fallback (mocked) or hermes API
    const items = w.findAll('.run-trace-session-picker__item')
    expect(items.length).toBeGreaterThanOrEqual(1)
  })

  it('clicking session item selects it', async () => {
    const store = useCockpitStore()
    store.openRunTrace({ sessionId: '' })
    const w = mount(CockpitRunTraceModal, { global: { stubs: { teleport: true } } })
    // Wait for async session loading
    await new Promise(r => setTimeout(r, 50))
    const items = w.findAll('.run-trace-session-picker__item')
    expect(items.length).toBeGreaterThan(0)
    await items[0].trigger('click')
    // After select, sessionId should be set
    expect(store.runTraceSessionId).toBeTruthy()
  })
})
