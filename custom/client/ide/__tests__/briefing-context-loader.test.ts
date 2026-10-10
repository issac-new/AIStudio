// overlay/custom/client/ide/__tests__/briefing-context-loader.test.ts
// 简报上下文文件装载器回归（D3）：IdeShell.loadBriefingContextFiles 曾用
// entry.type !== 'file'（FileEntry 无 type 字段，恒真）把所有条目跳过，
// 功能静默失效且无测试覆盖（既有 briefing 套件只测展示组件 props）。
// 本文件挂真 IdeShell（壳层既有桩范式），files API 桩用真实 FileEntry 形状。
// Value: protects=简报上下文文件按名归类装载且目录条目不误收; fails_when=装载器判据回退 entry.type（恒跳过→永远空列表）或漏 isDir 守卫（目录被当文件收）; why_new=既有套件仅测 TaskBriefingPanel props，装载循环零覆盖; seam=none
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }), createRouter: () => ({ push: vi.fn() }), createWebHistory: () => ({}), createWebHashHistory: () => ({}) }))

// files API 桩：真实 FileEntry 形状（isDir，无 type 字段）
vi.mock('@/api/studio/files', () => ({
  listFiles: vi.fn(async (path: string) => {
    if (path === '') {
      return {
        entries: [
          { name: '需求-支付渠道.md', path: '需求-支付渠道.md', isDir: false, size: 100, modTime: '2026-10-10T00:00:00.000Z' },
          { name: '概设-总览.md', path: '概设-总览.md', isDir: false, size: 100, modTime: '2026-10-10T00:00:00.000Z' },
          // 名字命中归类且带 .md 后缀的目录：必须被 isDir 守卫跳过
          { name: '排期-归档目录.md', path: '排期-归档目录.md', isDir: true, size: 96, modTime: '2026-10-10T00:00:00.000Z' },
          { name: 'README.md', path: 'README.md', isDir: false, size: 10, modTime: '2026-10-10T00:00:00.000Z' },
        ],
        path,
      }
    }
    if (path === 'docs') {
      return {
        entries: [
          { name: '概设-网关.md', path: 'docs/概设-网关.md', isDir: false, size: 100, modTime: '2026-10-10T00:00:00.000Z' },
          { name: 'notes.txt', path: 'docs/notes.txt', isDir: false, size: 10, modTime: '2026-10-10T00:00:00.000Z' },
        ],
        path,
      }
    }
    return { entries: [], path }
  }),
  readFile: vi.fn(async () => ({ content: '', path: '', size: 0 })),
}))

vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    setRuntimeMode: vi.fn(),
    sessions: [{ id: 's1', title: 't' }], activeSessionId: 's1', sessionsLoaded: true,
    sessionProfileFilter: null, loadSessions: vi.fn(async () => {}),
    isRunActive: false, abortState: null,
    getSubagentStream: vi.fn(() => null),
    sendMessage: vi.fn(async () => {}),
  }),
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({
  useCockpitStore: () => ({ openRunTrace: vi.fn() }),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({
    tasks: [{ id: 'T-9', title: '支付渠道接入', status: 'review', session_id: null }],
    selectedBoard: 'default',
    setBoard: vi.fn(),
  }),
}))
vi.mock('@/api/hermes/kanban', () => ({
  listBoards: vi.fn(async () => []),
  listTasks: vi.fn(async () => []),
}))
vi.mock('@/api/client', () => ({
  request: vi.fn(async () => ({})),
  getApiKey: () => 'test-key',
  getBaseUrlValue: () => '',
}))
vi.mock('../components/TaskBriefingPanel.vue', () => ({
  default: { name: 'TaskBriefingPanel', props: ['task', 'raci', 'git', 'collab', 'workflow', 'contextFiles'], template: '<aside class="brief-stub" />' },
}))
vi.mock('../api/git', () => ({
  ideGitApi: { status: vi.fn(async () => null), log: vi.fn(async () => ({ commits: [] })) },
}))
vi.mock('../views/IdeTaskSidebar.vue', () => ({ default: { name: 'IdeTaskSidebar', template: '<aside class="ide-taskbar" />' } }))
vi.mock('../views/IdeChatPane.vue', () => ({ default: { name: 'IdeChatPane', template: '<div class="ide-chat-stub" />' } }))
vi.mock('../views/IdeSidePane.vue', () => ({ default: { name: 'IdeSidePane', template: '<aside class="ide-sidepane" />' } }))
vi.mock('../views/IdeStatusBar.vue', () => ({ default: { name: 'IdeStatusBar', template: '<div />' } }))
vi.mock('../components/IdeCommandPalette.vue', () => ({ default: { name: 'IdeCommandPalette', template: '<div />' } }))
vi.mock('../components/IdeTaskContextBar.vue', () => ({ default: { name: 'IdeTaskContextBar', template: '<div class="ide-taskctx-stub" />' } }))
vi.mock('@/custom/cockpit/components/CockpitRunTraceModal.vue', () => ({ default: { name: 'CockpitRunTraceModal', template: '<div />' } }))
vi.mock('@/custom/ia2/components/IaGlobalTop.vue', () => ({ default: { name: 'IaGlobalTop', template: '<div class="ia-gtop-stub" />' } }))

import IdeShell from '../views/IdeShell.vue'
import { useIdeStore } from '../store/ide'

describe('IdeShell 简报上下文文件装载（D3 回归）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('按名归类装载：根目录与 docs/ 命中文件入列，目录条目不误收', async () => {
    const ide = useIdeStore()
    const w = mount(IdeShell, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    // 挂载后设置（挂载时 route.query.task 的 immediate watch 会把预置任务清空）
    ide.setWorkspace('/ws/demo')
    ide.setActiveTask('T-9')
    await flushPromises()
    // 简报抽屉默认收起：打开后才渲染 TaskBriefingPanel
    await w.find('[data-testid="ide-briefing-toggle"]').trigger('click')
    await flushPromises()
    await w.vm.$nextTick()
    const ide2 = useIdeStore()
    const panel = w.findComponent({ name: 'TaskBriefingPanel' })
    expect(panel.exists()).toBe(true)
    const files = panel.props('contextFiles') as Array<{ path: string; kind: string }>
    const paths = files.map((f) => f.path)
    // 命中归类模式的三个文件（README/notes 不命中模式）
    expect(paths).toContain('需求-支付渠道.md')
    expect(paths).toContain('概设-总览.md')
    expect(paths).toContain('docs/概设-网关.md')
    // isDir 守卫：名字带 .md 的目录不得入列
    expect(paths).not.toContain('排期-归档目录.md')
    // 归类正确
    expect(files.find((f) => f.path === '需求-支付渠道.md')?.kind).toBe('req')
    expect(files.find((f) => f.path === 'docs/概设-网关.md')?.kind).toBe('design')
    w.unmount()
  })

  it('未设工作区：装载为空不报错', async () => {
    const ide = useIdeStore()
    const w = mount(IdeShell, { global: { stubs: { Teleport: true } } })
    await flushPromises()
    ide.setActiveTask('T-9')
    await flushPromises()
    await w.find('[data-testid="ide-briefing-toggle"]').trigger('click')
    await flushPromises()
    const panel = w.findComponent({ name: 'TaskBriefingPanel' })
    expect(panel.exists()).toBe(true)
    expect(panel.props('contextFiles')).toEqual([])
    w.unmount()
  })
})
