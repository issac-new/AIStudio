// overlay/custom/client/ide/__tests__/wiki-pane-v2.test.ts
// IdeWikiPane v2 深化守门（2026-10-10 wiki 深化轮）：陈旧度状态行（meta 边车 × git HEAD）、
// 列表过滤与分组、生成配置 round-trip（settings-layers user 层持久化）、管线携带 meta+config。
// Value: protects=meta/git 对比的徽标逻辑+配置持久化+过滤分组不回退; fails_when=状态行常显/常隐、配置不落盘、过滤失效; why_new=v2 新增面零既有覆盖; seam=none
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string, p?: Record<string, unknown>) => (p && Object.values(p).length ? `${k}:${JSON.stringify(p)}` : k), locale: { value: 'zh' } }) }))
const msgs = { success: vi.fn(), error: vi.fn() }
vi.mock('naive-ui', () => ({ useMessage: () => msgs }))
vi.mock('@/components/hermes/chat/MarkdownRenderer.vue', () => ({ default: { name: 'MarkdownRenderer', props: ['content'], template: '<div class="md-stub">{{ content }}</div>' } }))

// files API 桩：目录两页（顶层 index + modules/auth）+ front matter 正文；
// metaJ 决定 .wiki-meta.json 读取结果（null=抛 404）。
const META_JSON = JSON.stringify({
  version: 1,
  generatedAt: '2026-10-09T08:00:00.000Z',
  commitId: 'abc1234',
  dirty: false,
  pages: [{ path: 'docs/wiki/modules/auth.md', hash: 'aabb', sources: ['src/auth/'] }],
  agentsBlockAt: '2026-10-09T08:00:00.000Z',
})
let metaJ: string | null = META_JSON
vi.mock('@/api/studio/files', () => ({
  listFiles: vi.fn(async (path: string) => {
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
          { name: 'auth.md', path: 'docs/wiki/modules/auth.md', isDir: false, size: 64, modTime: '2026-10-10T00:00:00.000Z' },
        ],
        path,
      }
    }
    const err = new Error('ENOENT') as Error & { code?: string }
    err.code = 'ENOENT'
    throw err
  }),
  readFile: vi.fn(async (path: string) => {
    if (path === 'docs/wiki/.wiki-meta.json') {
      if (metaJ === null) {
        const err = new Error('404 not found') as Error & { code?: string }
        err.code = 'ENOENT'
        throw err
      }
      return { content: metaJ, path, size: 64 }
    }
    const fm = path.endsWith('index.md')
      ? '---\ntitle: 首页\norder: 0\ngenerated_at: 2026-10-09T08:00:00Z\ncommit: abc1234\n---\n\n# 首页\n'
      : '---\ntitle: 认证模块\norder: 3\nmodule: auth\ngenerated_at: 2026-10-09T08:00:00Z\ncommit: abc1234\n---\n\n# 认证模块\n'
    return { content: fm, path, size: 64 }
  }),
}))

const chatSend = vi.fn(async () => {})
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({ sendMessage: chatSend, activeSessionId: null, sessions: [] }),
}))

// git 桩：head/changes 可变，模拟「HEAD 前进 / 干净」与「一致 / 脏」
const gitState = { head: 'abc1234', changes: [] as Array<{ path: string }> }
vi.mock('../api/git', () => ({
  ideGitApi: {
    log: vi.fn(async () => ({ commits: [{ hash: gitState.head, short: gitState.head.slice(0, 7), isHead: true }] })),
    status: vi.fn(async () => ({ repoRoot: '/ws/demo', branch: 'main', upstream: null, ahead: 0, behind: 0, detached: false, changes: gitState.changes })),
  },
}))

import IdeWikiPane from '../views/IdeWikiPane.vue'
import { useIdeStore } from '../store/ide'
import { buildWikiPipelinePrompt } from '../utils/wikiPipeline'

function mountPane() {
  return mount(IdeWikiPane)
}

