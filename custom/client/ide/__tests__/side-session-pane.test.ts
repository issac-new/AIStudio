// B6 守门：对照分屏（只读第二会话）。
// @vitest-environment jsdom
// 契约：候选排除主会话且最近优先；选中拉取只读流（user/assistant 双态渲染）；
// 主会话切换后选中者若=新主会话则清空；拉取失败显错误态；空选择不请求。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const chatState = reactive({
  activeSessionId: 'main',
  sessions: [
    { id: 'main', title: '主会话', updatedAt: 300 },
    { id: 'ref-a', title: '参考会话A', updatedAt: 200 },
    { id: 'ref-b', title: '参考会话B', updatedAt: 100 },
  ],
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => chatState }))

const fetchPage = vi.fn()
vi.mock('@/api/studio/sessions', () => ({ fetchSessionMessagesPage: (...a: unknown[]) => fetchPage(...a) }))

import IdeSideSessionPane from '../components/IdeSideSessionPane.vue'

describe('IdeSideSessionPane（B6 对照分屏）', () => {
  beforeEach(() => {
    fetchPage.mockReset()
    chatState.activeSessionId = 'main'
  })

  it('候选排除主会话、最近优先；空选择不请求', async () => {
    const w = mount(IdeSideSessionPane)
    await new Promise((r) => setTimeout(r, 20))
    const options = w.findAll('[data-testid="ide-side-session-select"] option')
    expect(options.map((o) => (o.element as HTMLOptionElement).value)).toEqual(['', 'ref-a', 'ref-b'])
    expect(fetchPage).not.toHaveBeenCalled()
    w.unmount()
  })

  it('选中→只读流渲染 user/assistant；错误态如实', async () => {
    fetchPage.mockResolvedValue({ messages: [
      { id: 'm1', role: 'user', content: '怎么配 JWT？' },
      { id: 'm2', role: 'assistant', content: '见 config.yaml 的 auth 段' },
    ] })
    const w = mount(IdeSideSessionPane)
    await w.find('[data-testid="ide-side-session-select"]').setValue('ref-a')
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchPage).toHaveBeenCalledWith('ref-a', 0, 120)
    expect(w.find('[data-testid="ide-side-session-msg-user"]').text()).toContain('JWT')
    expect(w.find('[data-testid="ide-side-session-msg-assistant"]').text()).toContain('auth')
    w.unmount()
  })

  it('拉取失败显错误态不崩', async () => {
    fetchPage.mockRejectedValue(new Error('net'))
    const w = mount(IdeSideSessionPane)
    await w.find('[data-testid="ide-side-session-select"]').setValue('ref-b')
    await new Promise((r) => setTimeout(r, 20))
    expect(w.find('[data-testid="ide-side-session-error"]').exists()).toBe(true)
    w.unmount()
  })
})
