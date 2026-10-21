// overlay/custom/client/ide/__tests__/cli-mixed-usage.test.ts
// 遗留项收编守门（2026-10-21）：侧栏「项目/时间线」混排 CLI 行接入用量徽与
// 账单展开（IdeCliSessionBill 子组件复用）+ useZcodeCliUsage 模块单例语义
// （两 surface 一次拉取）。挂载骨架沿用 task-sidebar.test.ts。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const msgs = { success: vi.fn(), error: vi.fn() }
vi.mock('naive-ui', () => ({
  useMessage: () => msgs,
  NDropdown: { name: 'NDropdown', template: '<div class="stub-dropdown"><slot /></div>' },
  NTooltip: { name: 'NTooltip', template: '<div class="stub-tooltip"><slot name="trigger" /><slot /></div>' },
  NPopconfirm: { name: 'NPopconfirm', template: '<div class="stub-popconfirm"><slot /></div>' },
}))

const { switchSession, newChat, loadSessions, archiveSession, deleteSession } = vi.hoisted(() => ({
  switchSession: vi.fn(async () => {}),
  newChat: vi.fn(() => ({})),
  loadSessions: vi.fn(async () => {}),
  archiveSession: vi.fn(async () => true),
  deleteSession: vi.fn(async () => true),
}))

vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    sessions: [],
    activeSessionId: null,
    sessionProfileFilter: null,
    sessionsLoaded: true,
    switchSession,
    newChat,
    loadSessions,
    archiveSession,
    deleteSession,
  }),
}))

const { togglePinned } = vi.hoisted(() => ({ togglePinned: vi.fn() }))
vi.mock('../utils/pins', () => ({
  useIdePins: () => ({
    pinnedIds: [] as string[],
    isPinned: () => false,
    togglePinned,
    onChange: () => () => {},
  }),
}))

const { unarchiveSession, fetchSessionCategories, createSessionCategory, setSessionCategory, exportSession, batchDeleteSessions } = vi.hoisted(() => ({
  unarchiveSession: vi.fn(async () => true),
  fetchSessionCategories: vi.fn(async () => []),
  createSessionCategory: vi.fn(async () => ({})),
  setSessionCategory: vi.fn(async () => {}),
  exportSession: vi.fn(async () => {}),
  batchDeleteSessions: vi.fn(async () => ({ deleted: 0, failed: 0, errors: [] })),
}))
vi.mock('@/api/studio/sessions', () => ({
  unarchiveSession,
  fetchSessionCategories,
  createSessionCategory,
  setSessionCategory,
  exportSession,
  batchDeleteSessions,
}))

vi.mock('../api/archivedSessions', () => ({
  fetchArchivedSessions: vi.fn(async () => []),
}))

// ── 本轮被测面：devtools CLI 列表 + zcode 用量端点 ──
vi.mock('../api/devtools', () => ({
  fetchDevtools: vi.fn(async () => []),
  launchDevtool: vi.fn(async () => undefined),
  fetchCliSessions: vi.fn(async () => ({
    sessions: [
      { id: 'sess_mix1', title: '混排行会话', directory: '/Users/x/lab/proj', timeUpdated: Date.now() - 3_600_000, timeCreated: 0 },
      { id: 'sess_mix2', title: '无用量会话', directory: '', timeUpdated: Date.now() - 60_000, timeCreated: 0 },
    ],
  })),
}))

