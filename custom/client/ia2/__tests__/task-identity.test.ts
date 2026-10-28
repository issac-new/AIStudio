// @vitest-environment jsdom
// 日常/推演复合任务身份守门：同 board、同 taskId 必须同时存在；
// UI 使用 TaskRef.key，原 taskId 只在所属日常 API 边界使用，sim 永远只读。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'

const ctx = vi.hoisted(() => {
  const dailyRaw = {
    id: 'shared', title: '日常验收', status: 'review', assignee: 'daily-owner', priority: 1,
    created_at: 100, completed_at: null, started_at: null, last_heartbeat_at: null,
    tenant: null, session_id: null, workspace_path: '/daily', branch_name: 'daily-branch',
    body: null, result: null,
  }
  const simRaw = {
    ...dailyRaw, title: '推演验收', assignee: 'sim-owner', workspace_path: '/sim',
    branch_name: 'sim-branch', source: 'sim', runId: 'run-7',
  }
  const toCockpitTask = vi.fn((task: typeof dailyRaw, board: string) => ({
    id: task.id,
    title: task.title,
    priority: 'P2' as const,
    status: task.status,
    assignee: task.assignee,
    workspace: task.workspace_path,
    tenant: task.tenant,
    boardSlug: board,
    createdAt: task.created_at * 1000,
    sessionId: task.session_id,
  }))
  const messages = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
  const kanban = {
    selectedBoard: 'default', filterStatus: null as string | null, filterAssignee: null as string | null,
    searchQuery: '', selectedIds: new Set<string>(), loading: false,
    tasks: [] as unknown[], boards: [] as unknown[], assignees: [] as Array<{ name: string }>,
    diagnostics: [] as unknown[], stats: null,
    setBoard: vi.fn((board: string) => { kanban.selectedBoard = board }),
    fetchCapabilities: vi.fn(async () => ({})), fetchBoards: vi.fn(async () => []),
    fetchStats: vi.fn(), fetchAssignees: vi.fn(), fetchDiagnostics: vi.fn(),
    isCapabilitySupported: vi.fn(() => false), fetchOrchestration: vi.fn(), connectEvents: vi.fn(),
    toggleSelection: vi.fn((key: string) => {
      if (kanban.selectedIds.has(key)) kanban.selectedIds.delete(key)
      else kanban.selectedIds.add(key)
    }),
    clearSelection: vi.fn(() => { kanban.selectedIds.clear() }),
    moveTask: vi.fn(async () => ({})), deleteTask: vi.fn(async () => ({})),
    createTask: vi.fn(async () => ({})), patchTask: vi.fn(async () => ({})),
    assignTask: vi.fn(async () => ({})), reassignTask: vi.fn(async () => ({})),
    bulkComplete: vi.fn(async () => ({})), bulkBlock: vi.fn(async () => ({})),
    bulkUnblock: vi.fn(async () => ({})), bulkArchive: vi.fn(async () => ({})),
    dispatch: vi.fn(async () => ({})),
    setStatusFilter: vi.fn(), setAssigneeFilter: vi.fn(), setSearchQuery: vi.fn(), setFilter: vi.fn(),
  }
  return {
    dailyRaw, simRaw, toCockpitTask, messages, kanban,
    teams: { fetchKanbanOverview: vi.fn() },
    simObserver: { fetchSimObserverOverview: vi.fn() },
    fleet: { connectOverviewStream: vi.fn(() => ({ close: vi.fn() })) },
    kanbanApi: { listBoards: vi.fn(async () => []), listTasks: vi.fn(async () => []) },
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
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: () => ctx.kanban }))
vi.mock('@/api/client', () => ({ getStoredUsername: () => 'daily-owner' }))
vi.mock('@/custom/ia2/api/gatekeeper', () => ({ nudgeRoute: vi.fn() }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'zh' } }),
}))
vi.mock('naive-ui', () => ({
  NSpin: { name: 'NSpin', template: '<div class="n-spin-stub" />' },
  NButton: { name: 'NButton', template: '<button type="button"><slot /></button>' },
  NCheckbox: { name: 'NCheckbox', props: ['checked'], template: '<button type="button" class="n-checkbox-stub" />' },
  useMessage: () => ctx.messages,
}))

vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: () => ({ runs: [] }) }))
vi.mock('@/custom/shared/store/cockpit', () => ({
  useCockpitStore: () => ({ fleetSessions: [], teams: [], currentUserName: '' }),
}))
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: () => ({ loops: [] }) }))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ sessions: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ sortedRooms: [] }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ rooms: [] }) }))
vi.mock('@/custom/matrix-teams/stores/team-registry', () => ({ useTeamRegistryStore: () => ({ accounts: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ client: null }) }))
vi.mock('../store/platforms', () => ({
  usePlatformsStore: () => ({ retain: vi.fn(), release: vi.fn(), gatewayState: 'offline', platforms: [] }),
}))
vi.mock('../composables/useNowTick', () => ({ useNowTick: () => ref(0) }))
vi.mock('../composables/useDailyStageProgress', () => ({
  useDailyStageProgress: () => ({
    stageState: () => 'current', stepState: () => 'untracked', stageCount: () => 0,
  }),
}))

vi.mock('@/custom/kanban/components/KanbanBoard.vue', () => ({
  default: {
    name: 'KanbanBoard',
    props: ['tasks', 'selectedIds'],
    template: '<div data-testid="kanban-board-stub" />',
  },
}))
vi.mock('@/custom/kanban/components/KanbanToolbar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/custom/kanban/components/KanbanBulkBar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({
  default: {
    name: 'KanbanTaskDrawer', props: ['show', 'taskId'],
    template: '<div v-if="show" data-testid="task-drawer-stub" :data-task-id="taskId" />',
  },
}))
vi.mock('@/custom/kanban/components/KanbanOrchestrationPanel.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/custom/kanban/components/KanbanAttentionStrip.vue', () => ({ default: { template: '<div />' } }))

import { useWorkspaceStore } from '@/custom/shared/store/workspace'
import { useSitCounts } from '../composables/useSitCounts'
import KanbanColumn from '../../kanban/components/KanbanColumn.vue'
import SwarmKanbanView from '../../kanban/views/SwarmKanbanView.vue'
import StageAcceptanceOverview from '../views/stage/StageAcceptanceOverview.vue'
import DailyUatPanel from '../views/stage/DailyUatPanel.vue'
import StageShell from '../views/stage/StageShell.vue'

const DAILY_KEY = 'daily:main:shared'
const SIM_KEY = 'sim:run-7:main:shared'

function overviewFixture() {
  return {
    boards: [{ slug: 'main', name: 'Main', total: 1 }],
    tasks: [ctx.toCockpitTask(ctx.dailyRaw, 'main')],
    rawTasks: [{ board: 'main', task: ctx.dailyRaw }],
  }
}

function simFixture() {
  return {
    available: true, runId: 'run-7', posture: 'standard', startedAt: 1, rooms: [],
    boards: [{ slug: 'main', name: 'Main', total: 1 }],
    tasks: [{ board: 'main', task: ctx.simRaw }],
  }
}

async function seedWorkspace() {
  const workspace = useWorkspaceStore()
  await workspace.refreshAllBoards(true)
  return workspace
}

async function routerForTest() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/sim', name: 'ia2.sim', component: { template: '<div />' } },
      { path: '/inbox', name: 'ia2.inbox', component: { template: '<div />' } },
      { path: '/sim/evidence', name: 'ia2.simEvidence', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  return router
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  ctx.teams.fetchKanbanOverview.mockResolvedValue(overviewFixture())
  ctx.simObserver.fetchSimObserverOverview.mockResolvedValue(simFixture())
  ctx.kanban.selectedBoard = 'default'
  ctx.kanban.selectedIds = new Set<string>()
  ctx.kanban.filterStatus = null
  ctx.kanban.filterAssignee = null
  ctx.kanban.searchQuery = ''
})

