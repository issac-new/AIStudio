// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell.test.ts
// 驾驶舱统一壳守门（2026-09-19 v12 统一视图）：IaShell = IaShellHeader 全局页头
// + 双视图场景条（沟通协作 /app + IDE 工作台 /ide 直链）+ router-view。
// 断言：场景条双入口渲染、active 态跟随路由、共享武装序列（自旧驾驶舱壳
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

// 子组件桩化：页头（fetch 探测/重图依赖）与三个全局弹窗单独有守门，此间只验壳自身
vi.mock('@/custom/ia2/components/IaShellHeader.vue', () => ({
  default: { name: 'IaShellHeader', template: '<div class="ia-shell-header-stub" />' },
}))
vi.mock('@/custom/cockpit/components/CockpitNotifyModal.vue', () => ({
  default: { name: 'CockpitNotifyModal', template: '<div class="notify-modal-stub" />' },
}))
vi.mock('@/custom/cockpit/components/CockpitScheduleModal.vue', () => ({
  default: { name: 'CockpitScheduleModal', template: '<div class="schedule-modal-stub" />' },
}))
vi.mock('@/custom/cockpit/components/CockpitRunTraceModal.vue', () => ({
  default: { name: 'CockpitRunTraceModal', template: '<div class="runtrace-modal-stub" />' },
}))

import IaShell from '../views/IaShell.vue'
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
})

describe('IaShell — 统一壳（页头 + 双视图场景条）', () => {
  it('场景条渲染双入口（沟通协作 + IDE 工作台），全局页头在位', async () => {
    const { wrapper } = await mountShell('/app')
    expect(wrapper.find('[data-testid="ia-scenes"]').exists()).toBe(true)
    for (const area of IA_AREAS) {
      expect(wrapper.find(`[data-testid="ia-scene-${area.key}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="ia-scene-ide"]').exists()).toBe(true)
    expect(wrapper.find('.ia-shell-header-stub').exists()).toBe(true)
    expect(wrapper.find('.ia-shell__main').exists()).toBe(true)
  })

  it.each(IA_AREAS.map(a => [a.key, a.path]))('active 态跟随路由：%s 视图高亮', async (key, path) => {
    const { wrapper } = await mountShell(path as string)
    const btn = wrapper.find(`[data-testid="ia-scene-${key}"]`)
    expect(btn.classes()).toContain('ia-scenes__btn--on')
    // 其余入口不得高亮
    for (const other of IA_AREAS.filter(a => a.key !== key)) {
      expect(wrapper.find(`[data-testid="ia-scene-${other.key}"]`).classes()).not.toContain('ia-scenes__btn--on')
    }
  })

  it('工作页路由切换时场景条保持 collab 高亮（board → runs）', async () => {
    const { wrapper, router } = await mountShell('/app/board')
    expect(wrapper.find('[data-testid="ia-scene-collab"]').classes()).toContain('ia-scenes__btn--on')
    await router.push('/app/runs')
    await flushPromises()
    expect(wrapper.find('[data-testid="ia-scene-collab"]').classes()).toContain('ia-scenes__btn--on')
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

  it('最大化态（max=1）：壳页头/场景条隐藏，浮动还原胶囊在位；Esc 退出', async () => {
    const { wrapper } = await mountShell('/app?max=1')
    expect(wrapper.find('[data-testid="ia-scenes"]').exists()).toBe(false)
    expect(wrapper.find('.ia-shell-header-stub').exists()).toBe(false)
    const pill = wrapper.find('[data-testid="ia-wm-restore-pill"]')
    expect(pill.exists()).toBe(true)
    await pill.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="ia-scenes"]').exists()).toBe(true)
    // 再最大化后用 Esc 还原
    const wrapper2 = (await mountShell('/app?max=1')).wrapper
    expect(wrapper2.find('[data-testid="ia-scenes"]').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper2.find('[data-testid="ia-scenes"]').exists()).toBe(true)
  })

  it('最小化任务栏：入列渲染 chip，点击恢复导航并出列', async () => {
    const { wrapper, router } = await mountShell('/app')
    const { useWmStore } = await import('../wm/store')
    useWmStore().minimize('/app/runs?tab=runs')
    await flushPromises()
    const chip = wrapper.find('[data-testid="ia-wm-dock-chip"]')
    expect(chip.exists()).toBe(true)
    await chip.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/app/runs?tab=runs')
    expect(useWmStore().minimized).toHaveLength(0)
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
