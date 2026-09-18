// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell.test.ts
// 驾驶舱统一壳守门（2026-09-18 统一导航重构 Task 2，替代 slim 子页头守门）：
// IaShell = IaShellHeader 全局页头 + 六场景条 + router-view。
// 断言：场景条六入口渲染、active 态跟随路由、共享武装序列（自旧驾驶舱壳
// 上移，Task 1 评审指出的覆盖缺口）、卸载时 workspace/cockpit 双侧回收。
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
        children: IA_AREAS.map(a => ({
          path: a.path === '/app' ? '' : a.path.replace('/app/', ''),
          name: a.name,
          component: AREA,
        })),
      },
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

describe('IaShell — 统一壳（页头 + 六场景条）', () => {
  it('场景条渲染六入口（data-testid=ia-scene-<key>），全局页头在位', async () => {
    const { wrapper } = await mountShell('/app')
    expect(wrapper.find('[data-testid="ia-scenes"]').exists()).toBe(true)
    for (const area of IA_AREAS) {
      expect(wrapper.find(`[data-testid="ia-scene-${area.key}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('.ia-shell-header-stub').exists()).toBe(true)
    expect(wrapper.find('.ia-shell__main').exists()).toBe(true)
  })

  it.each(IA_AREAS.map(a => [a.key, a.path]))('active 态跟随路由：%s 区高亮', async (key, path) => {
    const { wrapper } = await mountShell(path as string)
    const btn = wrapper.find(`[data-testid="ia-scene-${key}"]`)
    expect(btn.classes()).toContain('ia-scenes__btn--on')
    // 其余入口不得高亮
    for (const other of IA_AREAS.filter(a => a.key !== key)) {
      expect(wrapper.find(`[data-testid="ia-scene-${other.key}"]`).classes()).not.toContain('ia-scenes__btn--on')
    }
  })

  it('路由切换时 active 态迁移（/app/ops → /app/eng）', async () => {
    const { wrapper, router } = await mountShell('/app/ops')
    expect(wrapper.find('[data-testid="ia-scene-ops"]').classes()).toContain('ia-scenes__btn--on')
    await router.push('/app/eng')
    await flushPromises()
    expect(wrapper.find('[data-testid="ia-scene-eng"]').classes()).toContain('ia-scenes__btn--on')
    expect(wrapper.find('[data-testid="ia-scene-ops"]').classes()).not.toContain('ia-scenes__btn--on')
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
    const { wrapper } = await mountShell('/app/ops')
    wrapper.unmount()
    expect(workspaceStubs.state.unwatchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.stopFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.stopReminderScheduler).toHaveBeenCalled()
    expect(cockpitStubs.state.disconnectOnUnmount).toHaveBeenCalled()
  })
})
