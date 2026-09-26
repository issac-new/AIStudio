// 输入框模型按钮守门（修复：解禁+独立目录+双路径 pick）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('naive-ui', () => ({
  useMessage: () => ({ success: vi.fn(), error: vi.fn() }),
  useDialog: () => ({ warning: vi.fn() }),
}))
const switchSessionModel = vi.fn(async () => true)
const switchModel = vi.fn(async () => true)
const state = { activeSessionId: null as string | null, activeSession: null as Record<string, unknown> | null }
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    get activeSessionId() { return state.activeSessionId },
    get activeSession() { return state.activeSession },
    switchSessionModel,
    sendMessage: vi.fn(),
  }),
}))
vi.mock('@/stores/hermes/app', () => ({
  useAppStore: () => ({
    modelGroups: [{ provider: 'hermes-p', models: [{ id: 'h-model' }] }],
    selectedModel: '',
    switchModel,
  }),
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ floats: {}, agentId: 'zcode' }) }))
const catalogMock = vi.fn()
vi.mock('../utils/engine-models', () => ({ fetchEngineCatalog: () => catalogMock() }))
vi.mock('@/api/hermes/model-context', () => ({ setModelContext: vi.fn(async () => undefined) }))
vi.mock('@/components/hermes/chat/ChatInput.vue', () => ({
  default: {
    name: 'ChatInputStub',
    props: ['modelDisabled', 'modelLabel'],
    emits: ['modelClick'],
    template: `<div>
      <button data-testid="stub-model-btn" :disabled="modelDisabled" @click="$emit('modelClick')">{{ modelLabel }}</button>
      <slot />
    </div>`,
  },
}))

import IdeChatPane from '../views/IdeChatPane.vue'

describe('IdeChatPane 输入框模型按钮（修复守门）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    catalogMock.mockReset()
    switchSessionModel.mockClear()
    switchModel.mockClear()
    state.activeSessionId = null
    state.activeSession = null
  })

  it('不再写死禁用：目录就绪即可点；点击开独立目录浮层', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', models: [{ id: 'glm-5.3' }] }],
    })
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    const btn = w.find('[data-testid="stub-model-btn"]')
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(w.find('[data-testid="ide-input-model-picker"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-input-model-bigmodel-glm-5.3"]').exists()).toBe(true)
  })

  it('无会话 pick=新会话默认模型（switchModel）；有会话 pick=会话粘性（switchSessionModel）', async () => {
    catalogMock.mockResolvedValue({
      independent: true,
      groups: [{ provider: 'bigmodel', models: [{ id: 'glm-5.3' }] }],
    })
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never)
    await flushPromises()
    await w.find('[data-testid="stub-model-btn"]').trigger('click')
    await w.find('[data-testid="ide-input-model-bigmodel-glm-5.3"]').trigger('click')
    expect(switchModel).toHaveBeenCalledWith('glm-5.3', 'bigmodel')
    expect(switchSessionModel).not.toHaveBeenCalled()

    state.activeSessionId = 's1'
    state.activeSession = { id: 's1', model: '' }
    await w.find('[data-testid="stub-model-btn"]').trigger('click')
    await w.find('[data-testid="ide-input-model-bigmodel-glm-5.3"]').trigger('click')
    expect(switchSessionModel).toHaveBeenCalledWith('glm-5.3', 'bigmodel', 's1')
  })

  it('目录全空才禁（回落也空）', async () => {
    catalogMock.mockResolvedValue({ independent: false, groups: [] })
    const w = mount(IdeChatPane, { global: { stubs: { transition: false } } } as never, )
    await flushPromises()
    // 回落 hermes modelGroups（mock 里有一组）→ 仍可用
    expect(w.find('[data-testid="stub-model-btn"]').attributes('disabled')).toBeUndefined()
  })
})
