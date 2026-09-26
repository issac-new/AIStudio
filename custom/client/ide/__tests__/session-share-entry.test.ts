// 共享会话客户端入口守门（IdeShareEntry：可用态+创建链接+失败不展示）。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
const shareMock = vi.fn()
vi.mock('../utils/session-share', () => ({
  createSessionShare: (...args: unknown[]) => shareMock(...args),
}))

import IdeShareEntry from '../views/IdeShareEntry.vue'

describe('IdeShareEntry（session-share 客户端半边）', () => {
  beforeEach(() => {
    shareMock.mockReset()
    const clipboard = { writeText: vi.fn(async () => undefined) }
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
  })

  it('无会话禁用；有会话点击→创建 view 链接+展示+写剪贴板', async () => {
    shareMock.mockResolvedValue({ token: 'tok1', mode: 'view', url: 'http://x/#/ide/shared/tok1' })
    const w = mount(IdeShareEntry, { props: { sessionId: '' } })
    expect(w.find('[data-testid="ide-chat-share"]').attributes('disabled')).toBeDefined()
    await w.setProps({ sessionId: 'sess-1' })
    await w.find('[data-testid="ide-chat-share"]').trigger('click')
    await flushPromises()
    expect(shareMock).toHaveBeenCalledWith('sess-1', 'view')
    expect(w.find('[data-testid="ide-chat-share-link"]').text()).toContain('/shared/tok1')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://x/#/ide/shared/tok1')
  })

  it('创建失败不展示链接', async () => {
    shareMock.mockRejectedValue(new Error('503'))
    const w = mount(IdeShareEntry, { props: { sessionId: 'sess-2' } })
    await w.find('[data-testid="ide-chat-share"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ide-chat-share-link"]').exists()).toBe(false)
  })
})
