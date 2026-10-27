// @vitest-environment jsdom
// 统一全局检索弹窗守门：五类对象、命令、键盘、深链与懒加载必须共用一条动线。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
}))

const rows = vi.hoisted(() => ({
  sessionRows: [
    { kind: 'room', id: '!a:matrix', name: '支付讨论群', unread: 2, taskIds: ['t1'], teamTag: 'pay', dutyName: null, lastActivityAt: Date.now() },
    { kind: 'chat', id: 'c1', name: 'researcher', unread: 0, taskIds: [], teamTag: '', dutyName: null, lastActivityAt: Date.now() },
  ],
  accounts: [
    { userId: '@alice:matrix', displayName: 'Alice', isLeader: true, agentTeams: [] },
  ],
  tasks: [
    { id: 't1', title: '收银台 BFF 重构', priority: 'P1', status: 'running', assignee: '陈', workspace: '/lab/pay', tenant: null, boardSlug: 'pay', createdAt: Date.now(), sessionId: '!a:matrix' },
    { id: 't2', title: '退款对账', priority: 'P0', status: 'blocked', assignee: '林', workspace: '/lab/refund', tenant: null, boardSlug: 'refund', createdAt: Date.now(), sessionId: null },
  ],
  boards: [
    { slug: 'pay', name: '支付看板', total: 1, source: 'daily' },
    { slug: 'refund', name: '退款看板', total: 1, source: 'daily' },
  ],
  runs: [
    { runId: 'run21', status: 'running', stage: 'develop', iteration: 3, lastActivityAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ],
  docs: [
    { kind: 'rfd', title: 'RFD-001 结算需求', path: 'docs/rfd-001.md', gate: 'G1', group: 'gate', exists: true, commit: 'abc', committedAt: new Date().toISOString(), lines: 20 },
  ],
}))
const govApi = vi.hoisted(() => ({ fetchGovernanceOverview: vi.fn(async () => ({ ok: true, docs: rows.docs })) }))
const registryApi = vi.hoisted(() => ({
  fetchRegistry: vi.fn(async () => ({
    markdown: [
      '# roster',
      '',
      '| 账号 | AI 助理账号 | 角色 |',
      '| --- | --- | --- |',
      '| @fanfan:matrix | @fanfan-agent:matrix | 产品经理 |',
      '| @alice:matrix | @alice-agent:matrix | 研发 |',
    ].join('\n'),
    commit: 'abc123',
  })),
}))
const matrixRoom = vi.hoisted(() => ({ selectRoom: vi.fn() }))
const sessionSearch = vi.hoisted(() => ({ openSessionSearch: vi.fn() }))

vi.mock('../composables/useSessionRows', () => ({
  useSessionRows: () => ({ sessionRows: { value: rows.sessionRows }, accounts: { value: rows.accounts } }),
}))
vi.mock('../store/workspace', async () => {
  const { reactive } = await import('vue')
  const { parseFirstTable, setCellAlign } = await import('@/custom/governance/utils/registry-md')
  const state = reactive({
    tasks: rows.tasks,
    rawTasks: [],
    boards: rows.boards,
    searchOpen: true,
    searchDocs: [] as Array<Record<string, unknown>>,
    searchDocsLoaded: false,
    searchDocsFailed: false,
    searchPeopleRows: [] as string[][],
    searchPeopleLoaded: false,
    openSearch: vi.fn(),
    closeSearch: vi.fn(),
    loadSearchDocs: vi.fn(),
    loadSearchPeople: vi.fn(),
  })
  state.openSearch.mockImplementation(() => { state.searchOpen = true })
  state.closeSearch.mockImplementation(() => { state.searchOpen = false })
  state.loadSearchDocs.mockImplementation(async () => {
    if (state.searchDocsLoaded) return
    try {
      const res = await govApi.fetchGovernanceOverview()
      state.searchDocs = res.docs ?? []
      state.searchDocsLoaded = true
    } catch {
      state.searchDocsFailed = true
    }
  })
  state.loadSearchPeople.mockImplementation(async () => {
    if (state.searchPeopleLoaded) return
    const doc = await registryApi.fetchRegistry('roster')
    const { table } = parseFirstTable(doc.markdown)
    state.searchPeopleRows = setCellAlign(table.rows, 3)
    state.searchPeopleLoaded = true
  })
  return { useWorkspaceStore: () => state }
})
vi.mock('@/custom/cockpit/store/cockpit', async () => {
  const { reactive } = await import('vue')
  const state = reactive({
    searchQuery: '',
    _sessionSearching: false,
    runSearch: vi.fn(),
    clearSearch: vi.fn(),
  })
  state.runSearch.mockImplementation((q: string) => { state.searchQuery = q })
  state.clearSearch.mockImplementation(() => { state.searchQuery = '' })
  return { useCockpitStore: () => state }
})
vi.mock('@/custom/loop/runcenter/store/runs', () => ({
  useRunCenterStore: () => ({ sortedRuns: rows.runs }),
}))
vi.mock('@/custom/governance/api/governance', () => govApi)
vi.mock('@/custom/governance/api/adminRegistry', () => registryApi)
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => matrixRoom,
}))
vi.mock('@/composables/useSessionSearch', () => ({
  useSessionSearch: () => sessionSearch,
}))
const chatStoreMock = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown>>,
  sessionsLoaded: false,
  sessionProfileFilter: null,
  loadSessions: vi.fn(async () => {}),
}))
const groupChatMock = vi.hoisted(() => ({
  rooms: [] as Array<Record<string, unknown>>,
  loadRooms: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatStoreMock }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => groupChatMock }))
vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({
  default: {
    props: ['show', 'taskId'],
    template: '<div data-testid="task-drawer-stub" :data-task="taskId" />',
  },
}))

import GlobalSearchDialog from '../components/GlobalSearchDialog.vue'
import { useWorkspaceStore } from '../store/workspace'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

function makeRouter(): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/app', name: 'ia2.journey', component: { template: '<div />' } },
    { path: '/app/dash', name: 'ia2.dash', component: { template: '<div />' } },
    { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
    { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
    { path: '/app/s/room/:roomId', name: 'ia2.commsRoom', component: { template: '<div />' } },
    { path: '/app/s/chat/:sessionId', name: 'ia2.collabSession', component: { template: '<div />' } },
    { path: '/app/stage/setup', name: 'ia2.stage1', component: { template: '<div />' } },
    { path: '/app/stage/govern', name: 'ia2.stage6', component: { template: '<div />' } },
  ]
  return createRouter({ history: createMemoryHistory(), routes })
}

async function mountSearch(initial = '/app', open = true) {
  const workspace = useWorkspaceStore() as any
  const cockpit = useCockpitStore() as any
  workspace.searchOpen = open
  const router = makeRouter()
  await router.push(initial)
  await router.isReady()
  const w = mount(GlobalSearchDialog, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { teleport: true } },
  })
  await flushPromises()
  return { w, router, workspace, cockpit }
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.clearAllMocks()
  chatStoreMock.sessions = []
  chatStoreMock.sessionsLoaded = false
  chatStoreMock.sessionProfileFilter = null
  groupChatMock.rooms = []
  const workspace = useWorkspaceStore() as any
  const cockpit = useCockpitStore() as any
  workspace.searchOpen = true
  workspace.searchDocs = []
  workspace.searchDocsLoaded = false
  workspace.searchDocsFailed = false
  workspace.searchPeopleRows = []
  workspace.searchPeopleLoaded = false
  cockpit.searchQuery = ''
  cockpit._sessionSearching = false
  govApi.fetchGovernanceOverview.mockResolvedValue({ ok: true, docs: rows.docs })
})

