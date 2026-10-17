// @vitest-environment jsdom
// 常用入口常驻条（2026-10-17 减负批）：四个日常高频目的地常驻页头下方，
// 任意页面一击可达；当前页高亮 + aria-current。
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }),
  createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }),
}))

import IaQuickNav from '../components/IaQuickNav.vue'

function makeRouter(initial: string): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/inbox', name: 'ia2.inbox', component: { template: '<div />' } },
      { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
      { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
      { path: '/app/sim/supervision', name: 'ia2.simSupervision', component: { template: '<div />' } },
    ] as RouteRecordRaw[],
  })
}

async function mountAt(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  const w = mount(IaQuickNav, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('IaQuickNav — 常用入口常驻条', () => {
  it('渲染四个入口（收件箱/看板/运行总览/监督面板）', async () => {
    const { w } = await mountAt('/app/inbox')
    expect(w.find('[data-testid="ia-quick-nav"]').exists()).toBe(true)
    for (const key of ['inbox', 'board', 'sim', 'supervision']) {
      expect(w.find(`[data-testid="ia-quick-${key}"]`).exists(), key).toBe(true)
    }
    w.unmount()
  })

  it('当前页高亮并带 aria-current', async () => {
    const { w } = await mountAt('/app/inbox')
    const inbox = w.find('[data-testid="ia-quick-inbox"]')
    expect(inbox.classes()).toContain('iaq__btn--active')
    expect(inbox.attributes('aria-current')).toBe('page')
    expect(w.find('[data-testid="ia-quick-board"]').classes()).not.toContain('iaq__btn--active')
    w.unmount()
  })

  it('点击一击直达（看板/监督面板）', async () => {
    const { w, router } = await mountAt('/app/inbox')
    await w.find('[data-testid="ia-quick-board"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('ia2.board')
    w.unmount()

    const { w: w2, router: r2 } = await mountAt('/app/sim')
    await w2.find('[data-testid="ia-quick-supervision"]').trigger('click')
    await flushPromises()
    expect(r2.currentRoute.value.name).toBe('ia2.simSupervision')
    w2.unmount()
  })
})
