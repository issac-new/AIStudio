// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell.test.ts
// 驾驶舱统一壳守门（2026-09-20 v12.2）：IaShell = IaGlobalTop（IaShellHeader
// 页头 + 注意力条）+ router-view。视图切换器（沟通协作 | IDE 工作台）v12.2 起
// 内嵌页头最右（IaShellHeader → IaViewSwitcher），壳层不再渲染独立场景条——
// 切换器高亮语义守门移 global-top.test/ia-shell-header.test。本文件断言：
// 壳结构、共享武装序列（自旧驾驶舱壳
// 上移）、卸载时 workspace/cockpit 双侧回收。
// 挂载以根 <router-view/> 复刻 App.vue 深度；子组件（页头/弹窗）桩化隔离重图。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// workspace store 桩：壳级武装/回收动作断言（loadTodos/startReminderScheduler/
// watchKanbanTasks/initFleetStream 挂载武装 + unwatch/stop 卸载回收）
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
    scheduleOpen: false,
    closeSchedule: vi.fn(),
    // 注意力条数据源（空数组=不渲染条）
    tasks: [] as Array<{ id: string; title: string; status: string; assignee: string | null; createdAt: number }>,
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

// cockpit store 桩：壳级 bootstrap/disconnect + 页头/弹窗状态供给
const cockpitStubs = vi.hoisted(() => {
  const state = {
    bootstrap: vi.fn(async () => {}),
    disconnectOnUnmount: vi.fn(),
    inboxCount: 0,
    currentUserName: 'tester',
    notifyOpen: false,
    openNotify: vi.fn(),
    closeNotify: vi.fn(),
    runTraceOpen: false,
    closeRunTrace: vi.fn(),
    fleetSessions: [] as unknown[],
  }
  return { state, useCockpitStore: () => state }
})
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))

