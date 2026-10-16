// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-views.test.ts
// 视图壳冒烟（2026-09-19 v12 统一视图改写）：TasksView 内嵌 SwarmKanban（/app/board
// 工作页）；WorkbenchView 三栏骨架在位（Task 4 起填充左中右）。
// 重组件（kanban/matrix-chat）一律 vi.mock 成桩，只验证"壳→内嵌"接线。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const { swarmKanbanMounted } = vi.hoisted(() => ({
  swarmKanbanMounted: { count: 0 },
}))

// 治理分区平级化（2026-10-01 单层页签重构）：GovernanceView 退役，五拆件打桩
vi.mock('@/custom/ia2/views/gov/GovHealthSection.vue', () => ({
  default: { template: '<div class="gov-health-stub" data-testid="gov-health-stub" />' },
}))
vi.mock('@/custom/ia2/views/gov/GovOrgKnowledgeView.vue', () => ({
  default: { template: '<div class="gov-stub" data-testid="gov-org-stub">gov-org</div>' },
}))
vi.mock('@/custom/ia2/views/gov/GovRegistryRulesView.vue', () => ({
  default: { template: '<div data-testid="gov-registry-stub">gov-registry</div>' },
}))
vi.mock('@/custom/ia2/views/gov/GovAuditChangeView.vue', () => ({
  default: { template: '<div data-testid="gov-audit-stub">gov-audit</div>' },
}))
vi.mock('@/custom/ia2/views/gov/GovDocsReviewView.vue', () => ({
  default: { template: '<div data-testid="gov-docs-stub">gov-docs</div>' },
}))
// 驾驭工程页签（2026-10-02 信通院报告产品化）：能力目录/成本账/成熟度/原语四板块聚合
vi.mock('@/custom/ia2/views/gov/GovHarnessView.vue', () => ({
  default: { template: '<div data-testid="gov-harness-stub">gov-harness</div>' },
}))
vi.mock('@/custom/kanban/components/ManagementAccountsPanel.vue', () => ({
  default: { template: '<div data-testid="ma-stub">accounts</div>' },
}))
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { setup: () => { swarmKanbanMounted.count += 1 }, template: '<div class="kanban-stub" />' },
}))
vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({
  default: { name: 'KanbanTaskDrawer', props: ['show', 'taskId'], template: '<div class="drawer-stub" v-if="show" />' },
}))
vi.mock('@/custom/matrix-chat/components/MatrixRoomCanvas.vue', () => ({
  default: { name: 'MatrixRoomCanvas', template: '<div class="room-canvas-stub" />' },
}))
vi.mock('@/views/hermes/ChatView.vue', () => ({
  default: { name: 'ChatView', template: '<div class="chat-view-stub" />' },
}))

import TasksView from '../views/TasksView.vue'
import WorkbenchView from '../views/WorkbenchView.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  swarmKanbanMounted.count = 0
})

