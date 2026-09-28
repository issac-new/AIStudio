// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/global-top.test.ts
// v12.4 全局顶区守门（2026-09-20 用户裁定）：页头+注意力条；视图切换器
// 单按钮（显示目标视图，双按钮退役）；注意力条标签改 swarm kanban（双击进
// 看板总览，右侧 ⚙管理退役）。切换器高亮自算（/ide → ide，/app 家族 → collab）；
// 注意力条与右栏「等我」同源。
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
  default: { name: 'IaShellHeader', props: ['userName'], template: '<div class="hdr-stub" />' },
}))
// v12.3 R2：空态不消失（条常驻）——桩去 v-if、暴露 data-count 验数据流；
// v12.4：emits 收窄（open-gov → open-board）；v12.6 误加 close 已撤回（看板页
// 关闭钮与注意力条无关，用户澄清后回退）
vi.mock('../components/AttentionStrip.vue', () => ({
  default: {
    name: 'AttentionStrip',
    props: ['items'],
    emits: ['select', 'open-board'],
    template: '<div class="attn-stub" :data-count="items.length" />',
  },
}))
// 态势计数单一聚合（v12.3）：经其拉 chat/matrix/team 上游链，此处桩化为空态
vi.mock('@/custom/ia2/composables/useSitCounts', () => ({
  useSitCounts: () => ({
    waitItems: { value: [] },
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

describe('IaViewSwitcher — 右上角视图切换器（v12.4 单按钮）', () => {
  it('/app 家族 → 显示目标视图 IDE 工作台，点击跳 ide.shell（双按钮退役）', async () => {
    const { wrapper } = await mountAt('/app', IaViewSwitcher)
    const btn = wrapper.find('[data-testid="ia-view-toggle"]')
    expect(btn.exists()).toBe(true)
    expect(wrapper.find('[data-testid="ia-scene-collab"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ia-scene-ide"]').exists()).toBe(false)
    expect(btn.text()).toContain('ia2.shell.gotoIde')
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.name).toBe('ide.shell')
    wrapper.unmount()
  })

  it('/ide → 显示目标视图沟通协作，点击跳 ia2.collab', async () => {
    const { wrapper } = await mountAt('/ide', IaViewSwitcher)
    const btn = wrapper.find('[data-testid="ia-view-toggle"]')
    expect(btn.text()).toContain('ia2.nav.collab')
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.vm.$router.currentRoute.value.name).toBe('ia2.collab')
    wrapper.unmount()
  })

  it('/app/board 家族也算 collab 态（显示 IDE 工作台目标）', async () => {
    const { wrapper } = await mountAt('/app/board', IaViewSwitcher)
    expect(wrapper.find('[data-testid="ia-view-toggle"]').text()).toContain('ia2.shell.gotoIde')
    wrapper.unmount()
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

  it('blocked 任务进注意力条（blocked 梯队）；空态条不消失（R2 管理入口常驻）', async () => {
    workspaceStubs.state.tasks = [{ id: 't-1', title: '等外部凭据', status: 'blocked', assignee: null, createdAt: 1 }]
    const { wrapper } = await mountAt('/app')
    expect(wrapper.find('.attn-stub').exists()).toBe(true)
    expect(wrapper.find('.attn-stub').attributes('data-count')).toBe('1')
    wrapper.unmount()
    workspaceStubs.state.tasks = []
    const { wrapper: w2 } = await mountAt('/app')
    expect(w2.find('.attn-stub').exists()).toBe(true)
    expect(w2.find('.attn-stub').attributes('data-count')).toBe('0')
  })
})
