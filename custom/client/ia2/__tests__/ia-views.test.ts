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
