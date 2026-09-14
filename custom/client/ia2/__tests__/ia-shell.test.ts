// @vitest-environment jsdom
// overlay/custom/client/ia2/__tests__/ia-shell.test.ts
// 驾驶舱单页壳守门（2026-09-14 重构，替代 ia-nav.test.ts）：
// IaNav 六菜单栏退役——壳只渲染子页头（非 overview 区）+ router-view。
// 挂载以根 <router-view/> 复刻 App.vue 深度（旧 ia-nav.test 同法）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'

// workspace store 桩（壳不再管理其生命周期——重构后归 LoopCockpitView；
// 此处桩化只为隔离重图依赖，同时断言壳卸载不再触发停止动作）
const workspaceStubs = vi.hoisted(() => {
  const state = {
    stopFleetStream: vi.fn(),
    stopReminderScheduler: vi.fn(),
  }
  return { state, useWorkspaceStore: () => state }
})
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: workspaceStubs.useWorkspaceStore }))

import IaShell from '../views/IaShell.vue'
import { IA_AREAS } from '../routes'

const AREA = { template: '<div class="area-stub" />' }
const APP = { template: '<router-view />' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/app',
        component: IaShell,
        children: [
          { path: '', name: 'ia2.overview', component: AREA },
          ...IA_AREAS.filter(a => a.key !== 'overview').map(a => ({
            path: a.path.replace('/app/', ''),
            name: a.name,
            component: AREA,
          })),
        ],
      },
    ],
  })
}

async function mountShell(path: string) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  const wrapper = mount(APP, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('IaShell — 去菜单守门', () => {
  it('驾驶舱区（/app）：无子页头，无 IaNav 六菜单栏', async () => {
    const { wrapper } = await mountShell('/app')
    expect(wrapper.find('[data-testid="ia-subhead"]').exists()).toBe(false)
    expect(wrapper.find('.ia-nav').exists()).toBe(false)
    expect(wrapper.find('.ia-nav__item').exists()).toBe(false)
    expect(wrapper.find('.ia-shell__main').exists()).toBe(true)
  })

  it.each(IA_AREAS.filter(a => a.key !== 'overview').map(a => [a.key, a.path]))(
    '子区域 %s：slim 页头（返回驾驶舱 + 区域标题）',
    async (_key, path) => {
      const { wrapper } = await mountShell(path)
      const subhead = wrapper.find('[data-testid="ia-subhead"]')
      expect(subhead.exists()).toBe(true)
      expect(subhead.text()).toContain('loopCockpit.back')
      // 区域标题来自 IA_AREAS labelKey（key 直返 i18n mock）
      const area = IA_AREAS.find(a => a.path === path)!
      expect(subhead.find('.ia-subhead__title').text()).toBe(area.labelKey)
    },
  )

  it('返回驾驶舱：点击回 ia2.overview', async () => {
    const { wrapper, router } = await mountShell('/app/runs')
    await wrapper.find('[data-testid="ia-subhead-back"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.overview')
  })

  it('壳卸载不再管理 workspace 流生命周期（已移入 LoopCockpitView）', async () => {
    const { wrapper } = await mountShell('/app/runs')
    wrapper.unmount()
    expect(workspaceStubs.state.stopFleetStream).not.toHaveBeenCalled()
    expect(workspaceStubs.state.stopReminderScheduler).not.toHaveBeenCalled()
  })
})
