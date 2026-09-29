// B1 守门：项目能力包——工作区级页签 allow-list（Cascade 按需能力语义）。
// @vitest-environment jsdom
// 契约：未配置=全量默认（既有行为零变化）；配置后未声明页签不渲染；当前页签
// 被裁掉回落 files；选择器保存/恢复全量落 localStorage per workspace；
// 坏档/空档回退默认；至少保留一个页签。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('naive-ui', () => ({ useMessage: () => ({ error: () => {}, warning: () => {}, success: () => {}, info: () => {} }) }))

const ideState = reactive({
  workspace: '/ws/alpha' as string | null,
  sidePane: { open: true, tab: 'files', width: 480 },
  layout: { sidepane: { folded: false, maximized: false } },
  setSidePaneTab: vi.fn((tab: string) => { ideState.sidePane.tab = tab }),
  toggleSidePane: vi.fn(),
})
vi.mock('../store/ide', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../store/ide')>()
  return { ...orig, useIdeStore: () => ideState }
})

import IdeSidePane from '../views/IdeSidePane.vue'
import { loadCapabilityPack, saveCapabilityPack, packAllows } from '../utils/capabilityPack'

// IdeSidePane 依赖众多子面板（终端 dock 等），统一 mock 掉渲染面
vi.mock('../views/IdeFilesPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeGitPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeWikiPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeStoragePane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeMemoryPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeWhiteboardPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeKanbanPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeToolsPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeWorkflowPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeMcpPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeHooksPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeAutomationsPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../views/IdeSlashCommandsPane.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/hermes/DesktopBrowserView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/hermes/files/FileTree.vue', () => ({ default: { template: '<div />' } }))

describe('B1 项目能力包', () => {
  beforeEach(() => {
    localStorage.clear()
    ideState.workspace = '/ws/alpha'
    ideState.sidePane.tab = 'files'
    ideState.setSidePaneTab.mockClear()
  })

  it('纯函数：save/load per workspace；空档=回默认(null)；坏档回退；词表外键过滤', () => {
    saveCapabilityPack('/ws/alpha', ['files', 'terminal', 'bogus-tab'])
    expect(loadCapabilityPack('/ws/alpha')).toEqual(['files', 'terminal'])
    expect(loadCapabilityPack('/ws/beta')).toBeNull()
    saveCapabilityPack('/ws/beta', [])
    expect(loadCapabilityPack('/ws/beta')).toBeNull()
    localStorage.setItem('ide-capability-pack:/ws/gamma', '{bad json')
    expect(loadCapabilityPack('/ws/gamma')).toBeNull()
    expect(packAllows(null, 'terminal')).toBe(true)
    expect(packAllows(['files'], 'terminal')).toBe(false)
  })

  it('未配置=全量默认：全部页签按钮渲染（既有行为零变化）', async () => {
    const w = mount(IdeSidePane)
    expect(w.find('[data-testid="ide-sidepane-tab-terminal"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-sidepane-tab-automations"]').exists()).toBe(true)
    w.unmount()
  })

  it('配置后未声明页签不渲染；当前页签被裁掉回落 files', async () => {
    saveCapabilityPack('/ws/alpha', ['files', 'review'])
    const w = mount(IdeSidePane)
    await nextTick()
    expect(w.find('[data-testid="ide-sidepane-tab-terminal"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-sidepane-tab-files"]').exists()).toBe(true)
    // 当前在 terminal → 被裁 → 回落 files
    ideState.sidePane.tab = 'terminal'
    await nextTick()
    expect(ideState.sidePane.tab).toBe('files')
    w.unmount()
  })

  it('选择器：勾选裁剪→保存落档；恢复全量默认清档', async () => {
    const w = mount(IdeSidePane)
    await w.find('[data-testid="ide-sidepane-pack"]').trigger('click')
    expect(w.find('[data-testid="ide-sidepane-pack-editor"]').exists()).toBe(true)
    // 默认全勾；裁掉 terminal（勾选态切换）
    await w.find('[data-testid="ide-pack-check-terminal"]').trigger('change')
    await w.find('[data-testid="ide-pack-save"]').trigger('click')
    expect(loadCapabilityPack('/ws/alpha')).not.toContain('terminal')
    expect(w.find('[data-testid="ide-sidepane-tab-terminal"]').exists()).toBe(false)
    // 恢复全量
    await w.find('[data-testid="ide-sidepane-pack"]').trigger('click')
    await w.find('[data-testid="ide-pack-reset"]').trigger('click')
    expect(loadCapabilityPack('/ws/alpha')).toBeNull()
    expect(w.find('[data-testid="ide-sidepane-tab-terminal"]').exists()).toBe(true)
    w.unmount()
  })
})
