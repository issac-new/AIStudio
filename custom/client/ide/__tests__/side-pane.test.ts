// overlay/custom/client/ide/__tests__/side-pane.test.ts
// 右侧辅助面板守门：开关状态、四 tab 切换渲染、辅助对话追问复制。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'fs'
import { resolve } from 'path'

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
vi.mock('../views/IdeStoragePane.vue', () => ({ default: { name: 'IdeStoragePane', template: '<div data-testid="stub-storage" />' } }))
vi.mock('../views/IdeMemoryPane.vue', () => ({ default: { name: 'IdeMemoryPane', template: '<div data-testid="stub-memory" />' } }))
vi.mock('../views/IdeTerminalDock.vue', () => ({ default: { name: 'IdeTerminalDock', template: '<div data-testid="stub-termdock" />' } }))
// 查看文件页签（09-20 自左侧栏右移）：FileTree 依赖链挡为透传桩
vi.mock('../views/IdeFilesPane.vue', () => ({ default: { name: 'IdeFilesPane', template: '<div data-testid="stub-filespane" />' } }))

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

  it('v12.6 默认开（files 页签）；关后不渲染；open 后按 tab 渲染对应面板', async () => {
    const ide = useIdeStore()
    let w = mountPane()
    // v12.6 用户裁定：三栏打开时默认显示（此前默认收起）
    expect(w.find('[data-testid="ide-sidepane"]').exists()).toBe(true)
    expect(ide.sidePane.tab).toBe('files')
    ide.sidePane.open = false
    await flushPromises()
    w = mountPane()
    expect(w.find('[data-testid="ide-sidepane"]').exists()).toBe(false)
    ide.sidePane.open = true

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

  it('分组整合（2026-10-04 用户裁定）：默认编码组 3 签、全部组 17 签齐备、外部深链自动切组、关闭收起', async () => {
    const ide = useIdeStore()
    ide.sidePane.open = true
    ide.sidePane.tab = 'wiki'
    let w = mountPane()
    // wiki 不在默认 code 组 → watch 兜底切到 knowledge 组（深链语义）
    await flushPromises()
    expect(w.find('[data-testid="ide-sidepane-group-knowledge"]').exists()).toBe(true)
    // 默认组态：code 组恰 3 签，files 居首
    ide.sidePane.tab = 'files'
    w = mountPane()
    await flushPromises()
    let tabs = w.findAll('[data-testid^="ide-sidepane-tab-"]')
    expect(tabs).toHaveLength(3)
    expect(tabs[0].attributes('data-testid')).toBe('ide-sidepane-tab-files')
    // 全部组：17 签齐备（tab 本体与 testid 不因分组丢失）
    await w.find('[data-testid="ide-sidepane-group-all"]').trigger('click')
    tabs = w.findAll('[data-testid^="ide-sidepane-tab-"]')
    expect(tabs).toHaveLength(17)
    for (const tab of ['files', 'review', 'browser', 'wiki', 'assistant', 'storage', 'memory', 'terminal']) {
      expect(w.find(`[data-testid="ide-sidepane-tab-${tab}"]`).exists()).toBe(true)
    }
    await w.find('.ide-sidepane__tab--close').trigger('click')
    expect(ide.sidePane.open).toBe(false)
  })

  it('files 页签渲染 IdeFilesPane（查看文件/Git 基于任务会话与项目）', async () => {
    const ide = useIdeStore()
    ide.setSidePaneTab('files')
    const w = mountPane()
    // 组件传的 data-testid 覆盖桩自带 testid（attr 合并规则），断言覆盖值
    expect(w.find('[data-testid="ide-sidepane-files"]').exists()).toBe(true)
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

  it('UX-3（回归轮遗留项）：最大化后 is-max 类恰好一次（父级重复绑定已去）', async () => {
    const ide = useIdeStore()
    ide.sidePane.open = true
    const w = mountPane()
    ide.toggleMax('sidepane')
    await flushPromises()
    const classes = w.find('[data-testid="ide-sidepane"]').classes()
    expect(classes).toContain('is-max')
    expect(classes.filter((c) => c === 'is-max')).toHaveLength(1)
    ide.toggleMax('sidepane')
    await flushPromises()
    expect(w.find('[data-testid="ide-sidepane"]').classes()).not.toContain('is-max')
  })
})

// ── 回归轮遗留项源码级守门（jsdom 不加载 scoped SCSS，样式契约走源断言）──
describe('IdeSidePane 样式契约（UX-1）+ IdeShell 冗余类绑定（UX-3）', () => {
  const sidePaneSrc = readFileSync(resolve(__dirname, '../views/IdeSidePane.vue'), 'utf8')
  const shellSrc = readFileSync(resolve(__dirname, '../views/IdeShell.vue'), 'utf8')

  it('UX-1：页签行 flex-wrap + 页签钮不可收缩（17 签不再挤瘪 max/close）', () => {
    const tabsBlock = sidePaneSrc.match(/\.ide-sidepane__tabs\s*\{[^}]*\}/)?.[0] ?? ''
    expect(tabsBlock, 'tabs 行须 flex-wrap: wrap').toContain('flex-wrap: wrap')
    const tabBlock = sidePaneSrc.match(/\.ide-sidepane__tab\s*\{[^}]*\}/)?.[0] ?? ''
    expect(tabBlock, '页签钮须 flex-shrink: 0').toContain('flex-shrink: 0')
  })

  it('UX-3：IdeShell 不再向 IdeSidePane 传 is-max 类（子根自绑，父传即重复）', () => {
    const usage = shellSrc.match(/<IdeSidePane[^>]*>/g) ?? []
    expect(usage.length).toBeGreaterThanOrEqual(1)
    for (const tag of usage) expect(tag).not.toContain('is-max')
  })
})
