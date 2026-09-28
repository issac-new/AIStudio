// 切换器数据源守门（独立设置：独立目录优先；空/失败回落 hermes 目录）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const catalogMock = vi.fn()
vi.mock('../utils/engine-models', () => ({
  fetchEngineCatalog: () => catalogMock(),
}))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    activeSession: { id: 's1', codingAgentMode: 'scoped', model: 'glm-5.3' },
    activeSessionId: 's1',
    switchSessionModel: vi.fn(async () => true),
  }),
}))
vi.mock('@/stores/hermes/app', () => ({
  useAppStore: () => ({
    modelGroups: [{ provider: 'hermes-provider', models: [{ id: 'h-model' }] }],
  }),
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => ({}) }))

import IdeModelSwitcher from '../views/IdeModelSwitcher.vue'

describe('IdeModelSwitcher 数据源（独立设置）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    catalogMock.mockReset()
  })

  it('独立目录非空→用独立配置（与 hermes 目录零共享）', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', models: [{ id: 'glm-5.3', reasoningLevels: ['low'] }] }],
    })
    const w = mount(IdeModelSwitcher)
    await flushPromises()
    await w.find('[data-testid="ide-model-switcher"]').trigger('click')
    const text = w.text()
    expect(text).toContain('bigmodel')
    expect(text).not.toContain('hermes-provider')
  })

  it('独立目录空/失败→回落 hermes 目录（过渡兼容不空白）', async () => {
    catalogMock.mockResolvedValue({ independent: false, groups: [] })
    const a = mount(IdeModelSwitcher)
    await flushPromises()
    await a.find('[data-testid="ide-model-switcher"]').trigger('click')
    expect(a.text()).toContain('hermes-provider')
    catalogMock.mockRejectedValue(new Error('503'))
    const b = mount(IdeModelSwitcher)
    await flushPromises()
    await b.find('[data-testid="ide-model-switcher"]').trigger('click')
    expect(b.text()).toContain('hermes-provider')
  })
})