const zcSessionsMock = vi.fn(async () => ({
  sessions: [
    {
      id: 'sess_mix1', title: '混排行会话', directory: '/Users/x/lab/proj', taskType: 'interactive',
      parentId: null, isSubagent: false, timeCreated: 0, timeUpdated: Date.now() - 3_600_000,
      turns: 9, modelCalls: 60, toolCalls: 44, turnErrors: 0, firstAt: 0, lastAt: Date.now() - 3_600_000,
      inputTokens: 500_000, outputTokens: 60_000, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 4_000_000, billedTokens: 4_560_000,
    },
  ],
}))
const zcRoundsMock = vi.fn(async () => ({
  rounds: [
    { turnId: 't1', status: 'completed', startedAt: Date.now() - 600_000, completedAt: Date.now() - 500_000, durationMs: 100_000, ttftMs: 1_293, modelRequestCount: 2, toolCallCount: 4, toolErrorCount: 0, errorType: '', errorCode: '', models: [{ provider: 'bigmodel-api', model: 'GLM-5.3', calls: 2, inputTokens: 100_000, outputTokens: 10_000, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 1_000_000, billedTokens: 1_110_000 }] },
  ],
}))
const zcToolsMock = vi.fn(async () => ({ tools: [] }))
const zcContextMock = vi.fn(async () => ({
  sessionId: 'sess_mix1',
  requests: [{ at: 1, turnId: 't1', model: 'GLM-5.3', provider: 'bigmodel-api', status: 'completed', ttftMs: 100, promptTokens: 100, outputTokens: 10 }],
  est: { categories: [{ key: 'user-text', estTokens: 10, count: 1 }], estTotalTokens: 10, partsParsed: 1, partsSkipped: 0 },
  largest: [], compactions: [],
}))
vi.mock('../api/zcodeUsage', () => ({
  zcodeUsageApi: {
    summary: vi.fn(async () => ({})),
    sessions: () => zcSessionsMock(),
    rounds: (id: string) => zcRoundsMock(id),
    tools: (id: string) => zcToolsMock(id),
    context: (id: string) => zcContextMock(id),
  },
}))

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const { refreshKanban } = vi.hoisted(() => ({ refreshKanban: vi.fn(async () => {}) }))
vi.mock('../composables/useIdeKanbanOverview', async () => {
  const { computed, ref } = await import('vue')
  const entries = ref([])
  return {
    useIdeKanbanOverview: () => ({
      boards: ref([]),
      entries,
      activeEntries: computed(() => []),
      boardCounts: computed(() => new Map()),
      loading: ref(false),
      error: ref(''),
      refresh: refreshKanban,
    }),
  }
})
vi.mock('@/custom/cockpit/adapters/task-adapter', () => ({
  bucketPriority: () => 'P3',
}))
vi.mock('../views/IdeGitPane.vue', () => ({ default: { name: 'IdeGitPane', template: '<div class="stub-gitpane" />' } }))
vi.mock('@/components/hermes/files/FileTree.vue', () => ({
  default: { name: 'FileTree', template: '<div class="stub-filetree" />' },
}))

import IdeTaskSidebar from '../views/IdeTaskSidebar.vue'
import { useIdeStore } from '../store/ide'
import { __zcodeCliUsageTestHooks } from '../composables/useZcodeCliUsage'

function mountSidebar() {
  const ide = useIdeStore()
  ide.setSessionView('workspace')
  return mount(IdeTaskSidebar)
}

describe('侧栏混排 CLI 行 — 用量徽与账单（遗留项收编）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    __zcodeCliUsageTestHooks.resetUsageForTest()
  })

  it('项目组织模式：混排行带「轮/tok」徽与「账」按钮；无用量行保持原样', async () => {
    const w = mountSidebar()
    await flushPromises()
    const row = w.find('[data-testid="ide-task-cli-sess_mix1"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('9 轮')
    expect(row.text()).toContain('4.6M tok')
    expect(w.find('[data-testid="ide-cli-bill-sess_mix1"]').exists()).toBe(true)
    // 无用量数据的会话：无徽无账按钮（fail-soft）
    const row2 = w.find('[data-testid="ide-task-cli-sess_mix2"]')
    expect(row2.exists()).toBe(true)
    expect(w.find('[data-testid="ide-cli-bill-sess_mix2"]').exists()).toBe(false)
    w.unmount()
  })

  it('点「账」展开账单体（子组件复用：逐轮表/构成 toggle 同款）', async () => {
    const w = mountSidebar()
    await flushPromises()
    await w.find('[data-testid="ide-cli-bill-sess_mix1"]').trigger('click')
    await flushPromises()
    expect(zcRoundsMock).toHaveBeenCalledWith('sess_mix1')
    const rounds = w.find('[data-testid="ide-cli-bill-rounds-sess_mix1"]')
    expect(rounds.exists()).toBe(true)
    expect(rounds.text()).toContain('1.3s')
    const body = w.find('[data-testid="ide-cli-bill-body-sess_mix1"]')
    expect(body.exists()).toBe(true)
    w.unmount()
  })

  it('用量单例：混排行与独立段两 surface 共享一次拉取（mounted 不重复请求）', async () => {
    const w1 = mountSidebar()
    await flushPromises()
    expect(zcSessionsMock).toHaveBeenCalledTimes(1)
    // 同页再挂一个独立段组件（分组模式/落地页形态）——单例短路，不再拉
    const { default: IdeCliSessions } = await import('../components/IdeCliSessions.vue')
    const w2 = mount(IdeCliSessions, {
      props: { sessions: [{ id: 'sess_mix1', title: '混排行会话', directory: '/Users/x/lab/proj', timeUpdated: Date.now(), timeCreated: 0 }] },
    })
    await flushPromises()
    expect(zcSessionsMock).toHaveBeenCalledTimes(1)
    // 独立段同样吃到单例数据：徽章可见
    expect(w2.find('[data-testid="ide-cli-session-sess_mix1"]').text()).toContain('9 轮')
    w1.unmount()
    w2.unmount()
  })
})