// runcenter/loop store 桩：bootShared 序列断言（fetchRuns → syncVisibleRunIds →
// fetchMetrics + fetchLoops）
const runsStubs = vi.hoisted(() => {
  const state = {
    fetchRuns: vi.fn(async () => {}),
    awaitingRuns: [{ runId: 'r-await' }],
    sortedRuns: [{ runId: 'r-await', status: 'awaiting-input' }, { runId: 'r-run', status: 'running' }],
    runs: [] as unknown[],
    syncVisibleRunIds: vi.fn(),
    fetchMetrics: vi.fn(async () => null),
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

// 态势计数单一聚合（v12.3）：IaGlobalTop/页头经其拉 chat/matrix/team 上游链，
// 壳测试只验壳自身——桩化；waitItems 暴露 getter 供「等我→看板预选」用例注入
const sitStubs = vi.hoisted(() => ({ waitItems: [] as unknown[] }))
vi.mock('@/custom/ia2/composables/useSitCounts', () => ({
  useSitCounts: () => ({
    waitItems: { get value() { return sitStubs.waitItems } },
    tasks: { total: 0, running: 0, review: 0 },
    sessionCount: { value: 0 },
    loopTotal: { value: 0 },
    loopBlocked: { value: 0 },
    loopRows: { value: [] },
    accounts: { value: [] },
    online: { people: 0, agents: 0, machines: 0 },
    oldestWaitLabel: { value: '' },
  }),
}))

// 子组件桩化：页头（fetch 探测/重图依赖）与三个全局弹窗单独有守门，此间只验壳自身
vi.mock('@/custom/ia2/components/IaShellHeader.vue', () => ({
  default: { name: 'IaShellHeader', template: '<div class="ia-shell-header-stub" />' },
}))
vi.mock('@/custom/cockpit/components/CockpitScheduleModal.vue', () => ({
  default: { name: 'CockpitScheduleModal', template: '<div class="schedule-modal-stub" />' },
}))
vi.mock('@/custom/cockpit/components/CockpitRunTraceModal.vue', () => ({
  default: { name: 'CockpitRunTraceModal', template: '<div class="runtrace-modal-stub" />' },
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
// 注意力条单独有守门；此间桩化隔离（其数据源与壳同构）。
// v12.3 R2：空态不消失（条即管理入口）——桩去掉 v-if 并补 open-gov 事件
vi.mock('@/custom/ia2/components/AttentionStrip.vue', () => ({
  default: {
    name: 'AttentionStrip',
    props: ['items'],
    emits: ['select', 'open-gov'],
    template: '<div class="attn-stub" data-testid="ia-attn" @click="items.length && $emit(\'select\', items[0])"><button class="attn-gov-stub" @click.stop="$emit(\'open-gov\')" /></div>',
  },
}))

import IaShell from '../views/IaShell.vue'
import { useFlowStore } from '../store/flow'
import { __resetSharedArmForTest } from '../composables/useSharedArm'
import { IA_AREAS } from '../routes'

const AREA = { template: '<div class="area-stub" />' }
const APP = { template: '<router-view />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/app',
        component: IaShell,
        children: [
          // 场景条循环渲染 IA_AREAS（v12 单视图 collab）
          ...IA_AREAS.map(a => ({
            path: a.path === '/app' ? '' : a.path.replace('/app/', ''),
            name: a.name,
            component: AREA,
          })),
          // 测试用到的工作页路径
          { path: 'board', name: 'ia2.board', component: AREA },
          { path: 'eng', name: 'ia2.eng', component: AREA },
          { path: 'runs', name: 'ia2.runs', component: AREA },
        ],
      },
      // v12 双视图第二入口（场景条 IDE 直链的目标）
      { path: '/ide', name: 'ide.shell', component: AREA },
    ],
  })
}

async function mountShell(path: string) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const wrapper = mount(APP, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  // 武装引用计数是模块级状态：跨用例复位，保证「共享武装」断言每次可验
  __resetSharedArmForTest()
})

describe('IaShell — 统一壳（页头 + 双视图场景条）', () => {
  it('全局页头在位；切换器随页头内嵌（壳层无独立场景条，v12.2）', async () => {
    const { wrapper } = await mountShell('/app')
    expect(wrapper.find('.ia-shell-header-stub').exists()).toBe(true)
    expect(wrapper.find('.ia-shell__main').exists()).toBe(true)
    // 切换器已移入 IaShellHeader（本测试页头为桩）——壳层不得再渲染场景条
    expect(wrapper.find('[data-testid="ia-scenes"]').exists()).toBe(false)
  })

  it('共享武装（自旧驾驶舱壳上移）：onMounted 调 workspace 四件套 + cockpit.bootstrap', async () => {
    const { wrapper } = await mountShell('/app')
    expect(workspaceStubs.state.loadTodos).toHaveBeenCalled()
    expect(workspaceStubs.state.startReminderScheduler).toHaveBeenCalled()
    expect(workspaceStubs.state.watchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.initFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.refreshAllBoards).toHaveBeenCalled()
    expect(cockpitStubs.state.bootstrap).toHaveBeenCalled()
    // bootShared：fetchRuns 后按 awaiting+running 订阅（SUBSCRIBE_CAP=30 内）
    expect(runsStubs.state.fetchRuns).toHaveBeenCalled()
    expect(runsStubs.state.syncVisibleRunIds).toHaveBeenCalledWith(['r-await', 'r-run'])
    expect(runsStubs.state.fetchMetrics).toHaveBeenCalled()
    expect(loopStubs.state.fetchLoops).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('卸载回收：workspace 三停 + cockpit.disconnectOnUnmount', async () => {
    const { wrapper } = await mountShell('/app/runs')
    wrapper.unmount()
    expect(workspaceStubs.state.unwatchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.stopFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.stopReminderScheduler).toHaveBeenCalled()
    expect(cockpitStubs.state.disconnectOnUnmount).toHaveBeenCalled()
  })
})

describe('IaShell — 窗口管理三态（/goal 追加）', () => {
  it('独立窗口态（standalone=1）：精简页头在位，壳页头/场景条/dock 全隐', async () => {
    const { wrapper } = await mountShell('/app?standalone=1')
    expect(wrapper.find('[data-testid="ia-popout-bar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-scenes"]').exists()).toBe(false)
    expect(wrapper.find('.ia-shell-header-stub').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ia-wm-dock"]').exists()).toBe(false)
    expect(wrapper.find('.ia-shell__main').exists()).toBe(true)
  })

  it('独立窗口内跳转保持 standalone 标记（query 不随路由传播，壳自动补回）', async () => {
    const { router } = await mountShell('/app?standalone=1')
    await router.push('/app/runs')
    await flushPromises()
    expect(router.currentRoute.value.query.standalone).toBe('1')
  })

  it('v12.3 窗控改栏控：max=1 页级最大化退役——max query 不再隐藏壳页头，无还原胶囊', async () => {
    const { wrapper } = await mountShell('/app?max=1')
    expect(wrapper.find('.ia-shell-header-stub').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-wm-restore-pill"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ia-wm-dock"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('合并回流：独立窗口 storage 信号驱动主窗导航', async () => {
    const { router } = await mountShell('/app')
    localStorage.setItem(
      'swarmstudio:wm-merge-back',
      JSON.stringify({ path: '/app/board', at: Date.now() }),
    )
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'swarmstudio:wm-merge-back',
      newValue: JSON.stringify({ path: '/app/board', at: Date.now() }),
    }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/board')
  })

  it('合并回流不劫持其它独立面板：standalone 窗不响应 merge-back 信号', async () => {
    // storage 事件广播到所有同源窗口；若 standalone 面板窗也响应，别的面板
    // 「合并回驾驶舱」会把本面板导航走并被 standalone 补标 watch 劫持内容
    const { router } = await mountShell('/app/runs?standalone=1')
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'swarmstudio:wm-merge-back',
      newValue: JSON.stringify({ path: '/app/board', at: Date.now() }),
    }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/app/runs')
  })
})

describe('IaShell — 注意力条与⚙管理台（v12 Task 8）', () => {
  it('有等我事项时注意力条在位（空态也在——R2 管理入口常驻）；点击 → 看板预选', async () => {
    sitStubs.waitItems = [{ id: 'w-1', kind: 'task-review', title: '验收 v2.28', subKey: 'ia2.wait.taskReview', ts: 1, taskId: 't-1' }]
    const { wrapper, router } = await mountShell('/app')
    const attn = wrapper.find('[data-testid="ia-attn"]')
    expect(attn.exists()).toBe(true)
    await attn.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.board')
    expect(router.currentRoute.value.query.task).toBe('t-1')
    sitStubs.waitItems = []
  })

  it('Esc 收管理台覆盖层（v12.3 max=1 退役：Esc 不再退页级最大化）', async () => {
    const { wrapper } = await mountShell('/app')
    const flow = useFlowStore()
    flow.openGov()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(flow.govOpen).toBe(false)
    // 壳页头常驻（无页级最大化可退）
    expect(wrapper.find('.ia-shell-header-stub').exists()).toBe(true)
  })
})
