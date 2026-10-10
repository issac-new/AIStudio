// overlay/custom/client/ide/__tests__/wiki-pane.test.ts
// IdeWikiPane 组件守门（repo wiki 回归轮）：此前该组件在 side-pane 套件中被桩化，
// 行为零覆盖——目录遍历字段误用（entry.type vs isDir）静默丢失子目录页无人察觉。
// 夹具一律用真实 FileEntry 形状（isDir: boolean，无 type 字段）。
// Value: protects=子目录 wiki 页进列表+管线增量提示词带全路径; fails_when=遍历判据回退 entry.type（恒 undefined）或 isDir 误判; why_new=side-pane 套件将本组件桩化，本文件是唯一组件级覆盖; seam=none
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => (p && Object.values(p).length ? `${k}:${JSON.stringify(p)}` : k) }) }))
const msgs = { success: vi.fn(), error: vi.fn() }
vi.mock('naive-ui', () => ({ useMessage: () => msgs }))
vi.mock('@/components/hermes/chat/MarkdownRenderer.vue', () => ({ default: { name: 'MarkdownRenderer', props: ['content'], template: '<div class="md-stub">{{ content }}</div>' } }))

// files API 桩：夹具用 FileEntry 真实形状（isDir），listFiles(path, root)。
// noWikiWs 指定的工作区对一切路径抛 ENOENT（模拟 docs/wiki 缺失）。
const listCalls: string[] = []
const readCalls: string[] = []
let noWikiWs = ''
vi.mock('@/api/studio/files', () => ({
  listFiles: vi.fn(async (path: string, root?: string) => {
    listCalls.push(path)
    if (root === noWikiWs && noWikiWs) {
      const err = new Error('ENOENT: no such file or directory') as Error & { code?: string }
      err.code = 'ENOENT'
      throw err
    }
    if (path === 'docs/wiki') {
      return {
        entries: [
          { name: 'modules', path: 'docs/wiki/modules', isDir: true, size: 96, modTime: '2026-10-10T00:00:00.000Z' },
          { name: 'index.md', path: 'docs/wiki/index.md', isDir: false, size: 46, modTime: '2026-10-10T00:00:00.000Z' },
        ],
        path,
      }
    }
    if (path === 'docs/wiki/modules') {
      return {
        entries: [
          { name: 'ide-sidepane.md', path: 'docs/wiki/modules/ide-sidepane.md', isDir: false, size: 64, modTime: '2026-10-10T00:00:00.000Z' },
          { name: 'wiki-pipeline.md', path: 'docs/wiki/modules/wiki-pipeline.md', isDir: false, size: 64, modTime: '2026-10-10T00:00:00.000Z' },
        ],
        path,
      }
    }
    const err = new Error('ENOENT: no such file or directory') as Error & { code?: string }
    err.code = 'ENOENT'
    throw err
  }),
  readFile: vi.fn(async (path: string) => {
    readCalls.push(path)
    return { content: `# ${path}\n\n正文内容 wiki-fixture-body`, path, size: 64 }
  }),
}))

const chatSend = vi.fn(async () => {})
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ sendMessage: chatSend, activeSessionId: null, sessions: [] }),
}))

const writeText = vi.fn(async () => {})
Object.assign(navigator, { clipboard: { writeText } })

import IdeWikiPane from '../views/IdeWikiPane.vue'
import { useIdeStore } from '../store/ide'
import { buildWikiPipelinePrompt } from '../utils/wikiPipeline'

function mountPane() {
  return mount(IdeWikiPane)
}

