// G6 Gen UI 面板挂载守门：指令列表、工作区外过滤、iframe sandbox/CSP、超限错误。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))

const session = {
  id: 's1',
  messages: [
    { id: 'a1', role: 'assistant', content: '看这个 ::visualize{path="/w/demo.html" title="体积"}' },
    { id: 'a2', role: 'assistant', content: '::visualize{path="/other/x.html"}' },
  ],
}
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ activeSessionId: 's1', activeSession: session }) }))
vi.mock('../composables/useIdeWorkspace', () => ({ useIdeWorkspace: () => ({ root: { value: '/w' } }) }))
const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }))
vi.mock('@/api/studio/files', () => ({ readFile: readFileMock }))

import IdeGenUiPane from '../views/IdeGenUiPane.vue'

describe('IdeGenUiPane', () => {
  beforeEach(() => vi.clearAllMocks())

  it('列出工作区内指令，工作区外被过滤', async () => {
    const w = mount(IdeGenUiPane)
    await flushPromises()
    expect(w.find('[data-testid="ide-genui-list"]').text()).toContain('/w/demo.html')
    expect(w.find('[data-testid="ide-genui-list"]').text()).not.toContain('/other/x.html')
  })

  it('点开：读取文件并用 sandbox=allow-scripts + CSP 的 iframe 渲染', async () => {
    readFileMock.mockResolvedValue({ content: '<p>hi</p>', path: '/w/demo.html', size: 12 })
    const w = mount(IdeGenUiPane)
    await flushPromises()
    await w.find('[data-testid^="ide-genui-item-"]').trigger('click')
    await flushPromises()
    const frame = w.find('[data-testid="ide-genui-frame"]')
    expect(frame.exists()).toBe(true)
    expect(frame.attributes('sandbox')).toBe('allow-scripts')
    expect(String(frame.attributes('srcdoc'))).toContain("default-src 'none'")
    expect(readFileMock).toHaveBeenCalledWith('/w/demo.html', '/w')
  })

  it('超限/读取失败给诚实错误，不渲染 iframe', async () => {
    readFileMock.mockResolvedValue({ content: 'x', path: '/w/demo.html', size: 600 * 1024 })
    let w = mount(IdeGenUiPane)
    await flushPromises()
    await w.find('[data-testid^="ide-genui-item-"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ide-genui-frame"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-genui-error"]').text()).toContain('512')

    readFileMock.mockRejectedValue(new Error('not found'))
    w = mount(IdeGenUiPane)
    await flushPromises()
    await w.find('[data-testid^="ide-genui-item-"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-testid="ide-genui-error"]').text()).toContain('not found')
  })

  it('无指令显示空态', async () => {
    session.messages = []
    const w = mount(IdeGenUiPane)
    await flushPromises()
    expect(w.find('[data-testid="ide-genui-empty"]').exists()).toBe(true)
    session.messages = [
      { id: 'a1', role: 'assistant', content: '看这个 ::visualize{path="/w/demo.html" title="体积"}' },
    ]
  })
})
