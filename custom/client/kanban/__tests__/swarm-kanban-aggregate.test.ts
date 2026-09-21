// @vitest-environment jsdom
// overlay/custom/client/kanban/__tests__/swarm-kanban-aggregate.test.ts
// v12.5 聚合看板守门（2026-09-20 用户裁定：合并展示所有 kanban 数据，板名多选
// 筛选；修"默认板为空 → 页面全 0"）。数据源 = workspace.rawTasks 跨板聚合；
// 写操作先 setBoard(任务所在板) 再走 store 域动作（抽屉/批量同链路）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('naive-ui', () => ({
  NSpin: { name: 'NSpin', props: ['size'], template: '<div class="spin-stub" />' },
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

const workspaceStubs = vi.hoisted(() => {
  const state = {
    boards: [
      { slug: 'swarm', name: 'Swarm 主板', total: 2 },
      { slug: '[已移除]', name: '[已移除]', total: 1 },
    ],
    rawTasks: [
      { board: 'swarm', task: { id: 't-1', title: '发布', status: 'review', assignee: 'worker', priority: 2, created_at: 300, tenant: null, session_id: null, body: null, result: null } },
      { board: 'swarm', task: { id: 't-2', title: '联调', status: 'running', assignee: '你', priority: 1, created_at: 200, tenant: null, session_id: null, body: null, result: null } },
      { board: '[已移除]', task: { id: 't-3', title: '原理图', status: 'todo', assignee: null, priority: 0, created_at: 100, tenant: null, session_id: null, body: null, result: null } },
    ],
    refreshAllBoards: vi.fn(async () => true),
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

const kanbanStoreStubs = vi.hoisted(() => {
  const state = {
    selectedBoard: 'default',
    filterStatus: null as string | null,
    filterAssignee: null as string | null,
    searchQuery: '',
    selectedIds: new Set<string>(),
    loading: false,
    tasks: [] as unknown[],
    boards: [] as unknown[],
    assignees: [] as Array<{ name: string }>,
    diagnostics: [],
    stats: null,
    setBoard: vi.fn((b: string) => { state.selectedBoard = b }),
    fetchCapabilities: vi.fn(), fetchBoards: vi.fn(async () => {}), fetchTasks: vi.fn(),
    fetchStats: vi.fn(), fetchAssignees: vi.fn(), fetchDiagnostics: vi.fn(),
    fetchOrchestration: vi.fn(), connectEvents: vi.fn(),
    toggleSelection: vi.fn(), clearSelection: vi.fn(),
    moveTask: vi.fn(async () => ({})), deleteTask: vi.fn(async () => ({})),
    createTask: vi.fn(async () => ({})), patchTask: vi.fn(async () => ({})),
    assignTask: vi.fn(async () => ({})), reassignTask: vi.fn(async () => ({})),
    bulkComplete: vi.fn(async () => ({})), bulkBlock: vi.fn(async () => ({})),
    bulkUnblock: vi.fn(async () => ({})), bulkArchive: vi.fn(async () => ({})),
    dispatch: vi.fn(async () => ({})),
    setStatusFilter: vi.fn(), setAssigneeFilter: vi.fn(), setSearchQuery: vi.fn(),
  }
  return { state, useKanbanStore: () => state }
})
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: kanbanStoreStubs.useKanbanStore }))

// 重组件桩：KanbanBoard 暴露任务数；其余纯壳
vi.mock('../components/KanbanBoard.vue', () => ({
  default: { name: 'KanbanBoard', props: ['tasks', 'selectedIds', 'includeArchived', 'laneByProfile', 'loading', 'parentTasks'], emits: ['taskClick', 'inlineCreate', 'columnDrop'], template: '<div class="kb-stub" :data-count="tasks.length" data-testid="kanban-board-stub" @click="$emit(\'taskClick\', tasks[0]?.id, false, false)" />' },
}))
vi.mock('../components/KanbanToolbar.vue', () => ({
  default: { name: 'KanbanToolbar', props: { hideBoardSelect: { type: Boolean, default: false }, taskCount: Number, boards: Array, currentBoard: String, assignees: Array, tenants: Array }, template: '<div class="kt-stub" :data-hide-board="hideBoardSelect ? \'1\' : \'0\'" :data-count="taskCount" data-testid="kanban-toolbar-stub" />' },
}))
vi.mock('../components/KanbanBulkBar.vue', () => ({ default: { name: 'KanbanBulkBar', template: '<div />' } }))
vi.mock('../components/KanbanTaskDrawer.vue', () => ({ default: { name: 'KanbanTaskDrawer', props: ['show', 'taskId'], template: '<div class="drawer-stub" v-if="show" />' } }))
vi.mock('../components/KanbanOrchestrationPanel.vue', () => ({ default: { name: 'KanbanOrchestrationPanel', template: '<div />' } }))
vi.mock('../components/KanbanAttentionStrip.vue', () => ({ default: { name: 'KanbanAttentionStrip', props: ['diagnostics', 'expanded'], template: '<div />' } }))