describe('IdeWikiPane（repo wiki 回归轮）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    listCalls.length = 0
    readCalls.length = 0
    const ide = useIdeStore()
    ide.setWorkspace('/ws/demo')
  })

  it('子目录页进列表：isDir 目录被遍历，modules/ 两页 + 顶层 index 共 3 页（D1 回归）', async () => {
    const w = mountPane()
    await flushPromises()
    const items = w.findAll('[data-testid^="ide-wiki-page-"]')
    expect(items).toHaveLength(3)
    const names = items.map((x) => x.text())
    expect(names).toContain('index')
    expect(names).toContain('ide-sidepane')
    expect(names).toContain('wiki-pipeline')
    expect(listCalls).toEqual(['docs/wiki', 'docs/wiki/modules'])
    w.unmount()
  })

  it('docs/wiki 缺失（ENOENT）是空态不是错误；引用整册随空列表禁用（UX-2）', async () => {
    const ide = useIdeStore()
    noWikiWs = '/ws/empty'
    ide.setWorkspace('/ws/empty')
    const w = mountPane()
    await flushPromises()
    expect(w.text()).toContain('ide.wiki.empty')
    expect(w.text()).not.toContain('ide.wiki.loadFailed')
    // UX-2（回归轮遗留项）：空列表时引用整册禁用，避免点了没反馈
    expect(w.find('button[title="ide.wiki.referenceWiki"]').attributes('disabled')).toBeDefined()
    w.unmount()
  })

  it('未设工作区：引导态且不触发 files API', async () => {
    const ide = useIdeStore()
    ide.setWorkspace('')
    const w = mountPane()
    await flushPromises()
    expect(w.text()).toContain('ide.wiki.needWorkspace')
    expect(listCalls).toEqual([])
    w.unmount()
  })

  it('点击页签读正文：readFile 按路径取内容（子目录页可读）', async () => {
    const w = mountPane()
    await flushPromises()
    await w.find('[data-testid="ide-wiki-page-ide-sidepane"]').trigger('click')
    await flushPromises()
    expect(readCalls).toEqual(['docs/wiki/modules/ide-sidepane.md'])
    expect(w.find('.md-stub').text()).toContain('wiki-fixture-body')
    w.unmount()
  })

  it('引用当前页：剪贴板含页名/路径/正文', async () => {
    const w = mountPane()
    await flushPromises()
    await w.find('[data-testid="ide-wiki-page-wiki-pipeline"]').trigger('click')
    await flushPromises()
    await w.find('button[title="ide.wiki.referencePage"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('docs/wiki/modules/wiki-pipeline.md'))
    const arg = writeText.mock.calls[0][0] as string
    expect(arg).toContain('wiki-fixture-body')
    w.unmount()
  })

  it('引用整册：目录摘要（全部路径），不灌正文', async () => {
    const w = mountPane()
    await flushPromises()
    await w.find('button[title="ide.wiki.referenceWiki"]').trigger('click')
    const arg = writeText.mock.calls[0][0] as string
    expect(arg).toContain('docs/wiki/index.md')
    expect(arg).toContain('docs/wiki/modules/ide-sidepane.md')
    expect(arg).not.toContain('wiki-fixture-body')
    w.unmount()
  })

  it('生成 Wiki：复制生成提示词', async () => {
    const w = mountPane()
    await flushPromises()
    await w.find('[data-testid="ide-wiki-generate"]').trigger('click')
    const arg = writeText.mock.calls[0][0] as string
    expect(arg).toContain('docs/wiki/')
    expect(arg).toContain('index.md')
    w.unmount()
  })

  it('生成/更新管线：注入当前会话（增量模式带 3 个已存页）并展开会话列', async () => {
    const ide = useIdeStore()
    ide.layout.chat.folded = true
    const w = mountPane()
    await flushPromises()
    await w.find('[data-testid="ide-wiki-pipeline"]').trigger('click')
    expect(chatSend).toHaveBeenCalledTimes(1)
    const sent = chatSend.mock.calls[0][0] as string
    expect(sent).toBe(buildWikiPipelinePrompt({ existingPages: ['docs/wiki/modules/ide-sidepane.md', 'docs/wiki/modules/wiki-pipeline.md', 'docs/wiki/index.md'] }))
    expect(sent).toContain('模式：增量更新')
    expect(ide.layout.chat.folded).toBe(false)
    w.unmount()
  })
})
