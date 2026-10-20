// @vitest-environment jsdom
// Matrix 服务器迁移横幅：报错必须给人话+正确重登落点；不再落到未认证 /matrix 空页。
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'zh' } }) }))
const state = vi.hoisted(() => ({ moved: null as { from: string; to: string } | null }))
vi.mock('../stores/matrix-client', () => ({
  useMatrixClientStore: () => ({
    get serverMoved() { return state.moved },
    logout: vi.fn(),
  }),
}))

import MatrixServerMovedBanner from '../components/MatrixServerMovedBanner.vue'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/matrix', name: 'matrix.client', component: { template: '<div />' } },
    ],
  })
}

describe('MatrixServerMovedBanner', () => {
  it('服务器迁移时说明新旧地址，重登落到 /login（matrix 页签由登录页承载）', async () => {
    state.moved = { from: 'http://old:8008', to: 'http://new:8008' }
    const router = makeRouter()
    await router.push('/matrix')
    await router.isReady()
    const w = mount(MatrixServerMovedBanner, { global: { plugins: [router] } })
    expect(w.find('[data-testid="matrix-server-moved-banner"]').text()).toContain('http://old:8008')
    expect(w.find('[data-testid="matrix-server-moved-banner"]').text()).toContain('http://new:8008')
    await w.find('[data-testid="matrix-server-moved-relogin"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    w.unmount()
  })

  it('地址未迁移时不渲染横幅', async () => {
    state.moved = null
    const router = makeRouter()
    await router.push('/matrix')
    await router.isReady()
    const w = mount(MatrixServerMovedBanner, { global: { plugins: [router] } })
    expect(w.find('[data-testid="matrix-server-moved-banner"]').exists()).toBe(false)
    w.unmount()
  })
})
