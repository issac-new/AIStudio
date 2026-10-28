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
vi.mock('../store/ide', () => ({ useIdeStore: () => ({ workspace: '/w' }) }))

import IdeTurnRail from '../components/IdeTurnRail.vue'

// Message 契约（stores/hermes/chat.ts）：timestamp 毫秒时间戳；工具调用是独立
// role='tool' 行（toolName 标识），没有 created_at / tool_calls 聚合字段。
const T0 = Date.parse('2026-09-26T10:00:00Z')
const msg = (id: string, role: string, content: string, at = T0) => ({ id, role, content, timestamp: at })
const tool = (id: string, toolName: string, at = T0) => ({ id, role: 'tool', content: '', timestamp: at, toolName })

describe('IdeTurnRail（轮导航）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.activeSession = null
    state.focusMessageId = ''
  })

  it('单轮不渲染；多轮出行+锚点+工具计数+轮时长', () => {
    state.activeSession = { messages: [msg('m1', 'user', 'hi')] }
    const single = mount(IdeTurnRail)
    expect(single.find('[data-testid="ide-turn-rail"]').exists()).toBe(false)

    state.activeSession = {
      messages: [
        msg('m1', 'user', '第一问'),
        msg('m2', 'assistant', '', T0 + 1000),
        tool('t1', 'Bash', T0 + 2000),
        tool('t2', 'Read', T0 + 3000),
        msg('m3', 'user', '第二问', T0 + 5000),
        msg('m4', 'assistant', '答', T0 + 6000),
      ],
    }
    const w = mount(IdeTurnRail)
    expect(w.findAll('[data-testid^="ide-turn-rail-"]')).toHaveLength(2)
    const first = w.find('[data-testid="ide-turn-rail-0"]').attributes('title')
    expect(first).toContain('第一问')
    expect(first).toContain('2 tools')
    expect(first).toContain('3s') // 轮时长取自 timestamp 差（首事件 0s → 末事件 3s）
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