describe('IdeWikiPane v2（深化轮）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    metaJ = META_JSON
    gitState.head = 'abc1234'
    gitState.changes = []
    const ide = useIdeStore()
    ide.setWorkspace('/ws/demo')
  })

  it('meta+HEAD 前进 → 陈旧徽标与「更新 Wiki」按钮出现；一致+干净 → upToDate', async () => {
    gitState.head = 'fff9999'
    let w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-wiki-status"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-wiki-stale-badge"]').exists()).toBe(true)
    expect(w.text()).toContain('Wiki 落后于代码')
    expect(w.find('[data-testid="ide-wiki-refresh"]').exists()).toBe(true)
    w.unmount()

    gitState.head = 'abc1234'
    w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-wiki-status"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-wiki-stale-badge"]').exists()).toBe(false)
    expect(w.text()).toContain('Wiki 与生成基线一致')
    w.unmount()
  })

  it('工作区脏（未提交变更）→ dirty 徽标；meta 缺失 → 状态行整体隐藏', async () => {
    gitState.changes = [{ path: 'src/a.ts' }]
    let w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-wiki-dirty-badge"]').exists()).toBe(true)
    expect(w.text()).toContain('未提交变更')
    w.unmount()

    metaJ = null
    gitState.changes = []
    w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-wiki-status"]').exists()).toBe(false)
    w.unmount()
  })

  it('分组渲染（顶层/模块页）+ front matter title 显示 + order 排序', async () => {
    const w = mountPane()
    await flushPromises()
    expect(w.find('[data-testid="ide-wiki-group-top"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-wiki-group-modules"]').exists()).toBe(true)
    // front matter title 优先于文件名显示
    expect(w.text()).toContain('认证模块')
    expect(w.text()).toContain('首页')
    // index 置顶：顶层组第一项是首页
    const topItems = w.findAll('[data-testid="ide-wiki-group-top"] + .ide-wiki__item, [data-testid="ide-wiki-group-top"] ~ .ide-wiki__item')
    expect(topItems[0].text()).toContain('首页')
    w.unmount()
  })

  it('过滤框：按页名/路径过滤列表', async () => {
    const w = mountPane()
    await flushPromises()
    await w.find('[data-testid="ide-wiki-filter"]').setValue('auth')
    await flushPromises()
    const visible = w.findAll('[data-testid^="ide-wiki-page-"]')
    expect(visible).toHaveLength(1)
    expect(visible[0].text()).toContain('认证模块')
    w.unmount()
  })

  it('配置 round-trip：面板控件写 store 并落 settings-layers，重挂载后保留', async () => {
    let w = mountPane()
    await flushPromises()
    await w.find('[data-testid="ide-wiki-cfg-toggle"]').trigger('click')
    await w.find('[data-testid="ide-wiki-cfg-lang-en"]').trigger('click')
    await w.find('[data-testid="ide-wiki-cfg-diagrams"]').trigger('click') // true → false
    await w.find('[data-testid="ide-wiki-cfg-maxpages"]').setValue('6')
    await w.find('[data-testid="ide-wiki-cfg-maxpages"]').trigger('change')
    w.unmount()

    // 新 pinia 实例重挂载：genConfig 从 settings-layers 读回
    setActivePinia(createPinia())
    const ide = useIdeStore()
    ide.setWorkspace('/ws/demo')
    expect(ide.genConfig.language).toBe('en')
    expect(ide.genConfig.diagrams).toBe(false)
    expect(ide.genConfig.maxPages).toBe(6)
    w = mountPane()
    await flushPromises()
    // 管线提示词携带新配置与 meta（meta 驱动增量分支）
    await w.find('[data-testid="ide-wiki-pipeline"]').trigger('click')
    await flushPromises()
    const sent = chatSend.mock.calls[0][0] as string
    expect(sent).toContain('English')
    expect(sent).toContain('Mermaid 图：关闭')
    expect(sent).toContain('模式：增量更新（meta 驱动')
    expect(sent).toBe(buildWikiPipelinePrompt({
      meta: {
        version: 1, generatedAt: '2026-10-09T08:00:00.000Z', commitId: 'abc1234', dirty: false,
        pages: [{ path: 'docs/wiki/modules/auth.md', hash: 'aabb', sources: ['src/auth/'] }],
        agentsBlockAt: '2026-10-09T08:00:00.000Z',
      },
      existingPages: ['docs/wiki/modules/auth.md', 'docs/wiki/index.md'],
      config: { language: 'en', diagrams: false, maxPages: 6 },
    }))
    w.unmount()
  })

  it('页头显示 front matter 生成时间与基线 commit', async () => {
    const w = mountPane()
    await flushPromises()
    await w.find('[data-testid="ide-wiki-page-auth"]').trigger('click')
    await flushPromises()
    const pm = w.find('[data-testid="ide-wiki-pagemeta"]')
    expect(pm.exists()).toBe(true)
    expect(pm.text()).toContain('2026-10-09T08:00:00Z')
    expect(pm.text()).toContain('abc1234')
    w.unmount()
  })
})

describe('源码直断守门（防漂移）', () => {
  it('IdeMentionPicker SOURCES 含 wiki 源与匹配预览（@wiki 消费闭环不回退）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../components/IdeMentionPicker.vue'), 'utf8')
    expect(src).toContain("kind: 'wiki'")
    expect(src).toContain('wikiMatch')
    expect(src).toContain('ide-mention-wiki-hint')
  })

  it('IdeWikiPane 装载时同步 ide.setWikiPages（picker 匹配预览的数据源）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const src = readFileSync(resolve(__dirname, '../views/IdeWikiPane.vue'), 'utf8')
    expect(src).toContain('ide.setWikiPages(collected)')
  })
})