describe('GlobalSearchDialog — 统一全局检索弹窗', () => {
  it('默认显示五类对象，人员合并 roster 后计数为 8', async () => {
    const { w } = await mountSearch()
    expect(w.find('[data-testid="global-search-dialog"]').exists()).toBe(true)
    for (const key of ['sessions', 'tasks', 'runs', 'docs', 'people']) {
      expect(w.find(`[data-testid="search-group-${key}"]`).exists(), key).toBe(true)
    }
    expect(w.find('[data-testid="search-count"]').text()).toBe('8')
    w.unmount()
  })

  it('弹窗打开即装载 agent 会话与群聊两源（各一次）', async () => {
    const { w } = await mountSearch()
    expect(chatStoreMock.loadSessions).toHaveBeenCalledTimes(1)
    expect(groupChatMock.loadRooms).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('已装载的会话源不重复装载', async () => {
    chatStoreMock.sessionsLoaded = true
    const { w } = await mountSearch()
    expect(chatStoreMock.loadSessions).not.toHaveBeenCalled()
    expect(groupChatMock.loadRooms).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('空查询显示命令组', async () => {
    const { w } = await mountSearch()
    expect(w.find('[data-testid="search-command-c:board"]').exists()).toBe(true)
    w.unmount()
  })

  it('Enter 激活当前命令', async () => {
    const { w, router } = await mountSearch()
    await w.find('[data-testid="search-input"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.dash')
    w.unmount()
  })

  it('类型页签收敛为任务', async () => {
    const { w } = await mountSearch()
    await w.find('[data-testid="search-type-tasks"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="search-group-tasks"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-group-sessions"]').exists()).toBe(false)
    expect(w.find('[data-testid="search-count"]').text()).toBe('2')
    w.unmount()
  })

  it('看板筛选作用于任务与挂接会话，文档人员不受板筛选清零', async () => {
    const { w } = await mountSearch()
    await w.find('[data-testid="search-filter-board"]').setValue('pay')
    await flushPromises()
    expect(w.find('[data-testid="search-row-t:t1"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-row-t:t2"]').exists()).toBe(false)
    expect(w.find('[data-testid="search-row-s:room:!a:matrix"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-row-s:chat:c1"]').exists()).toBe(false)
    // 板不属于文档/人员的归属维度——不被清零
    expect(w.find('[data-testid="search-row-d:rfd"]').exists()).toBe(true)
    w.unmount()
  })

  it('板筛选深链恢复（board=refund）', async () => {
    const { w } = await mountSearch('/app?search=1&board=refund')
    expect(w.find('[data-testid="search-row-t:t2"]').exists()).toBe(true)
    expect(w.find('[data-testid="search-row-t:t1"]').exists()).toBe(false)
    w.unmount()
  })

  it('旧深链恢复人员关键词和类型', async () => {
    const { w } = await mountSearch('/app?search=1&q=Alice&type=people')
    expect(w.find('[data-testid="search-row-p:@alice:matrix"]').exists()).toBe(true)
    w.unmount()
  })

  it('弹窗关键词写入共享 cockpit 状态', async () => {
    const { w, cockpit } = await mountSearch()
    await w.find('[data-testid="search-input"]').setValue('Alice')
    expect(cockpit.searchQuery).toBe('Alice')
    w.unmount()
  })

  it('任务结果走看板深链', async () => {
    const { w, router } = await mountSearch()
    await w.find('[data-testid="search-row-t:t1"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.board')
    expect(router.currentRoute.value.query.task).toBe('t1')
    w.unmount()
  })

  it('房间结果保留 selectRoom 后跳转', async () => {
    const { w, router } = await mountSearch()
    await w.find('[data-testid="search-row-s:room:!a:matrix"]').trigger('click')
    await flushPromises()
    expect(matrixRoom.selectRoom).toHaveBeenCalledWith('!a:matrix')
    expect(router.currentRoute.value.name).toBe('ia2.commsRoom')
    w.unmount()
  })

  it('会话全文入口关闭统一弹窗并调用现有深搜', async () => {
    const { w, workspace } = await mountSearch()
    await w.find('[data-testid="spotlight-deep-search"]').trigger('click')
    expect(sessionSearch.openSessionSearch).toHaveBeenCalledTimes(1)
    expect(workspace.searchOpen).toBe(false)
    w.unmount()
  })

  it('Escape 关闭弹窗', async () => {
    const { w, workspace } = await mountSearch()
    await w.find('[data-testid="search-input"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(workspace.searchOpen).toBe(false)
    w.unmount()
  })

  it('人员源为 roster 与团队注册表合并去重', async () => {
    const { w } = await mountSearch('/app?search=1&type=people')
    // roster 两行（fanfan/alice）与团队注册表 alice 去重 → 2 行
    expect(w.find('[data-testid="search-row-p:@fanfan:matrix"]').exists()).toBe(true)
    expect(w.findAll('[data-testid^="search-row-p:"]').length).toBe(2)
    w.unmount()
  })

  it('运行空态给出去向且 0 徽标在选中时呈现', async () => {
    rows.runs.length = 0
    const { w, router, workspace } = await mountSearch('/app?search=1&type=runs')
    expect(w.find('[data-testid="search-count-runs"]').text()).toBe('0')
    expect(w.text()).toContain('全流程推演')
    await w.find('[data-testid="search-runs-goto-sim"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    expect(workspace.searchOpen).toBe(false)
    rows.runs.push({ runId: 'run21', status: 'running', stage: 'develop', iteration: 3, lastActivityAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    w.unmount()
  })

  it('关闭深链弹窗只清理检索参数', async () => {
    const { w, router, workspace } = await mountSearch('/app?search=1&q=Alice&type=people&standalone=1&keep=yes')
    await w.find('[data-testid="global-search-close"]').trigger('click')
    await flushPromises()
    expect(workspace.searchOpen).toBe(false)
    expect(router.currentRoute.value.query).toEqual({ standalone: '1', keep: 'yes' })
    w.unmount()
  })

  it('正常打开不改变当前路由', async () => {
    const { w, router, workspace } = await mountSearch('/app/board?keep=yes', false)
    workspace.openSearch()
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/board?keep=yes')
    w.unmount()
  })

  it('深链后退离开检索参数时关闭弹窗', async () => {
    const { w, router, workspace } = await mountSearch('/app?search=1')
    expect(workspace.searchOpen).toBe(true)
    await router.push('/app/board')
    await flushPromises()
    expect(workspace.searchOpen).toBe(false)
    w.unmount()
  })

  it('按钮上的 Enter 不执行当前高亮命令', async () => {
    const { w, router } = await mountSearch()
    await w.find('[data-testid="global-search-close"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.journey')
    w.unmount()
  })

  it('Escape 只发起一次深链参数清理', async () => {
    const { w, router } = await mountSearch('/app?search=1')
    const replace = vi.spyOn(router, 'replace')
    await w.find('[data-testid="search-input"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(replace).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('文档索引只在首次打开时加载', async () => {
    const { w, workspace } = await mountSearch('/app', false)
    expect(govApi.fetchGovernanceOverview).not.toHaveBeenCalled()
    workspace.openSearch()
    await flushPromises()
    expect(govApi.fetchGovernanceOverview).toHaveBeenCalledTimes(1)
    workspace.closeSearch()
    await flushPromises()
    workspace.openSearch()
    await flushPromises()
    expect(govApi.fetchGovernanceOverview).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('文档缓存跨弹窗宿主实例复用', async () => {
    const first = await mountSearch()
    first.w.unmount()
    const second = await mountSearch()
    second.w.unmount()
    expect(govApi.fetchGovernanceOverview).toHaveBeenCalledTimes(1)
  })

  it('文档索引失败显示真实错误', async () => {
    govApi.fetchGovernanceOverview.mockRejectedValueOnce(new Error('down'))
    const { w } = await mountSearch()
    await flushPromises()
    expect(w.find('.srch__err').text()).toContain('文档索引暂不可达')
    w.unmount()
  })
})
