// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/eng-scene.test.ts
// 工程场景守门（2026-09-18 统一导航 Task 4）：二级 tab 枢纽——
// tab1 编排（OrchestrateView 内嵌）+ tab2 Teams 管理（异步组件）。
// 重组件一律 vi.mock 成桩，只验证"场景 → tab → 内嵌"接线。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('../views/OrchestrateView.vue', () => ({
  default: { name: 'OrchestrateStub', template: '<div data-testid="orchestrate-stub" />' },
}))
vi.mock('@/custom/matrix-teams/views/TeamsManagePanel.vue', () => ({
  // __esModule：defineAsyncComponent 依赖它解包 .default；Vitest mock 命名空间缺省不带，须显式声明
  __esModule: true,
  default: { name: 'TeamsPanelStub', template: '<div data-testid="teams-panel-stub" />' },
}))

import EngScene from '../views/scenes/EngScene.vue'

async function mountScene() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/app/eng', name: 'ia2.eng', component: { template: '<div />' } }],
  })
  router.push('/app/eng')
  await router.isReady()
  const wrapper = mount(EngScene, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('EngScene — 二级 tab 枢纽', () => {
  it('两枚 tab 渲染（编排 / Teams 管理），label 用现存 i18n key', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="eng-tab-orchestrate"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="eng-tab-teams"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="eng-tab-orchestrate"]').text()).toBe('ia2.nav.orchestrate')
    expect(wrapper.find('[data-testid="eng-tab-teams"]').text()).toBe('loopScenes.manage.tabTeams')
  })

  it('默认选中编排 tab：挂 OrchestrateView，Teams 面板不渲染', async () => {
    const { wrapper } = await mountScene()
    expect(wrapper.find('[data-testid="orchestrate-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="teams-panel-stub"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="eng-tab-orchestrate"]').classes()).toContain('ia-tabs__btn--on')
    expect(wrapper.find('[data-testid="eng-tab-teams"]').classes()).not.toContain('ia-tabs__btn--on')
  })

  it('切 Teams tab：挂 TeamsManagePanel（异步组件，排空微任务后断言）', async () => {
    const { wrapper } = await mountScene()
    await wrapper.find('[data-testid="eng-tab-teams"]').trigger('click')
    await flushPromises() // defineAsyncComponent 动态 import 异步解析，须排空微任务再断言
    expect(wrapper.find('[data-testid="teams-panel-stub"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="orchestrate-stub"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="eng-tab-teams"]').classes()).toContain('ia-tabs__btn--on')
  })
})
