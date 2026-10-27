// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/shared-lifecycle.test.ts
// Task 5（2026-10-27 产品一致性）提醒与共享数据生命周期守门：
//   ① useSharedArm 武装/回收序列完整：graph 通道（runs.disconnect）随宽限冲刷
//      关闭；无生产消费者的 metrics 预取退场（fetchMetrics 不得进共享启动路径，
//      store 保留该 API 供显式调用）；
//   ② SwarmKanbanView 单板 kanban 事件流「挂载连接 / 卸载停止」——旧实现只在
//      onMounted connectEvents，离开看板页后 WS 与重连退避定时器整会话泄漏；
//   ③ 聚合面异步状态（workspace.overviewStatus 四态）在看板板条有一处真实提示：
//      stale=保留旧数据但刷新失败、error=无数据、partial=部分板失败——
//      不冒充成功也不静默空态。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, fallback?: string) => fallback ?? k }) }))
vi.mock('naive-ui', () => ({
  NSpin: { name: 'NSpin', props: ['size'], template: '<div class="spin-stub" />' },
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}))

// ── workspace store 桩：武装/回收序列断言 + 聚合状态字段（视图段消费）──
const workspaceStubs = vi.hoisted(() => {
  const state = {
    loadTodos: vi.fn(),
    startReminderScheduler: vi.fn(),
    watchKanbanTasks: vi.fn(),
    initFleetStream: vi.fn(),
    refreshAllBoards: vi.fn(async () => true),
    unwatchKanbanTasks: vi.fn(),
    stopFleetStream: vi.fn(),
    stopReminderScheduler: vi.fn(),
    // Task 5：聚合面异步状态（ok/partial/stale/error）；视图段按此渲染提示
    overviewStatus: 'ok' as string,
    // 看板消费面（SwarmKanbanView 段）
    boards: [] as Array<{ slug: string; name: string; total: number }>,
    rawTasks: [] as Array<{ board: string; task: any }>,
    dailyTasks: [] as any[],
    simTasks: [] as any[],
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({
  useWorkspaceStore: workspaceStubs.useWorkspaceStore,
  isWritableTask: (ref: { source?: string } | null | undefined) => ref?.source === 'daily',
}))

// ── cockpit / runs / loop / platforms store 桩 ──
const cockpitStubs = vi.hoisted(() => {
  const state = { bootstrap: vi.fn(async () => {}), disconnectOnUnmount: vi.fn() }
  return { state, useCockpitStore: () => state }
})
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))

const runsStubs = vi.hoisted(() => {
  const state = {
    fetchRuns: vi.fn(async () => {}),
    awaitingRuns: [{ runId: 'r-await' }],
    sortedRuns: [{ runId: 'r-await', status: 'awaiting-input' }],
    runs: [] as any[],
    syncVisibleRunIds: vi.fn(),
    fetchMetrics: vi.fn(async () => null),
    disconnect: vi.fn(),
    connection: 'disconnected',
  }
  return { state, useRunCenterStore: () => state }
})
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: runsStubs.useRunCenterStore }))

const loopStubs = vi.hoisted(() => {
  const state = { fetchLoops: vi.fn(async () => {}) }
  return { state, useLoopStore: () => state }
})
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: loopStubs.useLoopStore }))

const platformsStubs = vi.hoisted(() => {
  const state = { retain: vi.fn(), release: vi.fn() }
  return { state, usePlatformsStore: () => state }
})
vi.mock('@/custom/ia2/store/platforms', () => ({ usePlatformsStore: platformsStubs.usePlatformsStore }))

// ── SwarmKanbanView 消费面桩（形状对齐 swarm-kanban-aggregate.test.ts）──
const kanbanStoreStubs = vi.hoisted(() => {
  const state = {
    selectedBoard: 'default',
    filterStatus: null as string | null,
    filterAssignee: null as string | null,
    searchQuery: '',
    selectedIds: new Set<string>(),
    loading: false,
    tasks: [] as any[],
    boards: [] as any[],
    assignees: [] as Array<{ name: string }>,
    diagnostics: [],
    stats: null,
    setBoard: vi.fn(),
    fetchCapabilities: vi.fn(), fetchBoards: vi.fn(async () => {}), fetchTasks: vi.fn(),
    fetchStats: vi.fn(), fetchAssignees: vi.fn(), fetchDiagnostics: vi.fn(),
    isCapabilitySupported: vi.fn(() => false),
    fetchOrchestration: vi.fn(),
    connectEvents: vi.fn(),
    stopEventStream: vi.fn(),
    toggleSelection: vi.fn(), clearSelection: vi.fn(),
  }
  return { state, useKanbanStore: () => state }
})
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: kanbanStoreStubs.useKanbanStore }))

vi.mock('@/custom/kanban/components/KanbanBoard.vue', () => ({
  default: { name: 'KanbanBoard', props: ['tasks', 'selectedIds', 'includeArchived', 'laneByProfile', 'loading', 'parentTasks'], template: '<div class="kb-stub" data-testid="kanban-board-stub" />' },
}))
vi.mock('@/custom/kanban/components/KanbanToolbar.vue', () => ({
  default: { name: 'KanbanToolbar', props: { hideBoardSelect: Boolean, taskCount: Number, boards: Array, currentBoard: String, assignees: Array, tenants: Array }, template: '<div class="kt-stub" data-testid="kanban-toolbar-stub" />' },
}))
vi.mock('@/custom/kanban/components/KanbanBulkBar.vue', () => ({ default: { name: 'KanbanBulkBar', template: '<div />' } }))
vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({ default: { name: 'KanbanTaskDrawer', props: ['show', 'taskId'], template: '<div class="drawer-stub" v-if="show" />' } }))
vi.mock('@/custom/kanban/components/KanbanOrchestrationPanel.vue', () => ({ default: { name: 'KanbanOrchestrationPanel', template: '<div />' } }))
vi.mock('@/custom/kanban/components/KanbanAttentionStrip.vue', () => ({ default: { name: 'KanbanAttentionStrip', props: ['diagnostics', 'expanded'], template: '<div />' } }))