describe('视图壳内嵌接线', () => {
  it('TasksView 内嵌 SwarmKanbanView（/app/board 工作页，需路由上下文）', async () => {
    // TasksView 读 route.query 做筛选预选——挂最小路由（/app/board 落点）
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/board', name: 'ia2.board', component: TasksView }],
    })
    await router.push('/app/board')
    await router.isReady()
    const wrapper = mount(TasksView, { global: { plugins: [router] } })
    expect(wrapper.find('.kanban-stub').exists()).toBe(true)
    expect(swarmKanbanMounted.count).toBe(1)
  })

  it('A0 三中心拆分：board 3 键注册表 + 迁出 10 键深链重定向不 404 + 未知 tab 回落看板', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app', name: 'ia2.collab', component: { template: '<div collab />' } },
        { path: '/app/board', name: 'ia2.board', component: TasksView },
        // 迁出签落点桩（真实落点=推演中心六签/治理中心；此处只断言重定向导航）
        { path: '/app/sim', name: 'ia2.sim', component: { template: '<div sim />' } },
        { path: '/app/sim/trace', name: 'ia2.simTrace', component: { template: '<div sim-trace />' } },
        { path: '/app/sim/delivery', name: 'ia2.simDelivery', component: { template: '<div sim-delivery />' } },
        { path: '/app/sim/ops', name: 'ia2.simOps', component: { template: '<div sim-ops />' } },
        { path: '/app/gov', name: 'ia2.governance', component: { template: '<div gov />' } },
      ],
    })
    await router.push('/app/board')
    await router.isReady()
    const wrapper = mount(TasksView, { global: { plugins: [router] } })
    // 单层纪律（A0 后）：恰 3 个平级页签（看板/任务协同/协作与知识），无二级页签行
    const tabs = wrapper.findAll('.ia-tasks__tab')
    expect(tabs).toHaveLength(3)
    expect(wrapper.findAll('[role="tab"]').length).toBe(3)
    expect(tabs.map(x => x.text())).toEqual(['看板', '任务协同', '协作与知识'])
    // 工作台治理签：点击=页内切换（URL 不变 + 内嵌渲染 + 页签仍在）
    const govOrgTab = wrapper.find('[data-testid="ia-tasks-tab-gov-org"]')
    expect(govOrgTab.exists()).toBe(true)
    await govOrgTab.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="gov-org-stub"]').exists()).toBe(true)
    expect(router.currentRoute.value.name).toBe('ia2.board')
    expect(wrapper.find('[data-testid="ia-tasks-tab-gov-org"]').exists()).toBe(true)
    // 旧深链 ?tab=gov 别名 → 工作台治理签（外部链接不死链）
    await router.push('/app/board?tab=gov')
    await flushPromises()
    expect(wrapper.find('[data-testid="gov-org-stub"]').exists()).toBe(true)
    // A0 迁出 10 键深链重定向：3 键落推演中心签，7 键落治理中心（抽全表正反例
    // 逐键断言在 workbench-nav-centers.test.ts 的 legacyTabRedirect 纯函数用例）
    await router.push('/app/board?tab=trace')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.simTrace')
    await router.push('/app/board?tab=accounts')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.simDelivery')
    await router.push('/app/board?tab=observatory')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.simOps')
    for (const key of ['gov-registry', 'gov-audit', 'gov-docs', 'gov-harness', 'gov-cluster', 'gov-ontology', 'gov-session-health']) {
      await router.push(`/app/board?tab=${key}`)
      await flushPromises()
      expect(router.currentRoute.value.name, key).toBe('ia2.governance')
    }
    // 未知 tab 值回落看板（A0 裁定：迁出签位已消失，不再静默保留旧位置）
    await router.push('/app/board?tab=weird')
    await flushPromises()
    expect(wrapper.find('.kanban-stub').exists()).toBe(true)
    wrapper.unmount()
  })

  it('v12.6 看板页右上角关闭钮（用户裁定：打开的 swarm kanban 页可关）→ 回沟通协作工作台', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/app', name: 'ia2.collab', component: { template: '<div />' } },
        { path: '/app/board', name: 'ia2.board', component: TasksView },
      ],
    })
    await router.push('/app/board')
    await router.isReady()
    const wrapper = mount(TasksView, { global: { plugins: [router] } })
    const close = wrapper.find('[data-testid="ia-board-close"]')
    expect(close.exists()).toBe(true)
    await close.trigger('click')
    await router.isReady()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collab')
    wrapper.unmount()
  })

  it('WorkbenchView 三栏骨架（wb-left / wb-center / wb-right）恒在', async () => {
    // WorkbenchView 读 route.params 推导选择——挂最小路由（/app 落点）
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app', name: 'ia2.collab', component: WorkbenchView }],
    })
    await router.push('/app')
    await router.isReady()
    const wrapper = mount(WorkbenchView, { global: { plugins: [router] } })
    expect(wrapper.find('[data-testid="wb-left"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-center"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="wb-right"]').exists()).toBe(true)
  })
})
