// @vitest-environment jsdom
// 沟通协作 / IDE 工作区切换守门（2026-10-18 左侧栏批）：
// 切换从六阶段④开发的分段控件里拆出来独立存在；两个方向都保留当前会话。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

const i18nState = vi.hoisted(() => ({ locale: 'zh' }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (k: string) => k,
    locale: { get value() { return i18nState.locale } },
  }),
}))

const chat = vi.hoisted(() => ({ activeSessionId: null as string | null }))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chat }))

import IaWorkspaceSwitch from '../components/IaWorkspaceSwitch.vue'

function makeRouter(initial: string): Router {
  const routes: RouteRecordRaw[] = [
    { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
    { path: '/app/s/chat/:sessionId', name: 'ia2.collabSession', component: { template: '<div />' } },
    { path: '/app/ide', name: 'ide.shell', component: { template: '<div />' } },
  ]
  return createRouter({ history: createMemoryHistory(), routes })
}

async function mountAt(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  const w = mount(IaWorkspaceSwitch, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

beforeEach(() => {
  chat.activeSessionId = null
  i18nState.locale = 'zh'
})

describe('IaWorkspaceSwitch — 沟通协作 / IDE 工作区', () => {
  it('沟通协作页：协作侧高亮，IDE 侧不高亮', async () => {
    const { w } = await mountAt('/app/collab')
    expect(w.find('[data-testid="ia-workspace-switch"]').exists()).toBe(true)
    expect(w.find('[data-testid="ia-workspace-collab"]').classes()).toContain('iws__btn--on')
    expect(w.find('[data-testid="ia-workspace-ide"]').classes()).not.toContain('iws__btn--on')
    w.unmount()
  })

  it('IDE 页：IDE 侧高亮；切回协作保留当前会话', async () => {
    chat.activeSessionId = 's1'
    const { w, router } = await mountAt('/app/ide')
    expect(w.find('[data-testid="ia-workspace-ide"]').classes()).toContain('iws__btn--on')
    await w.find('[data-testid="ia-workspace-collab"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.collabSession')
    expect(router.currentRoute.value.params.sessionId).toBe('s1')
    w.unmount()
  })

  it('协作页切 IDE：带当前会话 query', async () => {
    chat.activeSessionId = 's2'
    const { w, router } = await mountAt('/app/collab')
    await w.find('[data-testid="ia-workspace-ide"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ide.shell')
    expect(router.currentRoute.value.query.session).toBe('s2')
    w.unmount()
  })

  it('EN 语言下不残留中文：IDE Workspace / Workspace view', async () => {
    i18nState.locale = 'en'
    const { w } = await mountAt('/app/ide')
    expect(w.find('[data-testid="ia-workspace-ide"]').text()).toBe('IDE Workspace')
    expect(w.find('[data-testid="ia-workspace-switch"]').attributes('aria-label')).toBe('Workspace view')
    w.unmount()
  })
})