import { useSharedArm, __resetSharedArmForTest, __flushSharedArmDisposeForTest } from '../composables/useSharedArm'
import SwarmKanbanView from '@/custom/kanban/views/SwarmKanbanView.vue'

// useSharedArm 只需组件生命周期钩子，无需路由/重图——最小探针组件
const Probe = defineComponent({ name: 'SharedArmProbe', setup() { useSharedArm(); return () => h('div') } })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  __resetSharedArmForTest()
  workspaceStubs.state.overviewStatus = 'ok'
  kanbanStoreStubs.state.selectedBoard = 'default'
})

describe('useSharedArm — 共享武装/回收生命周期（Task 5）', () => {
  it('武装序列：workspace 唯一提醒调度 + runs/loops/cockpit 装配；不再预取无消费者的 metrics', async () => {
    const w = mount(Probe)
    await flushPromises()
    expect(workspaceStubs.state.loadTodos).toHaveBeenCalled()
    expect(workspaceStubs.state.startReminderScheduler).toHaveBeenCalledTimes(1)
    expect(workspaceStubs.state.watchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.initFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.refreshAllBoards).toHaveBeenCalled()
    expect(cockpitStubs.state.bootstrap).toHaveBeenCalled()
    expect(runsStubs.state.fetchRuns).toHaveBeenCalled()
    expect(runsStubs.state.syncVisibleRunIds).toHaveBeenCalled()
    expect(loopStubs.state.fetchLoops).toHaveBeenCalled()
    expect(platformsStubs.state.retain).toHaveBeenCalled()
    // Task 5：metrics 采集（1 次 listRuns + ≤20 次 replay 的昂贵链路）生产零消费
    // （aggregateMetrics/metricsRaw 无视图消费方）——不得挂在共享武装路径上
    expect(runsStubs.state.fetchMetrics, 'fetchMetrics 不得进共享启动路径（供显式调用保留）').not.toHaveBeenCalled()
    w.unmount()
  })

  it('回收序列：宽限冲刷后 graph 通道断开（runs.disconnect）+ workspace/cockpit 双侧回收', async () => {
    const w = mount(Probe)
    await flushPromises()
    w.unmount()
    __flushSharedArmDisposeForTest()
    expect(workspaceStubs.state.unwatchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.stopFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.stopReminderScheduler).toHaveBeenCalled()
    expect(cockpitStubs.state.disconnectOnUnmount).toHaveBeenCalled()
    expect(platformsStubs.state.release).toHaveBeenCalled()
    // Task 5：runs store 存在 disconnect() 但此前无调用方——离壳必须关闭 graph 通道
    expect(runsStubs.state.disconnect, '宽限回收必须断开 graph socket').toHaveBeenCalledTimes(1)
  })

  it('宽限期内重新挂载：取消回收不断流；真正闲置冲刷后才断开', async () => {
    const w1 = mount(Probe)
    await flushPromises()
    w1.unmount()
    // 未冲刷（宽限窗口内）：不得回收
    const w2 = mount(Probe)
    await flushPromises()
    expect(runsStubs.state.disconnect).not.toHaveBeenCalled()
    w2.unmount()
    __flushSharedArmDisposeForTest()
    expect(runsStubs.state.disconnect).toHaveBeenCalledTimes(1)
  })
})

describe('SwarmKanbanView — 单板 kanban 通道与聚合面状态提示（Task 5）', () => {
  async function mountView() {
    const w = mount(SwarmKanbanView)
    await flushPromises()
    return w
  }

  it('卸载停止单板 kanban 事件流（挂载连接 / 卸载停止，通道不跨页泄漏）', async () => {
    const w = await mountView()
    expect(kanbanStoreStubs.state.connectEvents).toHaveBeenCalled()
    w.unmount()
    expect(kanbanStoreStubs.state.stopEventStream, 'onUnmounted 必须停止事件流').toHaveBeenCalledTimes(1)
  })

  it('聚合面 stale：板条渲染「数据可能陈旧」提示（刷新失败保留旧数据，不冒充成功）', async () => {
    workspaceStubs.state.overviewStatus = 'stale'
    const w = await mountView()
    const notice = w.find('[data-testid="kanban-overview-notice"]')
    expect(notice.exists(), 'stale 态必须有一处可见提示').toBe(true)
    expect(notice.text()).toContain('陈旧')
    w.unmount()
  })

  it('error / partial 各有一句话提示；ok / loading 不提示', async () => {
    workspaceStubs.state.overviewStatus = 'error'
    const we = await mountView()
    expect(we.find('[data-testid="kanban-overview-notice"]').text()).toContain('失败')
    we.unmount()

    workspaceStubs.state.overviewStatus = 'partial'
    const wp = await mountView()
    expect(wp.find('[data-testid="kanban-overview-notice"]').text()).toContain('部分')
    wp.unmount()

    workspaceStubs.state.overviewStatus = 'ok'
    const wo = await mountView()
    expect(wo.find('[data-testid="kanban-overview-notice"]').exists()).toBe(false)
    wo.unmount()
  })
})
