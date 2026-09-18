// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ops-scene.test.ts
// 运行场景枢纽守门（2026-09-18 统一导航 Task 4）：三 tab（runs/inbox/duty）+
// duty 默认选中 + 切 tab 生效 + ?tab= 深链预选 + 值守三栏原断言（告警/分诊/
// 值班台/快捷动作）。重组件（RunCenterView/InboxView/wizard/modal）一律桩化。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [
      { runId: 'r1', graphId: 'l1', status: 'awaiting-input', updatedAt: '2026-09-16T01:00:00Z',
        stage: 'discovery', iteration: 1, lastActivityAt: '2026-09-16T01:00:00Z',
        cost: 0, events: [], pendingInterruptId: 'i1' },
      { runId: 'r2', graphId: 'l1', status: 'running', updatedAt: '2026-09-16T01:00:00Z',
        stage: 'exec', iteration: 0, lastActivityAt: '2026-09-16T01:00:00Z',
        cost: 0, events: [], pendingInterruptId: null },
    ] as Array<Record<string, unknown>>),
    replay: vi.fn(async () => []),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'r1', instance: {} })),
    forkRun: vi.fn(async () => ({})),
    startRun: vi.fn(async () => ({})),
    exportRun: vi.fn(async () => ({})),
    getSpec: vi.fn(async () => null),
    getMind: vi.fn(async () => ({ thoughts: [], runs: [], available: true })),
  },
  loopRest: {
    listLoops: vi.fn(async () => [{
      id: 'l1', name: '日报循环', goal: '', stopCondition: '', pattern: 'daily-report',
      schedule: { type: 'cron', cron: '0 9 * * *' }, stage: 'discovery', status: 'idle',
      autonomyLevel: 'level-2', stateAdapter: 'local',
      createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
      lastTickAt: null, nextTickAt: null,
      budget: { maxCostTotal: 10 }, stats: { tasksCompleted: 0, tasksDiscovered: 0, totalCost: 0 },
    }] as Array<Record<string, unknown>>),
    getEvents: vi.fn(async () => []),
    tickLoop: vi.fn(async () => ({})),
    pauseLoop: vi.fn(async () => ({})),
    deleteLoop: vi.fn(async () => ({})),
  },
}))
vi.mock('@/custom/loop/runcenter/api', () => ({
  runRest,
  connectGraph: vi.fn(() => ({ connected: true, on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })),
  disconnectGraph: vi.fn(),
}))
vi.mock('@/custom/loop/api/loop-rest', () => ({ loopRest }))

// workspace 桩需要响应式：场景模板 v-if="workspace.scheduleOpen" 依赖 ref 触发重渲染
// （真身 store 里 scheduleOpen 是 ref；桩用 plain 对象则点击后 modal 不出现）
const workspaceStubs = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  const state = reactive({
    tasks: [] as Array<Record<string, unknown>>,
    userTodos: [] as Array<Record<string, unknown>>,
    scheduleOpen: false,
    openSchedule: vi.fn(() => { state.scheduleOpen = true }),
    loadTodos: vi.fn(),
    startReminderScheduler: vi.fn(),
    stopReminderScheduler: vi.fn(),
    initFleetStream: vi.fn(),
    stopFleetStream: vi.fn(),
    watchKanbanTasks: vi.fn(),
    unwatchKanbanTasks: vi.fn(),
    onBoardEvent: vi.fn(() => () => {}),
    refreshAllBoards: vi.fn(async () => true),
  })
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/custom/loop/components/LoopCreateWizard.vue', () => ({
  default: { name: 'WizardStub', emits: ['close', 'created'], template: '<div class="wizard-stub" />' },
}))
vi.mock('@/custom/cockpit/components/CockpitScheduleModal.vue', () => ({
  default: { name: 'ScheduleStub', template: '<div class="schedule-stub" />' },
}))
vi.mock('@/custom/loop/runcenter/views/RunCenterView.vue', () => ({
  default: { name: 'RunCenterStub', template: '<div data-testid="runcenter-stub" />' },
}))
vi.mock('../views/InboxView.vue', () => ({
  default: { name: 'InboxStub', template: '<div data-testid="inbox-stub" />' },
}))

import OpsScene from '../views/scenes/OpsScene.vue'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useLoopStore } from '@/custom/loop/store/loop'

async function mountScene(path = '/app/ops') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/ops', name: 'ia2.ops', component: { template: '<div />' } },
      { path: '/app/ops/runs/:runId', name: 'ia2.runDetail', component: { template: '<div />' } },
      { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
    ],
  })
  router.push(path)
  await router.isReady()
  const wrapper = mount(OpsScene, { global: { plugins: [router] }, attachTo: document.body })
  // 场景依赖壳武装的数据：测试里手动补一轮（壳测试已守门武装序列）
  await useRunCenterStore().fetchRuns()
  await useLoopStore().fetchLoops()
  await flushPromises()
  return { wrapper, router }
}

