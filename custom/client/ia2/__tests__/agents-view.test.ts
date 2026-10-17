// @vitest-environment jsdom
// D20 智能体工作台单测：列表渲染＋模型绑定（PUT /api/hermes/config 带
// x-hermes-profile 定向头）＋启停按钮调上游 restart API。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }), createI18n: () => ({ global: { t: (k: string) => k, locale: 'zh' } }) }))
vi.mock('@/api/hermes/profiles', () => ({
  fetchProfiles: vi.fn(async () => [
    { name: 'default', active: true, model: 'glm-4.7', gatewayStatus: 'running' },
    { name: 'd20-test', active: false, model: '', gatewayStatus: 'stopped' },
  ]),
  restartProfileGateway: vi.fn(async () => undefined),
  restartProfileRuntime: vi.fn(async () => undefined),
}))
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

import { authFetch } from '../../ide/utils/auth-fetch'
import { restartProfileGateway } from '@/api/hermes/profiles'
import AgentsView from '../views/agents/AgentsView.vue'

const mockedFetch = vi.mocked(authFetch)

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/:x(.*)', component: { template: '<div />' } }] })
}

describe('AgentsView — D20 智能体工作台', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('列表渲染：档案/模型/网关状态；行操作三键', async () => {
    const w = mount(AgentsView, { global: { plugins: [makeRouter()] } })
    await flushPromises()
    expect(w.find('[data-testid="agw-row-default"]').exists()).toBe(true)
    expect(w.find('[data-testid="agw-row-default"]').text()).toContain('glm-4.7')
    expect(w.find('[data-testid="agw-gw-default"]').exists()).toBe(true)
    expect(w.find('[data-testid="agw-rt-default"]').exists()).toBe(true)
    expect(w.find('[data-testid="agw-bind-default"]').exists()).toBe(true)
    w.unmount()
  })

  it('模型绑定：PUT /api/hermes/config section=model＋x-hermes-profile 定向头；provider 留空不发送', async () => {
    mockedFetch.mockResolvedValue({ ok: true } as Response)
    const w = mount(AgentsView, { global: { plugins: [makeRouter()] } })
    await flushPromises()
    await w.find('[data-testid="agw-bind-d20-test"]').trigger('click')
    await w.find('[data-testid="agw-bindmodel-d20-test"]').setValue('glm-5.3')
    await w.find('[data-testid="agw-bindsave-d20-test"]').trigger('click')
    await flushPromises()
    expect(mockedFetch).toHaveBeenCalledWith('/api/hermes/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-hermes-profile': 'd20-test' },
      body: JSON.stringify({ section: 'model', values: { default: 'glm-5.3' }, restart: false }),
    })
    expect(w.find('[data-testid="agw-note-d20-test"]').text()).toContain('已保存')
    w.unmount()
  })

  it('重启网关：调上游 restartProfileGateway', async () => {
    const w = mount(AgentsView, { global: { plugins: [makeRouter()] } })
    await flushPromises()
    await w.find('[data-testid="agw-gw-default"]').trigger('click')
    await flushPromises()
    expect(restartProfileGateway).toHaveBeenCalledWith('default')
    expect(w.find('[data-testid="agw-note-default"]').text()).toContain('网关已重启')
    w.unmount()
  })
})
