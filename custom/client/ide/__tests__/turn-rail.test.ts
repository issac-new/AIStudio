// 轮导航 rail 守门（UI-1：轮投影行+点击跳转 focusMessageId）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const state = {
  activeSession: null as Record<string, unknown> | null,
  focusMessageId: '' as string,
}
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => state,
}))

import IdeTurnRail from '../components/IdeTurnRail.vue'

const msg = (id: string, role: string, content: string, toolCalls = 0) => ({
  id, role, content, created_at: '2026-09-26T10:00:00Z', ...(toolCalls ? { tool_calls: Array(toolCalls).fill({}) } : {}),
})

describe('IdeTurnRail（轮导航）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.activeSession = null
    state.focusMessageId = ''
  })

  it('单轮不渲染；多轮出行+锚点+工具计数', () => {
    state.activeSession = { messages: [msg('m1', 'user', 'hi')] }
    const single = mount(IdeTurnRail)
    expect(single.find('[data-testid="ide-turn-rail"]').exists()).toBe(false)

    state.activeSession = {
      messages: [
        msg('m1', 'user', '第一问'),
        msg('m2', 'assistant', '', 2),
        msg('m3', 'user', '第二问'),
        msg('m4', 'assistant', '答'),
      ],
    }
    const w = mount(IdeTurnRail)
    expect(w.findAll('[data-testid^="ide-turn-rail-"]')).toHaveLength(2)
    expect(w.find('[data-testid="ide-turn-rail-0"]').attributes('title')).toContain('第一问')
    expect(w.find('[data-testid="ide-turn-rail-0"]').attributes('title')).toContain('2 tools')
  })

  it('点击轮行→focusMessageId=该轮首消息 id（MessageList 既有跳转链）', async () => {
    state.activeSession = {
      messages: [
        msg('m1', 'user', '第一问'),
        msg('m3', 'user', '第二问'),
      ],
    }
    const w = mount(IdeTurnRail)
    await w.find('[data-testid="ide-turn-rail-1"]').trigger('click')
    expect(state.focusMessageId).toBe('m3')
  })
})
