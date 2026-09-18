// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-views.test.ts
// 区域壳冒烟（2026-09-18 统一导航 Task 4 改写）：TasksView 内嵌 SwarmKanban、
// CommsView 承载 matrix-chat 子路由。原 RunsView wrapper 已退役（运行中心
// RunCenterView 由 OpsScene runs tab 直接内嵌，见 ops-scene.test.ts）。
// 重组件（kanban/matrix-chat）一律 vi.mock 成桩，只验证"壳→内嵌"接线。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const { swarmKanbanMounted, matrixChatMounted } = vi.hoisted(() => ({
  swarmKanbanMounted: { count: 0 },
  matrixChatMounted: { count: 0 },
}))

vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { setup: () => { swarmKanbanMounted.count += 1 }, template: '<div class="kanban-stub" />' },
}))
vi.mock('@/custom/matrix-chat/views/MatrixChatView.vue', () => ({
  default: { setup: () => { matrixChatMounted.count += 1 }, template: '<div class="matrix-stub" />' },
}))

import TasksView from '../views/TasksView.vue'
import CommsView from '../views/CommsView.vue'
import { buildIaRoutes } from '../routes'

beforeEach(() => {
  setActivePinia(createPinia())
  swarmKanbanMounted.count = 0
  matrixChatMounted.count = 0
})

describe('区域壳内嵌接线', () => {
  it('TasksView 内嵌 SwarmKanbanView（P3 Task 7 起带页签 + 深链预选，需路由上下文）', async () => {
    // TasksView 读 route.query 做筛选预选——挂最小路由（/app/tasks 落点）
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/tasks', name: 'ia2.tasks', component: TasksView }],
    })
    await router.push('/app/tasks')
    await router.isReady()
    const wrapper = mount(TasksView, { global: { plugins: [router] } })
    expect(wrapper.find('.kanban-stub').exists()).toBe(true)
    expect(swarmKanbanMounted.count).toBe(1)
  })

  it('CommsView 承载 matrix-chat 子路由：默认房间视图 + room/:roomId 同组件', async () => {
    // 只挂 comms 分支：与生产 routes.ts 同源取子路由定义
    const commsBranch = buildIaRoutes()[0].children!.find(r => r.path === 'comms')!
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/app/comms', component: CommsView, children: commsBranch.children }],
    })
    router.push('/app/comms')
    await router.isReady()
    const wrapper = mount(CommsView, { global: { plugins: [router] } })
    expect(wrapper.find('.matrix-stub').exists()).toBe(true)
    expect(matrixChatMounted.count).toBe(1)
    await router.push('/app/comms/room/!x:y')
    await wrapper.vm.$nextTick()
    // 两条子路由是同一组件：Vue 复用实例（setup 不重跑），仅路由参数变化
    expect(matrixChatMounted.count).toBe(1)
    expect(router.currentRoute.value.name).toBe('ia2.commsRoom')
    expect(router.currentRoute.value.params.roomId).toBe('!x:y')
    expect(wrapper.find('.matrix-stub').exists()).toBe(true)
  })
})
