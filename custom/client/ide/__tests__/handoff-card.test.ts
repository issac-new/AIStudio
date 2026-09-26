// 交接卡守门（UI-6：六段识别/非交接消息不渲染/缺段拒）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const state = { activeSession: null as Record<string, unknown> | null }
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => state,
}))

import IdeHandoffCard from '../components/IdeHandoffCard.vue'

const FULL = `## 已完成
- a 完成
## 未完成
- 无
## 风险
- 无
## 下一步
- b 待办
## 产物
- x.ts
## 复核
- npm test`

function sess(lastAssistant: string | null) {
  const messages = [{ id: 'm1', role: 'user', content: 'q' }]
  if (lastAssistant !== null) messages.push({ id: 'm2', role: 'assistant', content: lastAssistant })
  return { messages }
}

describe('IdeHandoffCard（交接卡）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    state.activeSession = null
  })

  it('六段齐备→渲染交接卡（六段标题全在）', () => {
    state.activeSession = sess(FULL)
    const w = mount(IdeHandoffCard)
    expect(w.find('[data-testid="ide-handoff-card"]').exists()).toBe(true)
    for (const k of ['done', 'notDone', 'risks', 'next', 'artifacts', 'verify']) {
      expect(w.find(`[data-testid="ide-handoff-${k}"]`).exists()).toBe(true)
    }
    expect(w.text()).toContain('a 完成')
  })

  it('普通回复（无段落/缺段）不渲染', () => {
    state.activeSession = sess('好的，已完成修改。')
    expect(mount(IdeHandoffCard).find('[data-testid="ide-handoff-card"]').exists()).toBe(false)
    const partial = FULL.replace('## 复核\n- npm test', '')
    state.activeSession = sess(partial)
    expect(mount(IdeHandoffCard).find('[data-testid="ide-handoff-card"]').exists()).toBe(false)
    state.activeSession = sess(null)
    expect(mount(IdeHandoffCard).find('[data-testid="ide-handoff-card"]').exists()).toBe(false)
  })
})
