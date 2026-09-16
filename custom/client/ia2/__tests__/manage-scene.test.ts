// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/manage-scene.test.ts
// 管理场景守门：人员聚合条 + 看板内嵌 + 群栏目（弱锚点列表 + 跳群深链）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [
      { id: 't1', title: '需求 A', status: 'running', assignee: 'alice' },
      { id: 't2', title: '需求 B', status: 'blocked', assignee: 'alice' },
      { id: 't3', title: '需求 C', status: 'review', assignee: 'bob' },
      { id: 't4', title: '需求 D', status: 'todo', assignee: null },
    ] as Array<Record<string, unknown>>,
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

const kanbanStubs = vi.hoisted(() => ({
  setAssigneeFilter: vi.fn(),
  incomingFilter: null as string | null,
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ setAssigneeFilter: kanbanStubs.setAssigneeFilter, filterAssignee: kanbanStubs.incomingFilter }),
}))
vi.mock('@/custom/kanban/views/SwarmKanbanView.vue', () => ({
  default: { name: 'SwarmKanbanStub', template: '<div class="kanban-stub" />' },
}))
const { sortedRooms } = vi.hoisted(() => ({
  sortedRooms: { value: [
    { roomId: '!r1:sv', name: '[abcdef12] 需求评审' },
    { roomId: '!r2:sv', name: '日常闲聊' },
  ] as Array<{ roomId: string; name?: string | null }> },
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({ sortedRooms: sortedRooms.value }),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import ManageScene from '../views/scenes/ManageScene.vue'

async function mountScene() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/comms/room/:roomId', name: 'ia2.commsRoom', component: { template: '<div />' } },
      { path: '/app/tasks', name: 'ia2.tasks', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(ManageScene, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

describe('ManageScene — 装配', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    kanbanStubs.incomingFilter = null
  })

  it('人员条聚合在办：alice open1+blocked1 / bob review1 / 未指派 open1；done 不入桶', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="mscene-person-alice"]').text()).toContain('1')
    expect(wrapper.find('[data-testid="mscene-person-bob"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mscene-person-none"]').exists()).toBe(true)
    // 未指派桶非交互（评审 Important-1）：disabled 渲染，仅作存在性展示
    expect(wrapper.find('[data-testid="mscene-person-none"]').attributes('disabled')).toBeDefined()
  })

  it('点击人员 → setAssigneeFilter 按人筛选；再点同人取消；卸载清理筛选', async () => {
    const { wrapper } = await mountScene()
    await wrapper.find('[data-testid="mscene-person-alice"]').trigger('click')
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenCalledWith('alice')
    await wrapper.find('[data-testid="mscene-person-alice"]').trigger('click')
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenLastCalledWith(undefined)
    await wrapper.find('[data-testid="mscene-person-bob"]').trigger('click')
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenCalledWith('bob')
    // 未指派 chip 非交互（评审 Important-1）：点击不触发 setAssigneeFilter（守卫拦截）
    await wrapper.find('[data-testid="mscene-person-none"]').trigger('click')
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenLastCalledWith('bob')
    wrapper.unmount()
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenLastCalledWith(undefined)
  })

  it('带筛选进入：卸载归还原筛选，不清掉用户在 /app/tasks 的既有筛选', async () => {
    kanbanStubs.incomingFilter = 'alice'
    const { wrapper } = await mountScene()
    await wrapper.find('[data-testid="mscene-person-bob"]').trigger('click')
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenLastCalledWith('bob')
    wrapper.unmount()
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenLastCalledWith('alice')
  })

  it('筛选不外泄：场景内 store 级写入（内嵌看板工具条路径）卸载时不带出', async () => {
    const { wrapper } = await mountScene()
    // 模拟 SwarmKanbanView 工具条 handleAssigneeChange 直写 store（绕过 chip 路径）
    kanbanStubs.setAssigneeFilter('carol')
    wrapper.unmount()
    expect(kanbanStubs.setAssigneeFilter).toHaveBeenLastCalledWith(undefined)
  })

  it('看板内嵌渲染；群栏目只列弱锚点群（[ 前缀），点击跳 ia2.commsRoom', async () => {
    const { wrapper, router } = await mountScene()
    const push = vi.spyOn(router, 'push')
    expect(wrapper.find('.kanban-stub').exists()).toBe(true)
    const room = wrapper.find('[data-testid="mscene-room-!r1:sv"]')
    expect(room.exists()).toBe(true)
    expect(wrapper.find('[data-testid="mscene-room-!r2:sv"]').exists()).toBe(false)
    await room.trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'ia2.commsRoom', params: { roomId: '!r1:sv' } })
  })
})
