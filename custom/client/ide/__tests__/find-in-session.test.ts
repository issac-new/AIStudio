// B4 守门：IdeFindInSession 会话内查找（zcode findInTask 对照）。
// @vitest-environment jsdom
// 契约：子串过滤当前会话消息；计数 n/N；Enter/Shift+Enter 循环；定位经
// chatStore.focusMessageId（MessageList 既有定位链）；Esc 关闭；无匹配 0/0 不跳转。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const chatState = reactive({
  activeSessionId: 's1',
  activeSession: {
    messages: [
      { id: 'm1', role: 'user', content: '先修登录页' },
      { id: 'm2', role: 'assistant', content: '登录页已修复，见 diff' },
      { id: 'm3', role: 'user', content: '再补测试' },
    ],
  } as unknown,
  focusMessageId: null as string | null,
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

import IdeFindInSession from '../components/IdeFindInSession.vue'

describe('IdeFindInSession（B4 会话内查找）', () => {
  beforeEach(() => { chatState.focusMessageId = null })

  it('子串匹配计数 + 输入即定位首条', async () => {
    const w = mount(IdeFindInSession)
    await w.find('[data-testid="ide-find-input"]').setValue('登录')
    expect(w.find('[data-testid="ide-find-count"]').text()).toBe('1/2')
    expect(chatState.focusMessageId).toBe('m1')
  })

  it('Enter 循环到下一条（回绕），Shift+Enter 上一', async () => {
    const w = mount(IdeFindInSession)
    await w.find('[data-testid="ide-find-input"]').setValue('登录')
    await w.find('[data-testid="ide-find-next"]').trigger('click')
    expect(chatState.focusMessageId).toBe('m2')
    expect(w.find('[data-testid="ide-find-count"]').text()).toBe('2/2')
    await w.find('[data-testid="ide-find-next"]').trigger('click') // 回绕到首条
    expect(chatState.focusMessageId).toBe('m1')
    await w.find('[data-testid="ide-find-prev"]').trigger('click')
    expect(chatState.focusMessageId).toBe('m2')
  })

  it('无匹配：0/0 且不写 focusMessageId；Esc 关闭', async () => {
    const w = mount(IdeFindInSession)
    await w.find('[data-testid="ide-find-input"]').setValue('不存在的词')
    expect(w.find('[data-testid="ide-find-count"]').text()).toBe('0/0')
    expect(chatState.focusMessageId).toBeNull()
    await w.find('[data-testid="ide-find-input"]').trigger('keydown', { key: 'Escape' })
    expect(w.emitted('close')).toBeTruthy()
  })

  it('非字符串 content 不计入（防崩）', async () => {
    chatState.activeSession = { messages: [{ id: 'm9', role: 'assistant', content: { complex: true } }] }
    const w = mount(IdeFindInSession)
    await w.find('[data-testid="ide-find-input"]').setValue('complex')
    expect(w.find('[data-testid="ide-find-count"]').text()).toBe('0/0')
    chatState.activeSession = { messages: [] }
  })
})
