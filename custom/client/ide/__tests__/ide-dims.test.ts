// @vitest-environment jsdom
// overlay/custom/client/ide/__tests__/ide-dims.test.ts
// v12 IDE 工作空间维度条守门（09-20 重构三维化：链路维度退役）：三维切换
// 副作用 / ⇄沟通协作 / 维度持久化 / 任务维度 chip 带 #id 前缀 /
// project→右侧辅助面板 files 页签（查看文件右移）。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import IdeDimsBar from '../components/IdeDimsBar.vue'
import { useIdeStore } from '../store/ide'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'ia2.collab', component: { template: '<div />' } },
      { path: '/ide', name: 'ide.shell', component: { template: '<div />' } },
    ],
  })
}

async function mountBar() {
  const router = makeRouter()
  await router.push('/ide')
  await router.isReady()
  const wrapper = mount(IdeDimsBar, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  vi.clearAllMocks()
})

describe('IdeDimsBar — 工作空间维度条（三维）', () => {
  it('三维 chip 存在、链路维度已退役、默认任务维度高亮', async () => {
    const { wrapper } = await mountBar()
    for (const d of ['task', 'project', 'session']) {
      expect(wrapper.find(`[data-testid="ide-dim-${d}"]`).exists()).toBe(true)
    }
    expect(wrapper.find('[data-testid="ide-dim-chain"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ide-dim-task"]').classes()).toContain('ide-dims__chip--on')
  })

  it('维度切换副作用：project→右侧面板 files 页签；session→中栏聚焦', async () => {
    const { wrapper } = await mountBar()
    const ide = useIdeStore()
    await wrapper.find('[data-testid="ide-dim-project"]').trigger('click')
    expect(ide.dimension).toBe('project')
    expect(ide.sidePane.tab).toBe('files')
    expect(ide.sidePane.open).toBe(true)
    expect(localStorage.getItem('hermes_ide_dim')).toBe('project')
    ide.layout.chatVisible = false
    await wrapper.find('[data-testid="ide-dim-session"]').trigger('click')
    expect(ide.dimension).toBe('session')
    expect(ide.layout.chatVisible).toBe(true)
  })

  it('任务维度 chip 带 #id 前缀；⇄ 沟通协作 → /app', async () => {
    const { wrapper, router } = await mountBar()
    const ide = useIdeStore()
    ide.setActiveTask('t-402abcd1234')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="ide-dim-task"]').text()).toContain('#t-402abc')
    await wrapper.find('[data-testid="ide-dims-collab"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collab')
  })
})