import SwarmKanbanView from '../views/SwarmKanbanView.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  kanbanStoreStubs.state.selectedBoard = 'default'
})

async function mountView() {
  const w = mount(SwarmKanbanView)
  await flushPromises()
  return w
}

describe('SwarmKanbanView — v12.5 聚合模式', () => {
  it('全 0 回归守门：默认合并全部板（跨板 3 条全显示，不限 selectedBoard）', async () => {
    const w = await mountView()
    expect(w.find('[data-testid="kanban-board-stub"]').attributes('data-count')).toBe('3')
    // 聚合数据面在挂载时刷新
    expect(workspaceStubs.state.refreshAllBoards).toHaveBeenCalled()
    w.unmount()
  })

  it('板名 chip 多选筛选：排除 swarm 只剩 [已移除]；全部 chip 复位', async () => {
    const w = await mountView()
    expect(w.find('[data-testid="kanban-board-chip-swarm"]').exists()).toBe(true)
    expect(w.find('[data-testid="kanban-board-chip-[已移除]"]').exists()).toBe(true)
    await w.find('[data-testid="kanban-board-chip-swarm"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="kanban-board-stub"]').attributes('data-count')).toBe('1')
    await w.find('[data-testid="kanban-board-chip-[已移除]"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="kanban-board-stub"]').attributes('data-count')).toBe('0')
    await w.find('[data-testid="kanban-board-chip-all"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="kanban-board-stub"]').attributes('data-count')).toBe('3')
    w.unmount()
  })

  it('工具栏单板选择隐藏（hideBoardSelect）；板筛选由 chips 承载', async () => {
    const w = await mountView()
    expect(w.find('[data-testid="kanban-toolbar-stub"]').attributes('data-hide-board')).toBe('1')
    w.unmount()
  })

  it('写操作板定位：任务点击先 setBoard(任务所在板) 再开抽屉；写后刷新聚合面', async () => {
    const w = await mountView()
    await w.find('[data-testid="kanban-board-stub"]').trigger('click') // stub 发 taskClick(t-1)
    await flushPromises()
    expect(kanbanStoreStubs.state.setBoard).toHaveBeenCalledWith('swarm')
    expect(w.find('.drawer-stub').exists()).toBe(true)
    expect(workspaceStubs.state.refreshAllBoards).toHaveBeenCalled()
    w.unmount()
  })

  it('批量动作分板执行：跨板两任务按板分组各调一次 bulk 动作', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as { runBulk: (action: (ids: string[]) => Promise<unknown>, ids: string[]) => Promise<void> }
    kanbanStoreStubs.state.selectedIds = new Set(['t-1', 't-3'])
    await vm.runBulk(ids => kanbanStoreStubs.state.bulkComplete(ids), Array.from(kanbanStoreStubs.state.selectedIds))
    // t-1∈swarm、t-3∈[已移除] → 两组各一次；default 板不落单
    const calls = kanbanStoreStubs.state.bulkComplete.mock.calls.map(c => c[0])
    expect(calls).toEqual([['t-1'], ['t-3']])
    expect(workspaceStubs.state.refreshAllBoards).toHaveBeenCalled()
    w.unmount()
  })

  it('就地新建需唯一勾选板：多板时提示不建，单板时 setBoard 后 createTask', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as { handleInlineCreate: (status: string, data: unknown) => Promise<void> }
    await vm.handleInlineCreate('todo', { title: 'x' })
    expect(kanbanStoreStubs.state.createTask).not.toHaveBeenCalled()
    await w.find('[data-testid="kanban-board-chip-[已移除]"]').trigger('click') // 排除 [已移除] → 仅 swarm
    await flushPromises()
    await vm.handleInlineCreate('todo', { title: 'x' })
    expect(kanbanStoreStubs.state.setBoard).toHaveBeenCalledWith('swarm')
    expect(kanbanStoreStubs.state.createTask).toHaveBeenCalled()
    w.unmount()
  })
})
