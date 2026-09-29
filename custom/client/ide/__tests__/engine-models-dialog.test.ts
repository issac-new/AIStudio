// A8 守门：IdeEngineModelsDialog 管理写通道（PUT /api/ide/engine-models 原零写方）。
// @vitest-environment jsdom
// 契约：GET 载入渲染 provider/model 行；保存 PUT 全量替换（trim+空行过滤+
// reasoningLevels 逗号解析）；400 校验问题逐条可见；成功回显写穿结果并 emit saved。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import IdeEngineModelsDialog from '../components/IdeEngineModelsDialog.vue'

const EXISTING = {
  ok: true,
  config: {
    providers: [{ providerId: 'glm', baseURL: 'https://open.bigmodel.cn/api', apiKeyEnv: 'GLM_KEY', models: [{ modelId: 'glm-5', reasoningLevels: ['low', 'high'] }] }],
    defaultModel: { providerId: 'glm', modelId: 'glm-5' },
  },
}

describe('IdeEngineModelsDialog（A8）', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => EXISTING }))
  })

  it('载入渲染既有配置（provider/model/推理档/默认模型）', async () => {
    const w = mount(IdeEngineModelsDialog)
    await new Promise((r) => setTimeout(r, 30))
    expect((w.find('[data-testid="ide-emd-pid-0"]').element as HTMLInputElement).value).toBe('glm')
    expect((w.find('[data-testid="ide-emd-mid-0-0"]').element as HTMLInputElement).value).toBe('glm-5')
    expect((w.find('[data-testid="ide-emd-mrl-0-0"]').element as HTMLInputElement).value).toBe('low,high')
    expect((w.find('[data-testid="ide-emd-defp"]').element as HTMLSelectElement).value).toBe('glm')
    expect((w.find('[data-testid="ide-emd-defm"]').element as HTMLSelectElement).value).toBe('glm-5')
  })

  it('保存：PUT 全量替换（trim+空 model 过滤+推理档解析），成功 emit saved+回显写穿', async () => {
    const w = mount(IdeEngineModelsDialog)
    await new Promise((r) => setTimeout(r, 30))
    // 加一个 provider 行，留空 modelId（应被过滤）
    await w.find('[data-testid="ide-emd-padd"]').trigger('click')
    const pidInput = w.find('[data-testid="ide-emd-pid-1"]')
    await pidInput.setValue('openai')
    await w.find('[data-testid="ide-emd-purl-1"]').setValue('https://api.openai.com/v1')
    fetchMock.mockImplementation(async (_u: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') {
        return { ok: true, json: async () => ({ ok: true, enginePassthrough: { wrote: true, providerKeys: ['ide-engine:glm', 'ide-engine:openai'], note: '' } }) }
      }
      return { ok: true, json: async () => EXISTING }
    })
    await w.find('[data-testid="ide-emd-save"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    const put = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT')
    expect(put).toBeTruthy()
    const body = JSON.parse(String(put![1]?.body))
    expect(body.providers).toHaveLength(2)
    expect(body.providers[0]).toEqual({ providerId: 'glm', baseURL: 'https://open.bigmodel.cn/api', apiKeyEnv: 'GLM_KEY', models: [{ modelId: 'glm-5', reasoningLevels: ['low', 'high'] }] })
    expect(body.providers[1].providerId).toBe('openai')
    expect(body.providers[1].models).toEqual([]) // 空 modelId 被过滤
    expect(body.defaultModel).toEqual({ providerId: 'glm', modelId: 'glm-5' })
    expect(w.emitted('saved')).toBeTruthy()
    expect(w.find('[data-testid="ide-emd-saved"]').text()).toContain('写穿')
  })

  it('400：校验问题逐条可见，不 emit saved', async () => {
    const w = mount(IdeEngineModelsDialog)
    await new Promise((r) => setTimeout(r, 30))
    fetchMock.mockImplementation(async (_u: string, init?: { method?: string }) => {
      if (init?.method === 'PUT') return { ok: false, status: 400, json: async () => ({ ok: false, problems: ['duplicate providerId: glm'] }) }
      return { ok: true, json: async () => EXISTING }
    })
    await w.find('[data-testid="ide-emd-save"]').trigger('click')
    await new Promise((r) => setTimeout(r, 30))
    expect(w.find('[data-testid="ide-emd-problems"]').text()).toContain('duplicate providerId')
    expect(w.emitted('saved')).toBeFalsy()
  })
})
