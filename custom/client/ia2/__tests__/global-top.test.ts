// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/global-top.test.ts
// v12.2 全局顶区守门（2026-09-20 用户裁定）：页头+注意力条；视图切换器
// （沟通协作 | IDE 工作台）移入页头最右（IaShellHeader 内嵌），本组件不再含
// 切换行。切换器高亮自算（/ide → ide，/app 家族 → collab）；注意力条与右栏「等我」同源。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const workspaceStubs = vi.hoisted(() => ({
  state: {
    tasks: [] as Array<{ id: string; title: string; status: string; assignee: string | null; createdAt: number }>,
    loadTodos: vi.fn(), startReminderScheduler: vi.fn(), watchKanbanTasks: vi.fn(),
    initFleetStream: vi.fn(), refreshAllBoards: vi.fn(async () => true),
    unwatchKanbanTasks: vi.fn(), stopFleetStream: vi.fn(), stopReminderScheduler: vi.fn(),
  },
  useWorkspaceStore: () => workspaceStubs.state,
}))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

const cockpitStubs = vi.hoisted(() => ({
  state: {
    inboxCount: 0, currentUserName: 'tester', fleetSessions: [] as unknown[],
    bootstrap: vi.fn(async () => {}), disconnectOnUnmount: vi.fn(),
  },
  useCockpitStore: () => cockpitStubs.state,
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: cockpitStubs.useCockpitStore }))

const runsStubs = vi.hoisted(() => ({
  state: { runs: [] as unknown[], sortedRuns: [], awaitingRuns: [], syncVisibleRunIds: vi.fn(), fetchRuns: vi.fn(async () => {}), fetchMetrics: vi.fn(async () => null) },
  useRunCenterStore: () => runsStubs.state,
}))
vi.mock('@/custom/loop/runcenter/store/runs', () => ({ useRunCenterStore: runsStubs.useRunCenterStore }))
vi.mock('@/custom/loop/store/loop', () => ({ useLoopStore: () => ({ loops: [], fetchLoops: vi.fn(async () => {}) }) }))

vi.mock('../components/IaShellHeader.vue', () => ({
  default: { name: 'IaShellHeader', props: ['notifyCount', 'userName'], emits: ['notify'], template: '<div class="hdr-stub" />' },
}))
vi.mock('../components/AttentionStrip.vue', () => ({
  default: { name: 'AttentionStrip', props: ['items'], emits: ['select'], template: '<div class="attn-stub" v-if="items.length" />' },
}))

import IaGlobalTop from '../components/IaGlobalTop.vue'
import IaViewSwitcher from '../components/IaViewSwitcher.vue'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'ia2.collab', component: { template: '<div />' } },
      { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
      { path: '/ide', name: 'ide.shell', component: { template: '<div />' } },
    ],
  })
}

async function mountAt(path: string, component: unknown = IaGlobalTop) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const wrapper = mount(component as never, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  workspaceStubs.state.tasks = []
})

describe('IaViewSwitcher — 右上角视图切换器', () => {
  it('/app 家族 → 沟通协作高亮；/ide → IDE 高亮（自算，双入口 router-link）', async () => {
    const { wrapper } = await mountAt('/app', IaViewSwitcher)
    expect(wrapper.find('[data-testid="ia-scene-collab"]').classes()).toContain('ia-scenes__btn--on')
    expect(wrapper.find('[data-testid="ia-scene-ide"]').classes()).not.toContain('ia-scenes__btn--on')
    const { wrapper: w2 } = await mountAt('/ide', IaViewSwitcher)
    expect(w2.find('[data-testid="ia-scene-ide"]').classes()).toContain('ia-scenes__btn--on')
    expect(w2.find('[data-testid="ia-scene-collab"]').classes()).not.toContain('ia-scenes__btn--on')
    const { wrapper: w3 } = await mountAt('/app/board', IaViewSwitcher)
    expect(w3.find('[data-testid="ia-scene-collab"]').classes()).toContain('ia-scenes__btn--on')
  })
})

describe('IaGlobalTop — 全局顶区（双视图常驻）', () => {
  it('页头+切换器渲染；武装经 useSharedArm 引用计数执行', async () => {
    const { wrapper } = await mountAt('/app')
    expect(wrapper.find('.hdr-stub').exists()).toBe(true)
    // v12.2：切换器已移入页头（IaShellHeader），全局顶区不再含切换行
    expect(wrapper.find('[data-testid="ia-viewswitch-row"]').exists()).toBe(false)
    expect(workspaceStubs.state.loadTodos).toHaveBeenCalled()
    expect(cockpitStubs.state.bootstrap).toHaveBeenCalled()
    wrapper.unmount()
    expect(cockpitStubs.state.disconnectOnUnmount).toHaveBeenCalled()
  })

  it('有 review 任务时注意力条渲染（等我同源）；无事项时不渲染', async () => {
    workspaceStubs.state.tasks = [{ id: 't-1', title: '验收 v2.30', status: 'review', assignee: null, createdAt: 1 }]
    const { wrapper } = await mountAt('/app')
    expect(wrapper.find('.attn-stub').exists()).toBe(true)
    wrapper.unmount()
    workspaceStubs.state.tasks = []
    const { wrapper: w2 } = await mountAt('/app')
    expect(w2.find('.attn-stub').exists()).toBe(false)
  })

  it('通知事件透传 emit notify', async () => {
    const { wrapper } = await mountAt('/app')
    wrapper.findComponent({ name: 'IaShellHeader' }).vm.$emit('notify')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('notify')).toHaveLength(1)
  })
})