describe('OpsScene — 三 tab 枢纽', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    workspaceStubs.state.scheduleOpen = false
    localStorage.clear()
  })

  it('三枚 tab 渲染（运行/介入/值班台），label 用现存 i18n key', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="ops-tab-runs"]').text()).toBe('ia2.nav.runs')
    expect(wrapper.find('[data-testid="ops-tab-inbox"]').text()).toBe('ia2.nav.inbox')
    expect(wrapper.find('[data-testid="ops-tab-duty"]').text()).toBe('loopScenes.ops.duty')
  })

  it('默认选中 duty：三栏本体渲染，runs/inbox 面板不挂', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="ops-tab-duty"]').classes()).toContain('ia-tabs__btn--on')
    expect(wrapper.find('[data-testid="runcenter-stub"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="inbox-stub"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ops-runs"]').exists()).toBe(true)
  })

  it('切 runs tab 挂 RunCenterView；切 inbox tab 挂 InboxView', async () => {
    const { wrapper } = await mountScene()
    await wrapper.find('[data-testid="ops-tab-runs"]').trigger('click')
    expect(wrapper.find('[data-testid="runcenter-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ops-runs"]').exists()).toBe(false) // duty 本体让位
    await wrapper.find('[data-testid="ops-tab-inbox"]').trigger('click')
    expect(wrapper.find('[data-testid="inbox-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="runcenter-stub"]').exists()).toBe(false)
  })

  it('?tab= 深链预选：/app/ops?tab=runs 直进运行面板；非法值回退 duty', async () => {
    const { wrapper } = await mountScene('/app/ops?tab=runs')
    expect(wrapper.find('[data-testid="runcenter-stub"]').exists()).toBe(true)
    const { wrapper: w2 } = await mountScene('/app/ops?tab=bogus')
    expect(w2.find('[data-testid="ops-runs"]').exists()).toBe(true) // duty 默认
  })

  it('query.tab 变化跟随（组件复用不重挂载）：合法值切面板、非法值回退 duty', async () => {
    const { wrapper, router } = await mountScene()
    expect(wrapper.find('[data-testid="ops-runs"]').exists()).toBe(true) // 起始 duty
    await router.push('/app/ops?tab=runs')
    await flushPromises()
    expect(wrapper.find('[data-testid="runcenter-stub"]').exists()).toBe(true)
    await router.push('/app/ops?tab=inbox')
    await flushPromises()
    expect(wrapper.find('[data-testid="inbox-stub"]').exists()).toBe(true)
    await router.push('/app/ops?tab=bogus')
    await flushPromises()
    expect(wrapper.find('[data-testid="ops-runs"]').exists()).toBe(true) // 非法回 duty
  })

  it('订阅续命：离开 runs tab 后按壳口径重建 graph 订阅（syncVisibleRunIds 再调用）', async () => {
    const { wrapper } = await mountScene()
    const store = useRunCenterStore()
    const sync = vi.spyOn(store, 'syncVisibleRunIds')
    await wrapper.find('[data-testid="ops-tab-runs"]').trigger('click')
    expect(wrapper.find('[data-testid="runcenter-stub"]').exists()).toBe(true)
    // 进入 runs 不重建（RunCenterView 自管可见页订阅域）
    expect(sync).not.toHaveBeenCalled()
    // 切走（runs → inbox）：post-flush watcher 重建 awaiting∪running 订阅
    await wrapper.find('[data-testid="ops-tab-inbox"]').trigger('click')
    await flushPromises()
    // fixture：r1=awaiting-input、r2=running（awaiting 在前，与壳 bootShared 同口径，cap 30）
    expect(sync).toHaveBeenCalledTimes(1)
    expect(sync).toHaveBeenCalledWith(['r1', 'r2'])
  })
})

describe('OpsScene — duty 三栏装配', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    workspaceStubs.state.scheduleOpen = false
    localStorage.clear()
  })

  it('告警空态 + 工单分诊渲染待决审批（同源 inbox-center 投影）', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-alarm-list]').exists()).toBe(true)
    expect(wrapper.text()).toContain('ia2.inbox.alarmEmpty')
    // 待分诊区出现 r1（awaiting 审批条目；标题 = runId，见 normalizeApprovals）
    expect(wrapper.text()).toContain('r1')
  })

  it('值班台：进行中/待介入 runs 表渲染两行', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="ops-runs"]').exists()).toBe(true)
    // RunListTable 是虚拟滚动 div 行（.rc-table__row），DOM 选择器跨组件耦合——
    // 按 props 断言场景已把过滤后的 runs 交给表（行渲染由 RunListTable 自测守门）
    const table = wrapper.findComponent({ name: 'RunListTable' })
    expect(table.props('runs')).toHaveLength(2)
  })

  it('快捷动作：新建循环开 wizard；日程走 workspace.openSchedule；协作中心跳协作场景', async () => {
    const { wrapper, router } = await mountScene()
    const push = vi.spyOn(router, 'push')
    expect(wrapper.find('.wizard-stub').exists()).toBe(false)
    await wrapper.find('[data-testid="ops-new-loop"]').trigger('click')
    expect(wrapper.find('.wizard-stub').exists()).toBe(true)
    await wrapper.find('[data-testid="ops-schedule"]').trigger('click')
    expect(workspaceStubs.state.openSchedule).toHaveBeenCalled()
    expect(wrapper.find('.schedule-stub').exists()).toBe(true)
    await wrapper.find('[data-testid="ops-cockpit"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ia2.collab' })
  })

  it('runs 表选择跳运行详情（恒 ia2.runDetail）', async () => {
    const { wrapper, router } = await mountScene()
    const push = vi.spyOn(router, 'push')
    const table = wrapper.findComponent({ name: 'RunListTable' })
    table.vm.$emit('select', { runId: 'r2' })
    expect(push).toHaveBeenCalledWith({ name: 'ia2.runDetail', params: { runId: 'r2' } })
  })
})
