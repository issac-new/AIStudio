// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/cockpit-view.test.ts
// 循环驾驶舱单页装配守门（2026-09-14 重构，替代 overview-components.test.ts）：
// 页头动作区 / KPI 条 / 介入收件箱 / 生长图舞台 / 循环面板（动作+确认）/
// 溢出菜单 / 空态引导 / 数据源武装与回收。
// i18n 走全局 setup 的 key 直返 mock；REST 与 workspace store 全部桩化
// （runs store 真身，桩形状与旧 overview 测试一致）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── REST 桩（runs store 真身）──
const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [] as Array<{ runId: string; graphId: string; status: string; updatedAt: string | null }>),
    replay: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
    forkRun: vi.fn(async () => ({ runId: 'f', forkedFrom: 'x', superStep: 0 })),
    startRun: vi.fn(async () => ({ runId: 'f', instance: {} })),
    exportRun: vi.fn(async () => ({ run: {}, spec: null, events: [] })),
    getSpec: vi.fn(async () => null),
  },
  loopRest: {
    listLoops: vi.fn(async () => [] as Array<Record<string, unknown>>),
    getEvents: vi.fn(async () => [] as Array<{ type: string; ts: string }>),
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

// ── workspace store 桩（重图隔离；武装/回收动作接线断言）──
const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [] as Array<{ id: string; title: string; status: string; priority: number | string | null }>,
    userTodos: [] as Array<{ id: string; title: string; date: string; remindAt?: number | null }>,
    loadTodos: vi.fn(),
    startReminderScheduler: vi.fn(),
    stopReminderScheduler: vi.fn(),
    initFleetStream: vi.fn(),
    stopFleetStream: vi.fn(),
    watchKanbanTasks: vi.fn(),
    unwatchKanbanTasks: vi.fn(),
    refreshAllBoards: vi.fn(async () => true),
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

// ── 新建向导弹窗桩（装配接线单独断言，不拉 wizard 表单链）──
vi.mock('@/custom/loop/components/LoopCreateWizard.vue', () => ({
  default: { name: 'WizardStub', emits: ['close', 'created'], template: '<div class="wizard-stub" />' },
}))

import LoopCockpitView from '../views/LoopCockpitView.vue'

const AREA = { template: '<div class="area-stub" />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/app',
        children: [
          { path: '', name: 'ia2.overview', component: AREA },
          { path: 'runs', name: 'ia2.runs', component: AREA },
          { path: 'runs/:runId', name: 'ia2.runDetail', component: AREA },
          { path: 'orchestrate', name: 'ia2.orchestrate', component: AREA },
          { path: 'inbox', name: 'ia2.inbox', component: AREA },
          { path: 'tasks', name: 'ia2.tasks', component: AREA },
          { path: 'comms', name: 'ia2.comms', component: AREA },
        ],
      },
    ],
  })
}

function makeLoopDto(id: string, status = 'idle'): Record<string, unknown> {
  return {
    id, name: `循环-${id}`, goal: '', stopCondition: '', pattern: 'daily-report',
    schedule: { type: 'cron', cron: '0 9 * * *' }, stage: 'discovery', status,
    autonomyLevel: 'level-2', stateAdapter: 'local',
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostTotal: 10 }, stats: { tasksCompleted: 0, tasksDiscovered: 0, totalCost: 0 },
  }
}

function makeRunDto(runId: string, graphId: string, status: string): Record<string, unknown> {
  return {
    runId, graphId, status, updatedAt: '2026-09-14T10:00:00Z',
    stage: null, iteration: 0, lastActivityAt: '2026-09-14T10:00:00Z',
    cost: 0, events: [], pendingInterruptId: null,
  }
}

async function mountView(path = '/app') {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const wrapper = mount(LoopCockpitView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  workspaceStubs.state.tasks = []
  workspaceStubs.state.userTodos = []
  runRest.listRuns.mockResolvedValue([])
  loopRest.listLoops.mockResolvedValue([])
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('LoopCockpitView — 单页装配', () => {
  it('骨架：页头/KPI×5/三栏（收件箱·生长舞台·循环面板）/图例；旧 IaNav 菜单栏不存在', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-testid="loop-cockpit"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('loopMind.title')
    expect(wrapper.findAll('.lcp-kpi')).toHaveLength(5)
    expect(wrapper.find('[data-testid="lcp-inbox-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lcp-stage"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lcp-loops-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="lcp-legend"]').exists()).toBe(true)
    // 去菜单守门：驾驶舱页内不渲染六区域导航栏
    expect(wrapper.find('.ia-nav').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('ia2.nav.overview')
    // 活大脑裁决守门：驾驶舱无人工编排/新建循环入口
    expect(wrapper.find('[data-testid="lcp-orchestrate"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="lcp-new-loop"]').exists()).toBe(false)
  })

  it('KPI 数字：运行中/待介入来自 runs 投影；活跃循环来自 loop store', async () => {
    runRest.listRuns.mockResolvedValue([
      makeRunDto('r1', 'l1', 'running'),
      makeRunDto('r2', 'l1', 'running'),
      makeRunDto('r3', 'l2', 'awaiting-input'),
    ] as never)
    loopRest.listLoops.mockResolvedValue([
      makeLoopDto('l1', 'running'), makeLoopDto('l2', 'idle'),
    ] as never)
    const { wrapper } = await mountView()
    const nums = wrapper.findAll('.lcp-kpi__num').map(n => n.text())
    expect(nums[0]).toBe('1')            // 活跃循环 / 总数 2
    expect(nums[1]).toBe('2')            // 运行中
    expect(nums[2]).toBe('1')            // 待介入
    expect(wrapper.text()).toContain('/ 2')
  })

  it('数据源武装与回收：挂载武装 workspace 聚合 + runs/loops 拉取；卸载停止', async () => {
    const { wrapper } = await mountView()
    expect(workspaceStubs.state.loadTodos).toHaveBeenCalled()
    expect(workspaceStubs.state.initFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.refreshAllBoards).toHaveBeenCalled()
    expect(runRest.listRuns).toHaveBeenCalled()
    expect(loopRest.listLoops).toHaveBeenCalled()
    wrapper.unmount()
    expect(workspaceStubs.state.stopFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.stopReminderScheduler).toHaveBeenCalled()
    expect(workspaceStubs.state.unwatchKanbanTasks).toHaveBeenCalled()
  })
})

describe('LoopCockpitView — 介入收件箱', () => {
  it('待决 run 渲染行（loop 名优先），点击 → ia2.runDetail；零待决渲染空态', async () => {
    runRest.listRuns.mockResolvedValue([
      makeRunDto('await-1', 'l1', 'awaiting-input'),
    ] as never)
    loopRest.listLoops.mockResolvedValue([makeLoopDto('l1')] as never)
    const { wrapper, router } = await mountView()
    const row = wrapper.find('.lcp-inbox-row')
    expect(row.text()).toContain('循环-l1')
    await row.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.runDetail')
    expect(router.currentRoute.value.params.runId).toBe('await-1')
  })

  it('空收件箱：空态文案，无"全部介入"入口', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('.lcp-inbox-row').exists()).toBe(false)
    expect(wrapper.text()).toContain('loopCockpit.inbox.empty')
    expect(wrapper.text()).not.toContain('loopCockpit.inbox.all')
  })
})

