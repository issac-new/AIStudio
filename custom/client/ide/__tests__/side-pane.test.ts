// overlay/custom/client/ide/__tests__/side-pane.test.ts
// 右侧辅助面板守门：开关状态、四 tab 切换渲染、辅助对话追问复制。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const msgs = { success: vi.fn(), error: vi.fn() }
vi.mock('naive-ui', () => ({
  useMessage: () => msgs,
  NDropdown: { name: 'NDropdown', template: '<div><slot /></div>' },
  NTooltip: { name: 'NTooltip', template: '<div><slot name="trigger" /><slot /></div>' },
}))

// 三个内容面板挡为桩（各自依赖面由专测覆盖）
vi.mock('../views/IdeGitPane.vue', () => ({ default: { name: 'IdeGitPane', template: '<div data-testid="stub-gitpane" />' } }))
vi.mock('../views/IdeWikiPane.vue', () => ({ default: { name: 'IdeWikiPane', template: '<div data-testid="stub-wikipane" />' } }))
vi.mock('@/views/hermes/DesktopBrowserView.vue', () => ({ default: { name: 'DesktopBrowserView', template: '<div data-testid="stub-browser" />' } }))

const writeText = vi.fn(async () => {})
Object.assign(navigator, { clipboard: { writeText } })

import IdeSidePane from '../views/IdeSidePane.vue'
import { useIdeStore } from '../store/ide'

function mountPane() {
  return mount(IdeSidePane)
}

describe('IdeSidePane（清单批：切换面板）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('默认关闭不渲染；open 后按 tab 渲染对应面板', async () => {
    const ide = useIdeStore()
    let w = mountPane()
    expect(w.find('[data-testid="ide-sidepane"]').exists()).toBe(false)

    ide.setSidePaneTab('review')
    await flushPromises()
    w = mountPane()
    // 组件传的 data-testid 会覆盖桩自带 testid（attr 合并规则），断言覆盖值
    expect(w.find('[data-testid="ide-sidepane-review"]').exists()).toBe(true)

    ide.setSidePaneTab('browser')
    await flushPromises()
    w = mountPane()
    expect(w.find('[data-testid="stub-browser"]').exists()).toBe(true)

    ide.setSidePaneTab('wiki')
    await flushPromises()
    w = mountPane()
    expect(w.find('[data-testid="stub-wikipane"]').exists()).toBe(true)
  })

  it('四 tab 齐备（审查/浏览器/Wiki 引用/辅助对话）+ 关闭按钮收起', async () => {
    const ide = useIdeStore()
    ide.sidePane.open = true
    ide.sidePane.tab = 'wiki'
    const w = mountPane()
    for (const tab of ['review', 'browser', 'wiki', 'assistant']) {
      expect(w.find(`[data-testid="ide-sidepane-tab-${tab}"]`).exists()).toBe(true)
    }
    await w.find('.ide-sidepane__tab--close').trigger('click')
    expect(ide.sidePane.open).toBe(false)
  })

  it('辅助对话：输入追问 → 复制结构化 prompt（带类型前缀）', async () => {
    const ide = useIdeStore()
    ide.setSidePaneTab('assistant')
    const w = mountPane()
    const input = w.find('[data-testid="ide-sidepane-assistant-input"]')
    await input.setValue('这个模块的职责是什么')
    await w.find('[data-testid="ide-sidepane-assistant-copy"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('[ide.task.assistantKind_idea] 这个模块的职责是什么')
    expect(msgs.success).toHaveBeenCalled()
  })
})
