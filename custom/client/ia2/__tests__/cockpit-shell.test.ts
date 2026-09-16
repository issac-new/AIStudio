// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/cockpit-shell.test.ts
// 驾驶舱壳守门（2026-09-16 多视图重构）：页头 + 场景切换条 + 共享武装/回收。
// 场景主体行为断言在 overview-scene.test.ts 等场景测试；此处场景组件全桩化。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// ── REST 桩（与 overview-scene.test.ts 同一形状） ──
const { runRest, loopRest } = vi.hoisted(() => ({
  runRest: {
    listRuns: vi.fn(async () => [] as Array<Record<string, unknown>>),
    replay: vi.fn(async () => []),
    getRun: vi.fn(async () => { throw new Error('not used') }),
    resumeRun: vi.fn(async () => ({ runId: 'x', instance: {} })),
    forkRun: vi.fn(async () => ({ runId: 'f', forkedFrom: 'x', superStep: 0 })),
    startRun: vi.fn(async () => ({ runId: 'f', instance: {} })),
    exportRun: vi.fn(async () => ({ run: {}, spec: null, events: [] })),
    getSpec: vi.fn(async () => null),
    getMind: vi.fn(async () => ({ thoughts: [], runs: [], available: true })),
  },
  loopRest: {
    listLoops: vi.fn(async () => [] as Array<Record<string, unknown>>),
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

const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [] as Array<Record<string, unknown>>,
    userTodos: [] as Array<Record<string, unknown>>,
    scheduleOpen: false,
    loadTodos: vi.fn(),
    startReminderScheduler: vi.fn(),
    stopReminderScheduler: vi.fn(),
    initFleetStream: vi.fn(),
    stopFleetStream: vi.fn(),
    watchKanbanTasks: vi.fn(),
    unwatchKanbanTasks: vi.fn(),
    onBoardEvent: vi.fn(() => () => {}),
    refreshAllBoards: vi.fn(async () => true),
    openSchedule: vi.fn(),
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

// 四场景桩（壳测试不加载场景实现）
const SCENE_STUB = { template: '<div class="scene-stub" />' }
vi.mock('../views/scenes/OverviewScene.vue', () => ({ default: SCENE_STUB }))
vi.mock('../views/scenes/ManageScene.vue', () => ({ default: SCENE_STUB }))
vi.mock('../views/scenes/CodeScene.vue', () => ({ default: SCENE_STUB }))
vi.mock('../views/scenes/OpsScene.vue', () => ({ default: SCENE_STUB }))

import LoopCockpitView from '../views/LoopCockpitView.vue'
import { buildSceneChildren, IA2_SCENE_NAMES, LOOP_SCENE_NAMES } from '../routes'

function makeRouter(loopFamily = false): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{
      path: '/',
      children: buildSceneChildren(loopFamily ? LOOP_SCENE_NAMES : IA2_SCENE_NAMES),
    }],
  })
}

async function mountShell(path = '/', loopFamily = false) {
  const router = makeRouter(loopFamily)
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
})

describe('LoopCockpitView 壳 — 页头与动作区', () => {
  it('页头：主按钮以 ia2.runs 路由名导航 + 溢出菜单四入口', async () => {
    const { wrapper, router } = await mountShell()
    // 路由表只挂了场景子路由，ia2.runs 未注册——mock 掉真实跳转，只断言导航参数
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined)
    await wrapper.find('[data-testid="lcp-all-runs"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ia2.runs' })
    expect(wrapper.find('[data-testid="lcp-more"]').exists()).toBe(true)
  })

  it('溢出菜单收拢次要入口：介入/工作项/沟通/设置', async () => {
    const { wrapper } = await mountShell()
    expect(wrapper.find('[data-testid="lcp-more-menu"]').exists()).toBe(false)
    await wrapper.find('[data-testid="lcp-more"]').trigger('click')
    for (const key of ['inbox', 'tasks', 'comms', 'settings']) {
      expect(wrapper.find(`[data-testid="lcp-more-${key}"]`).exists()).toBe(true)
    }
  })
})

describe('LoopCockpitView 壳 — 场景切换条', () => {
  it('四场景入口渲染；默认总览高亮；点击切 manage', async () => {
    const { wrapper, router } = await mountShell('/')
    for (const key of ['overview', 'manage', 'code', 'ops']) {
      expect(wrapper.find(`[data-testid="lcp-scene-${key}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="lcp-scene-overview"].lcp-scenes__btn--on').exists()).toBe(true)
    await wrapper.find('[data-testid="lcp-scene-manage"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.manage')
    expect(wrapper.find('[data-testid="lcp-scene-manage"].lcp-scenes__btn--on').exists()).toBe(true)
  })

  it('hermes.loop 家族：切换条在家族内跳转（不跨挂载点）', async () => {
    const { wrapper, router } = await mountShell('/ops', true)
    expect(router.currentRoute.value.name).toBe('hermes.loopOps')
    await wrapper.find('[data-testid="lcp-scene-code"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('hermes.loopCode')
  })
})

describe('LoopCockpitView 壳 — 共享武装与回收', () => {
  it('挂载武装 workspace 流 + runs/loops 拉取；卸载停止', async () => {
    const { wrapper } = await mountShell()
    expect(workspaceStubs.state.loadTodos).toHaveBeenCalled()
    expect(workspaceStubs.state.startReminderScheduler).toHaveBeenCalled()
    expect(workspaceStubs.state.watchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.initFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.refreshAllBoards).toHaveBeenCalled()
    expect(runRest.listRuns).toHaveBeenCalled()
    expect(loopRest.listLoops).toHaveBeenCalled()
    wrapper.unmount()
    expect(workspaceStubs.state.unwatchKanbanTasks).toHaveBeenCalled()
    expect(workspaceStubs.state.stopFleetStream).toHaveBeenCalled()
    expect(workspaceStubs.state.stopReminderScheduler).toHaveBeenCalled()
  })
})
