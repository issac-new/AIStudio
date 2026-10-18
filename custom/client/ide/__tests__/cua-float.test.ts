// Cua 浮窗挂载守门：空态、缩略图列表、选中放大/保存入口。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    activeSessionId: 's1',
    activeSession: {
      id: 's1',
      messages: [
        { id: 'm1', role: 'tool', toolName: 'mcp__node_repl__js', timestamp: 2, toolResult: { content: [
          { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
          { type: 'text', text: 'Captured 5 bytes.' },
        ] } },
      ],
    },
  }),
}))
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ floats: { cua: true } }) }))

import IdeCuaFloat from '../components/IdeCuaFloat.vue'

describe('IdeCuaFloat', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('渲染缩略图；点击选中显示大图与动作条', async () => {
    const w = mount(IdeCuaFloat)
    await flushPromises()
    expect(w.find('[data-testid^="ide-cua-shot-"]').exists()).toBe(true)
    await w.find('[data-testid^="ide-cua-shot-"]').trigger('click')
    expect(w.find('[data-testid="ide-cua-view"]').exists()).toBe(true)
    const img = w.find('.ide-cua__img')
    expect(img.attributes('src')).toBe('data:image/png;base64,aGVsbG8=')
    expect(w.find('[data-testid="ide-cua-zoom"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-cua-save"]').exists()).toBe(true)
    expect(w.text()).toContain('Captured 5 bytes.')
  })
})