describe('workspace TaskRef 身份', () => {
  it('同 board、同 taskId 的 daily/sim 同时保留，且只有 daily ref 可写', async () => {
    const workspace = await seedWorkspace()
    expect(workspace.tasks).toHaveLength(2)
    expect(workspace.dailyTasks?.map(task => task.key)).toEqual([DAILY_KEY])
    expect(workspace.simTasks?.map(task => task.key)).toEqual([SIM_KEY])
    expect(workspace.dailyTasks?.[0].taskId).toBe('shared')
    expect(workspace.simTasks?.[0].taskId).toBe('shared')
    expect(workspace.isWritableTask?.(workspace.dailyTasks?.[0])).toBe(true)
    expect(workspace.isWritableTask?.(workspace.simTasks?.[0])).toBe(false)
  })

  it('态势计数只统计 dailyTasks，不把同 ID 的 sim 再算一次', async () => {
    await seedWorkspace()
    const scope = effectScope()
    const counts = scope.run(() => useSitCounts())!
    expect(counts.openTasks.value.map(task => task.id)).toEqual(['shared'])
    expect(counts.tasks.value.total).toBe(1)
    expect(counts.boardRows.value.map(board => board.slug)).toEqual(['main'])
    scope.stop()
  })
})

describe('KanbanColumn 复合卡片 key 与选择', () => {
  const CardStub = {
    name: 'KanbanTaskCard', props: ['task', 'selected'], emits: ['click'],
    template: '<button type="button" class="card-stub" @click="$emit(\'click\', task.id, false, false)">{{ task.title }}</button>',
  }
  const tasks = () => [
    { ...ctx.dailyRaw, __taskKey: DAILY_KEY },
    { ...ctx.simRaw, __taskKey: SIM_KEY },
  ]

  it('同 ID 两张卡使用不同 Vue key，点击上抛各自 ref key', async () => {
    const w = mount(KanbanColumn, {
      props: { status: 'review', title: 'Review', tasks: tasks() },
      global: { stubs: { KanbanTaskCard: CardStub } },
    })
    const cards = w.findAllComponents(CardStub)
    expect(cards.map(card => (card.vm as unknown as { $: { vnode: { key?: string } } }).$.vnode.key)).toEqual([DAILY_KEY, SIM_KEY])
    await cards[1].trigger('click')
    expect(w.emitted('taskClick')?.[0]).toEqual([SIM_KEY, false, false])
  })

  it('daily key 的选中态不会扩散到同 ID 的 sim 卡', () => {
    const w = mount(KanbanColumn, {
      props: { status: 'review', title: 'Review', tasks: tasks(), selectedIds: new Set([DAILY_KEY]) },
      global: { stubs: { KanbanTaskCard: CardStub } },
    })
    expect(w.findAllComponents(CardStub).map(card => card.props('selected'))).toEqual([true, false])
  })

  it('列全选状态只计算可写 daily 卡，不被只读 sim 卡住', () => {
    const w = mount(KanbanColumn, {
      props: { status: 'review', title: 'Review', tasks: tasks(), selectedIds: new Set([DAILY_KEY]) },
      global: { stubs: { KanbanTaskCard: CardStub } },
    })
    expect(w.findComponent({ name: 'NCheckbox' }).props('checked')).toBe(true)
  })
})

