// @vitest-environment jsdom
// D20 模型服务商区单测：平铺载入 GET /api/ide/engine-models、保存走
// POST /api/ide/engine-models-put（与 IDE 弹窗同源同端点）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))
vi.mock('../../ide/utils/auth-fetch', () => ({ authFetch: vi.fn() }))

import { authFetch } from '../../ide/utils/auth-fetch'
import GovModelProvidersSection from '../components/gov/GovModelProvidersSection.vue'

const mockedFetch = vi.mocked(authFetch)

describe('GovModelProvidersSection — D20 模型服务商统一入口', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('载入：providers/defaultModel/route 全量入表单', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        config: {
          providers: [{ providerId: 'glm', baseURL: 'https://x', apiKeyEnv: 'GLM_KEY', models: [{ modelId: 'glm-4.7', reasoningLevels: ['high'] }] }],
          defaultModel: { providerId: 'glm', modelId: 'glm-4.7' },
          route: { standard: { providerId: 'glm', modelId: 'glm-4.7' } },
        },
      }),
    } as unknown as Response)
    const w = mount(GovModelProvidersSection)
    await flushPromises()
    expect(w.find('[data-testid="gmp-provider-0"]').exists()).toBe(true)
    expect((w.find('[data-testid="gmp-pid-0"]').element as HTMLInputElement).value).toBe('glm')
    expect((w.find('[data-testid="gmp-defm"]').element as HTMLSelectElement).value).toBe('glm-4.7')
    w.unmount()
  })

  it('保存：POST engine-models-put；成功回显', async () => {
    mockedFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ ok: true, config: { providers: [] } }),
    } as unknown as Response)
    mockedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, enginePassthrough: { wrote: true, providerKeys: ['glm'] } }),
    } as unknown as Response)
    const w = mount(GovModelProvidersSection)
    await flushPromises()
    await w.find('[data-testid="gmp-save"]').trigger('click')
    await flushPromises()
    expect(mockedFetch).toHaveBeenLastCalledWith('/api/ide/engine-models-put', expect.objectContaining({ method: 'POST' }))
    expect(w.find('[data-testid="gmp-saved"]').text()).toContain('写穿引擎')
    w.unmount()
  })
})
