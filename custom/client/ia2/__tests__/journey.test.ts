// @vitest-environment jsdom
// D12 旅程首页单测：八阶段卡渲染+状态推导（done/active/pending）+无轮引导态+直达路由。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, type Router, type RouteRecordRaw } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }), createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }) }))
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

import { authFetch } from '../../ide/utils/auth-fetch'
import JourneyView from '../views/journey/JourneyView.vue'

const mockedFetch = vi.mocked(authFetch)

function makeRouter(initial: string): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app', name: 'ia2.journey', component: JourneyView },
      { path: '/app/collab', name: 'ia2.collab', component: { template: '<div />' } },
      { path: '/app/gov/org-assets', name: 'ia2.govOrgAssets', component: { template: '<div />' } },
      { path: '/app/sim', name: 'ia2.sim', component: { template: '<div />' } },
    ] as RouteRecordRaw[],
  })
}

async function mountAt(path: string) {
  const router = makeRouter(path)
  await router.push(path)
  await router.isReady()
  const w = mount(JourneyView, { global: { plugins: [router] } })
  await flushPromises()
  return { w, router }
}

describe('JourneyView — D12 时序旅程首页', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('八阶段卡片渲染（建立组织→治理改进）+无轮引导态直达组织', async () => {
    const { w } = await mountAt('/app')
    const cards = w.findAll('[data-testid^="jrn-stage-"]')
    expect(cards).toHaveLength(8)
    expect(w.find('[data-testid="jrn-stage-1"]').text()).toContain('建立组织')
    expect(w.find('[data-testid="jrn-stage-6"]').text()).toContain('生产交付')
    expect(w.find('[data-testid="jrn-stage-8"]').text()).toContain('治理改进')
    expect(w.find('[data-testid="jrn-guide"]').exists()).toBe(true)
    await w.find('[data-testid="jrn-start"]').trigger('click')
    await flushPromises()
    w.unmount()
  })

  it('带 run 状态推导：已完成阶段绿、首个未完成=进行中', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        run: 'r', posture: 'standard',
        gates: { g1_frozen: 't' },
        steps: { smoke_done: '1', appinit_done: '1', people_done: '1', login_done: '1' },
        ledger: { open: 0 },
      }),
    } as never)
    const { w } = await mountAt('/app?run=r')
    await flushPromises()
    expect(w.find('[data-testid="jrn-state-1"]').text()).toContain('完成')
    expect(w.find('[data-testid="jrn-state-3"]').text()).toContain('完成') // g1_frozen
    expect(w.find('[data-testid="jrn-state-4"]').text()).toContain('进行中') // 首个未完成
    expect(w.find('[data-testid="jrn-state-8"]').text()).toContain('未开始')
    expect(mockedFetch).toHaveBeenCalledWith('/api/hermes/sim/run-state?run=r')
    w.unmount()
  })

  it('端点不可达如实报错', async () => {
    mockedFetch.mockRejectedValue(new Error('503'))
    const { w } = await mountAt('/app?run=bad')
    await flushPromises()
    expect(w.find('[data-testid="jrn-error"]').text()).toContain('503')
    w.unmount()
  })
})