describe('LoopCockpitView — 思维大脑舞台', () => {
  it('SVG 渲染 + run 端点点击 → ia2.runDetail（数据驱动导航）', async () => {
    runRest.listRuns.mockResolvedValue([
      makeRunDto('grow-1', 'l1', 'running'),
    ] as never)
    loopRest.listLoops.mockResolvedValue([makeLoopDto('l1', 'running')] as never)
    const { wrapper, router } = await mountView()
    expect(wrapper.find('.lmv').exists()).toBe(true)
    const runNode = wrapper.find('.lmv__run')
    expect(runNode.exists()).toBe(true)
    await runNode.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.params.runId).toBe('grow-1')
  })

  it('零循环零 run：空态引导覆盖层（无编排 CTA——活大脑无需人工编排）；有数据即消失', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-testid="lcp-guide"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('ia2.nav.orchestrate')

    runRest.listRuns.mockResolvedValue([makeRunDto('r1', 'l1', 'completed')] as never)
    loopRest.listLoops.mockResolvedValue([makeLoopDto('l1')] as never)
    const { wrapper: withData } = await mountView()
    expect(withData.find('[data-testid="lcp-guide"]').exists()).toBe(false)
  })
})

describe('LoopCockpitView — 循环面板', () => {
  it('循环行点击 → /app/runs?loop=:id（与兼容守卫深链同构）', async () => {
    loopRest.listLoops.mockResolvedValue([makeLoopDto('l9')] as never)
    const { wrapper, router } = await mountView()
    await wrapper.find('.lcp-loop-row').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/runs')
    expect(router.currentRoute.value.query).toEqual({ loop: 'l9' })
  })

  it('行内动作接线：运行/暂停直调；删除先确认，取消则不发', async () => {
    loopRest.listLoops.mockResolvedValue([makeLoopDto('l1')] as never)
    const { wrapper } = await mountView()
    const buttons = wrapper.findAll('.lcp-loop-row__actions button')
    expect(buttons).toHaveLength(3)
    await buttons[0].trigger('click') // run
    expect(loopRest.tickLoop).toHaveBeenCalledWith('l1')
    await buttons[1].trigger('click') // pause
    expect(loopRest.pauseLoop).toHaveBeenCalledWith('l1')

    vi.mocked(window.confirm).mockReturnValue(false)
    await buttons[2].trigger('click') // delete（拒绝确认）
    expect(window.confirm).toHaveBeenCalled()
    expect(loopRest.deleteLoop).not.toHaveBeenCalled()
    vi.mocked(window.confirm).mockReturnValue(true)
    await buttons[2].trigger('click')
    expect(loopRest.deleteLoop).toHaveBeenCalledWith('l1')
  })

  it('零循环：右栏渲染空态文案（活大脑无新建循环向导）', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-testid="lcp-loops-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('loopMind.loops.empty')
  })
})

describe('LoopCockpitView — 页头动作区', () => {
  it('主按钮导航：查看运行中心（活大脑无编排/新建循环主按钮）', async () => {
    const { wrapper, router } = await mountView()
    expect(wrapper.find('[data-testid="lcp-orchestrate"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="lcp-new-loop"]').exists()).toBe(false)
    await wrapper.find('[data-testid="lcp-all-runs"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.runs')
  })

  it('溢出菜单收拢次要入口：介入/工作项/沟通/设置', async () => {
    const { wrapper, router } = await mountView()
    expect(wrapper.find('[data-testid="lcp-more-menu"]').exists()).toBe(false)
    await wrapper.find('[data-testid="lcp-more"]').trigger('click')
    const menu = wrapper.find('[data-testid="lcp-more-menu"]')
    expect(menu.exists()).toBe(true)
    expect(menu.findAll('.lcp-more__item')).toHaveLength(4)

    await wrapper.find('[data-testid="lcp-more-inbox"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.inbox')
    // 选择后菜单收起
    expect(wrapper.find('[data-testid="lcp-more-menu"]').exists()).toBe(false)
  })
})
