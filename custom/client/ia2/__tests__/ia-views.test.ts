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

  it('单层页签（2026-10-01 用户裁定：不要二级页签）：8 平级页签 + 治理四分区直挂 + 旧链兼容', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/board', name: 'ia2.board', component: TasksView }],
    })
    await router.push('/app/board')
    await router.isReady()
    const wrapper = mount(TasksView, { global: { plugins: [router] } })
    // 单层纪律：恰 8 个平级页签，无二级页签行（gov-subtabs 随 GovernanceView 退役）
    const tabs = wrapper.findAll('.ia-tasks__tab')
    expect(tabs).toHaveLength(8)
    expect(wrapper.findAll('[role="tab"]').length).toBe(8)
    expect(wrapper.find('[data-testid="gov-subtabs"]').exists()).toBe(false)
    expect(tabs.map(x => x.text())).toEqual([
      '看板', '追溯矩阵', '三账与体检', '全链路追踪', '组织与知识', '台账与规则', '审计与变更', '文档评审',
    ])
    // 治理首分区：点击=页内切换（URL 不变 + 内嵌渲染 + 页签仍在）
    const govOrgTab = wrapper.find('[data-testid="ia-tasks-tab-gov-org"]')
    expect(govOrgTab.exists()).toBe(true)
    expect(govOrgTab.text()).not.toContain('↗')
    await govOrgTab.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="gov-org-stub"]').exists()).toBe(true)
    expect(router.currentRoute.value.name).toBe('ia2.board')
    expect(wrapper.find('[data-testid="ia-tasks-tab-gov-org"]').exists()).toBe(true)
    // 其余三分区页签各挂各面板
    await wrapper.find('[data-testid="ia-tasks-tab-gov-registry"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="gov-registry-stub"]').exists()).toBe(true)
    await wrapper.find('[data-testid="ia-tasks-tab-gov-audit"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="gov-audit-stub"]').exists()).toBe(true)
    await wrapper.find('[data-testid="ia-tasks-tab-gov-docs"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="gov-docs-stub"]').exists()).toBe(true)
    // 三账与体检：管理三账 + 治理体检同页签堆叠（整合守门）
    await wrapper.find('[data-testid="ia-tasks-tab-accounts"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="ma-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="gov-health-stub"]').exists()).toBe(true)
    // 旧深链 ?tab=gov → 治理首分区（外部链接不死链）
    await router.push('/app/board?tab=gov')
    await flushPromises()
    expect(wrapper.find('[data-testid="gov-org-stub"]').exists()).toBe(true)
    // 新深链 ?tab=gov-docs 直达
    await router.push('/app/board?tab=gov-docs')
    await flushPromises()
    expect(wrapper.find('[data-testid="gov-docs-stub"]').exists()).toBe(true)
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