describe('看板写边界', () => {
  it('看板卡片携带复合 key；daily 选择保留 key，抽屉只接收原 taskId', async () => {
    await seedWorkspace()
    const router = await routerForTest()
    const w = mount(SwarmKanbanView, { global: { plugins: [router] } })
    await flushPromises()
    const board = w.findComponent({ name: 'KanbanBoard' })
    expect((board.props('tasks') as Array<{ __taskKey?: string }>).map(task => task.__taskKey)).toEqual([DAILY_KEY, SIM_KEY])
    const vm = w.vm as unknown as { handleTaskClick: (key: string, multi: boolean, range: boolean) => void }
    vm.handleTaskClick(DAILY_KEY, true, false)
    expect(ctx.kanban.selectedIds.has(DAILY_KEY)).toBe(true)
    expect(ctx.kanban.selectedIds.has(SIM_KEY)).toBe(false)
    vm.handleTaskClick(DAILY_KEY, false, false)
    await nextTick()
    expect(w.find('[data-testid="task-drawer-stub"]').attributes('data-task-id')).toBe('shared')
  })

  it('sim ref 不进入选择、抽屉或日常移动 API，并显式跳推演只读页', async () => {
    await seedWorkspace()
    const router = await routerForTest()
    const w = mount(SwarmKanbanView, { global: { plugins: [router] } })
    await flushPromises()
    const vm = w.vm as unknown as {
      handleTaskClick: (key: string, multi: boolean, range: boolean) => void
      handleColumnDrop: (status: string, event: DragEvent) => Promise<void>
    }
    vm.handleTaskClick(SIM_KEY, true, false)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.sim')
    expect(router.currentRoute.value.query.run).toBe('run-7')
    expect(ctx.kanban.selectedIds.size).toBe(0)
    expect(w.find('[data-testid="task-drawer-stub"]').exists()).toBe(false)
    const transfer = { getData: () => SIM_KEY }
    await vm.handleColumnDrop('done', { dataTransfer: transfer } as unknown as DragEvent)
    expect(ctx.kanban.moveTask).not.toHaveBeenCalled()
  })

  it('sim ref 批量写不触发日常 API，也不伪报成功', async () => {
    await seedWorkspace()
    const router = await routerForTest()
    const w = mount(SwarmKanbanView, { global: { plugins: [router] } })
    await flushPromises()
    ctx.kanban.selectedIds = new Set([SIM_KEY])
    const vm = w.vm as unknown as { handleBulkComplete: () => Promise<void> }
    await vm.handleBulkComplete()
    expect(ctx.kanban.bulkComplete).not.toHaveBeenCalled()
    expect(ctx.messages.success).not.toHaveBeenCalled()
  })

  it('daily ref 拖拽到 API 边界才还原为原 taskId', async () => {
    await seedWorkspace()
    const router = await routerForTest()
    const w = mount(SwarmKanbanView, { global: { plugins: [router] } })
    await flushPromises()
    const vm = w.vm as unknown as { handleColumnDrop: (status: string, event: DragEvent) => Promise<void> }
    const transfer = { getData: () => DAILY_KEY }
    await vm.handleColumnDrop('done', { dataTransfer: transfer } as unknown as DragEvent)
    expect(ctx.kanban.moveTask).toHaveBeenCalledWith('shared', 'done')
  })
})

describe('阶段审批与抽屉身份', () => {
  it('验收总览只统计 dailyTasks', async () => {
    await seedWorkspace()
    const router = await routerForTest()
    const w = mount(StageAcceptanceOverview, { global: { plugins: [router] } })
    expect(w.find('[data-testid="stg-accept-uat"] strong').text()).toBe('1')
    expect(w.find('[data-testid="stg-accept-trace"] strong').text()).toBe('1')
  })

  it('UAT 同 ID 只列 daily，审批动作上抛 daily ref key', async () => {
    await seedWorkspace()
    const router = await routerForTest()
    const w = mount(DailyUatPanel, { global: { plugins: [router] } })
    expect(w.findAll('.dup__row')).toHaveLength(1)
    expect(w.find('.dup__name').text()).toBe('日常验收')
    await w.find('.dup__row button').trigger('click')
    expect(w.emitted('open-task')?.[0]).toEqual([DAILY_KEY])
  })

  it('StageShell 用 daily ref 打开原 ID 抽屉，拒绝 sim ref 写抽屉', async () => {
    await seedWorkspace()
    const router = await routerForTest()
    const w = mount(StageShell, {
      props: { stage: 5 },
      global: {
        plugins: [router],
        stubs: {
          StageAcceptanceOverview: { template: '<div />' },
          IaBreadcrumb: { template: '<div />' },
        },
      },
    })
    const vm = w.vm as unknown as { openTask: (key: string) => void }
    vm.openTask(SIM_KEY)
    await nextTick()
    expect(w.find('[data-testid="task-drawer-stub"]').exists()).toBe(false)
    vm.openTask(DAILY_KEY)
    await nextTick()
    expect(w.find('[data-testid="task-drawer-stub"]').attributes('data-task-id')).toBe('shared')
  })
})
