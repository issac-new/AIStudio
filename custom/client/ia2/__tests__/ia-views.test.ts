// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-views.test.ts
// P3 Task 3 — 区域壳冒烟：RunsView 内嵌 RunCenterView、TasksView 内嵌 SwarmKanban、
// CommsView 承载 matrix-chat 子路由。
// 重组件（runcenter/kanban/matrix-chat）一律 vi.mock 成桩，只验证"壳→内嵌"接线。
// 占位区用例随实装逐批退场（Overview Task 4 / Inbox Task 5 / Orchestrate Task 6，
// 装配冒烟见各自组件测试）；后续占位区实装时同步摘除对应断言。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const { runCenterMounted, swarmKanbanMounted, matrixChatMounted } = vi.hoisted(() => ({
  runCenterMounted: { count: 0 },
  swarmKanbanMounted: { count: 0 },
  matrixChatMounted: { count: 0 },
}))

vi.mock('@/custom/loop/runcenter/views/RunCenterView.vue', () => ({
  default: { setup: () => { runCenterMounted.count += 1 }, template: '<div class="rc-stub" />' },
}))
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { setup: () => { swarmKanbanMounted.count += 1 }, template: '<div class="kanban-stub" />' },
}))
vi.mock('@/custom/matrix-chat/views/MatrixChatView.vue', () => ({
  default: { setup: () => { matrixChatMounted.count += 1 }, template: '<div class="matrix-stub" />' },
}))

import RunsView from '../views/RunsView.vue'
import TasksView from '../views/TasksView.vue'
import CommsView from '../views/CommsView.vue'
import { buildIaRoutes } from '../routes'

beforeEach(() => {
  setActivePinia(createPinia())
  runCenterMounted.count = 0
  swarmKanbanMounted.count = 0
  matrixChatMounted.count = 0
})

describe('区域壳内嵌接线', () => {
  it('RunsView 内嵌 RunCenterView（wrapper 不复制逻辑）', () => {
    const wrapper = mount(RunsView)
    expect(wrapper.find('.rc-stub').exists()).toBe(true)
    expect(runCenterMounted.count).toBe(1)
  })

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
    const commsBranch = buildIaRoutes()[0].children!.find(r => r.name === 'ia2.comms')!
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

