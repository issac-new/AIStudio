// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-views.test.ts
// P3 Task 3 — 区域壳冒烟：RunsView 内嵌 RunCenterView、TasksView 内嵌 SwarmKanban、
// CommsView 承载 matrix-chat 子路由、三个占位区渲染占位文案。
// 重组件（runcenter/kanban/matrix-chat）一律 vi.mock 成桩，只验证"壳→内嵌"接线。
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
import OrchestrateView from '../views/OrchestrateView.vue'
import InboxView from '../views/InboxView.vue'
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

  it('TasksView 内嵌 SwarmKanbanView', () => {
    const wrapper = mount(TasksView)
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

describe('占位区域（Task 5/6 实装前的可用骨架）', () => {
  // OverviewView 已于 Task 4 实装（装配冒烟见 overview-components.test.ts）
  it.each([
    [OrchestrateView, 'ia2.placeholder.orchestrate'],
    [InboxView, 'ia2.placeholder.inbox'],
  ])('%# 占位渲染标题与说明（i18n key 直返 mock）', (view, key) => {
    const wrapper = mount(view as never)
    const text = wrapper.text()
    expect(text).toContain(key)
    expect(wrapper.find('.ia-placeholder').exists()).toBe(true)
  })
})
