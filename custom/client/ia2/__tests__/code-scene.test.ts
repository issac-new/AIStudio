// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/code-scene.test.ts
// Code 场景守门：任务上下文条 + IDE 三区（文件/终端/上下文），
// cockpit 组件 props 注入 + 无任务/无 workspace 空态。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

const workspaceStubs = vi.hoisted(() => {
  const state = {
    tasks: [
      { id: 't1', title: '编码任务 A', status: 'running', workspace: '/ws/a' },
      { id: 't2', title: '编码任务 B', status: 'todo' },
    ] as Array<Record<string, unknown>>,
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// cockpit 组件桩（props 捕获断言注入）。vi.mock 工厂被提升到 const 声明之前，
// 桩定义须同样走 vi.hoisted（与上方 workspaceStubs 同一模式）。
const componentStubs = vi.hoisted(() => ({
  FilePanelStub: {
    name: 'FilePanelStub',
    props: ['workspacePath'],
    template: '<div class="file-panel-stub" :data-ws="workspacePath" />',
  },
  TerminalPaneStub: {
    name: 'TerminalPaneStub',
    props: ['workspacePath'],
    template: '<div class="term-pane-stub" :data-ws="workspacePath" />',
  },
  RunLinksStub: {
    name: 'RunLinksStub',
    props: ['taskId', 'show'],
    template: '<div class="runlinks-stub" />',
  },
  TaskDrawerStub: {
    name: 'TaskDrawerStub',
    props: ['show', 'taskId'],
    emits: ['update:show', 'close'],
    template: '<div class="task-drawer-stub" />',
  },
}))
vi.mock('@/custom/cockpit/components/CockpitFilePanel.vue', () => ({ default: componentStubs.FilePanelStub }))
vi.mock('@/custom/cockpit/components/CockpitTerminalPane.vue', () => ({ default: componentStubs.TerminalPaneStub }))
vi.mock('@/custom/ia2/components/RunLinks.vue', () => ({ default: componentStubs.RunLinksStub }))
vi.mock('@/custom/kanban/components/KanbanTaskDrawer.vue', () => ({ default: componentStubs.TaskDrawerStub }))

// naive-ui NSelect 在 jsdom 桩环境解析异常（findComponent 空包装），
// 按简报预案换轻桩：仅暴露 value/options props 与 update:value 事件。
vi.mock('naive-ui', () => ({
  NSelect: { name: 'NSelect', props: ['value', 'options'], emits: ['update:value'], template: '<select />' },
}))

import CodeScene from '../views/scenes/CodeScene.vue'

async function mountScene() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/comms', name: 'ia2.comms', component: { template: '<div />' } }],
  })
  const wrapper = mount(CodeScene, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()
  return { wrapper, router }
}

describe('CodeScene — 装配', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('未选任务：空态引导，三区不渲染', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="cscene-empty"]').exists()).toBe(true)
    expect(wrapper.find('.term-pane-stub').exists()).toBe(false)
  })

  it('选中任务：文件/终端以 props 注入 workspace；上下文栏渲染 RunLinks', async () => {
    const { wrapper } = await mountScene()
    await wrapper.findComponent({ name: 'NSelect' }).vm.$emit('update:value', 't1')
    await flushPromises()
    expect(wrapper.find('.file-panel-stub').attributes('data-ws')).toBe('/ws/a')
    expect(wrapper.find('.term-pane-stub').attributes('data-ws')).toBe('/ws/a')
    expect(wrapper.find('.runlinks-stub').exists()).toBe(true)
  })

  it('任务无 workspace：三区位置渲染未领取空态，不注入 undefined props', async () => {
    const { wrapper } = await mountScene()
    await wrapper.findComponent({ name: 'NSelect' }).vm.$emit('update:value', 't2')
    await flushPromises()
    expect(wrapper.find('[data-testid="cscene-no-workspace"]').exists()).toBe(true)
    expect(wrapper.find('.term-pane-stub').exists()).toBe(false)
  })
})
