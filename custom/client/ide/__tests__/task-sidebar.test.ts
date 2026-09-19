// overlay/custom/client/ide/__tests__/task-sidebar.test.ts
// 富侧栏守门：置顶/workspace 分组、搜索过滤、切换/新建/置顶/归档动作、归档区加载与恢复。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

const msgs = { success: vi.fn(), error: vi.fn() }
vi.mock('naive-ui', () => ({
  useMessage: () => msgs,
  NDropdown: { name: 'NDropdown', template: '<div class="stub-dropdown"><slot /></div>' },
  NTooltip: { name: 'NTooltip', template: '<div class="stub-tooltip"><slot name="trigger" /><slot /></div>' },
  NPopconfirm: { name: 'NPopconfirm', template: '<div class="stub-popconfirm"><slot /></div>' },
}))

const { switchSession, newChat, loadSessions, archiveSession, deleteSession } = vi.hoisted(() => ({
  switchSession: vi.fn(async () => {}),
  newChat: vi.fn(() => ({})),
  loadSessions: vi.fn(async () => {}),
  archiveSession: vi.fn(async () => true),
  deleteSession: vi.fn(async () => true),
}))

const sessions = [
  { id: 's-pin-a', title: '置顶任务A', workspace: '/lab/ncwk', updatedAt: Date.now() - 60_000, createdAt: 0 },
  { id: 's-pin-b', title: '置顶任务B', workspace: '/lab/other', updatedAt: Date.now() - 3_600_000, createdAt: 0 },
  { id: 's-active', title: '当前任务', workspace: '/lab/ncwk', updatedAt: Date.now(), createdAt: 0 },
  { id: 's-other', title: '另一个仓库的任务', workspace: '/lab/other', updatedAt: Date.now() - 10_000, createdAt: 0 },
  { id: 's-none', title: '无工作区任务', workspace: null, updatedAt: Date.now() - 5_000, createdAt: 0 },
  { id: 's-extra1', title: '填充1', workspace: '/lab/ncwk', updatedAt: 1, createdAt: 0 },
  { id: 's-extra2', title: '填充2', workspace: '/lab/ncwk', updatedAt: 1, createdAt: 0 },
]

vi.mock('@/stores/hermes/chat', () => ({
  // 组件对 Session 仅做 type import（编译期擦除），无需真实模块图
  useChatStore: () => ({
    sessions,
    activeSessionId: 's-active',
    sessionProfileFilter: null,
    sessionsLoaded: true,
    switchSession,
    newChat,
    loadSessions,
    archiveSession,
    deleteSession,
  }),
}))

const { togglePinned } = vi.hoisted(() => ({ togglePinned: vi.fn() }))
vi.mock('../utils/pins', () => ({
  useIdePins: () => ({
    pinnedIds: ['s-pin-a', 's-pin-b'],
    isPinned: (id: string) => id === 's-pin-a' || id === 's-pin-b',
    togglePinned,
    onChange: () => () => {},
  }),
}))

const { unarchiveSession, fetchSessionCategories, createSessionCategory, setSessionCategory, exportSession } = vi.hoisted(() => ({
  unarchiveSession: vi.fn(async () => true),
  fetchSessionCategories: vi.fn(async () => [{ id: 7, name: '发布批', profile: null, sort_order: 0 }]),
  createSessionCategory: vi.fn(async (name: string) => ({ id: 9, name, profile: null, sort_order: 0 })),
  setSessionCategory: vi.fn(async () => {}),
  exportSession: vi.fn(async () => {}),
}))
vi.mock('@/api/studio/sessions', () => ({
  unarchiveSession,
  fetchSessionCategories,
  createSessionCategory,
  setSessionCategory,
  exportSession,
}))

const archived = [
  { id: 'arch-1', title: '已归档任务', last_active: 1758100000, workspace: '/lab/ncwk' },
]
vi.mock('../api/archivedSessions', () => ({
  fetchArchivedSessions: vi.fn(async () => archived),
}))

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))
// 文件视图嵌上游 FileTree，其依赖链拉真实 router/api——测试挡为透传桩
vi.mock('../views/IdeGitPane.vue', () => ({ default: { name: 'IdeGitPane', template: '<div class=\"stub-gitpane\" data-testid=\"stub-gitpane\" />' } }))
vi.mock('@/components/hermes/files/FileTree.vue', () => ({
  default: { name: 'FileTree', template: '<div class="stub-filetree" data-testid="stub-filetree" />' },
}))

import IdeTaskSidebar from '../views/IdeTaskSidebar.vue'
import { useIdeStore } from '../store/ide'

function mountSidebar() {
  return mount(IdeTaskSidebar)
}

describe('IdeTaskSidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('置顶区渲染 pinnedIds 中的会话；其余按 workspace 分组', async () => {
    const w = mountSidebar()
    await flushPromises()
    const pinned = w.find('[data-testid="ide-task-pinned"]')
    expect(pinned.exists()).toBe(true)
    expect(pinned.findAll('[data-testid^="ide-task-item-"]').length).toBe(2)

    // workspace 分组：ncwk / other / 默认（无工作区）
    expect(w.find('[data-testid="ide-task-group-ncwk"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-task-group-other"]').exists()).toBe(true)
    // 无工作区组：label 由 workspaceLabel(t, null) 给出，mock t 下即 key 原文
    expect(w.find('[data-testid="ide-task-group-ide.task.defaultGroup"]').exists()).toBe(true)

    // 组内计数：ncwk = active + extra1 + extra2
    const ncwk = w.find('[data-testid="ide-task-group-ncwk"]')
    expect(ncwk.findAll('[data-testid^="ide-task-item-"]').length).toBe(3)

    // 活跃会话高亮
    expect(w.find('[data-testid="ide-task-item-s-active"]').classes()).toContain('is-active')
  })

  it('搜索过滤任务（标题与 workspace 名）', async () => {
    const w = mountSidebar()
    await flushPromises()
    const input = w.find('[data-testid="ide-task-filter"]')
    expect(input.exists()).toBe(true)
    await input.setValue('另一个仓库')
    await flushPromises()
    // 非置顶区只剩 other 组
    expect(w.find('[data-testid="ide-task-group-other"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-task-group-ncwk"]').exists()).toBe(false)
    // 置顶区被过滤为空（标题/workspace 均不匹配）
    expect(w.find('[data-testid="ide-task-pinned"]').exists()).toBe(false)
  })

  it('点击任务切换会话；新建任务用 /ide 配方调 newChat', async () => {
    const w = mountSidebar()
    await flushPromises()
    await w.find('[data-testid="ide-task-item-s-other"] .ide-taskbar__item-main').trigger('click')
    expect(switchSession).toHaveBeenCalledWith('s-other')

    await w.find('[data-testid="ide-task-new"]').trigger('click')
    expect(newChat).toHaveBeenCalledWith(expect.objectContaining({
      codingAgentId: 'codex',
      codingAgentMode: 'global',
      source: 'coding_agent',
    }))
  })

  it('置顶开关走 sessionBrowserPrefs（与历史页全局一致）', async () => {
    const w = mountSidebar()
    await flushPromises()
    // 下拉被 stub 成透传，直接调组件方法等价验证接线
    const vm = w.vm as any
    await vm.onSessionAction('pin', sessions[2])
    expect(togglePinned).toHaveBeenCalledWith('s-active')
  })

  it('归档动作调 chatStore.archiveSession 并刷新归档区', async () => {
    const w = mountSidebar()
    await flushPromises()
    const vm = w.vm as any
    await vm.onSessionAction('archive', sessions[3])
    expect(archiveSession).toHaveBeenCalledWith('s-other')
  })

  it('归档区展开时加载列表；恢复调 unarchiveSession 并刷新活跃列表', async () => {
    const w = mountSidebar()
    await flushPromises()
    const vm = w.vm as any
    await vm.toggleArchived()
    await flushPromises()
    expect(w.find('[data-testid="ide-task-archived-arch-1"]').exists()).toBe(true)

    await vm.onUnarchive('arch-1')
    expect(unarchiveSession).toHaveBeenCalledWith('arch-1')
    expect(loadSessions).toHaveBeenCalled()
    expect(w.find('[data-testid="ide-task-archived-arch-1"]').exists()).toBe(false)
  })

  it('底部保留 ⇄ 驾驶舱入口（ide-nav-cockpit testid 延续）', async () => {
    const w = mountSidebar()
    await flushPromises()
    expect(w.find('[data-testid="ide-nav-cockpit"]').exists()).toBe(true)
  })

  it('任务/文件双视图：切文件渲染 FileTree+双页签，切回任务恢复列表', async () => {
    const w = mountSidebar()
    await flushPromises()
    expect(w.find('[data-testid="stub-filetree"]').exists()).toBe(false)
    await w.find('[data-testid="ide-task-view-files"]').trigger('click')
    expect(w.find('[data-testid="stub-filetree"]').exists()).toBe(true)
    // 文件/Git 双页签在查看文件视图内
    expect(w.find('[data-testid="ide-files-tab-tree"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-files-tab-git"]').exists()).toBe(true)
    await w.find('[data-testid="ide-task-view-tasks"]').trigger('click')
    expect(w.find('[data-testid="stub-filetree"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-task-pinned"], [data-testid^="ide-task-group-"]').exists()).toBe(true)
  })

  it('点击任务切换会话时文件视图 root 跟随任务 workspace', async () => {
    const w = mountSidebar()
    await flushPromises()
    // 切到文件视图
    await w.find('[data-testid="ide-task-view-files"]').trigger('click')
    // 回任务视图点 other 任务（workspace=/lab/other）
    await w.find('[data-testid="ide-task-view-tasks"]').trigger('click')
    await w.find('[data-testid="ide-task-item-s-other"] .ide-taskbar__item-main').trigger('click')
    expect(switchSession).toHaveBeenCalledWith('s-other')
    const vm = w.vm as any
    expect(vm.filesWorkspace).toBe('/lab/other')
  })

  it('organize 三模式：grouped 按 category 分组渲染', async () => {
    const w = mountSidebar()
    await flushPromises()
    // project（默认）= workspace 分组
    expect(w.find('[data-testid="ide-task-group-ncwk"]').exists()).toBe(true)
    // 切 grouped：出现 category「发布批」分组（s-pin-b 无 categoryId → 未分组桶）
    await w.find('[data-testid="ide-task-organize-grouped"]').trigger('click')
    expect(w.find('[data-testid="ide-task-group-发布批"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-task-group-ide.task.ungrouped"]').exists()).toBe(true)
    // 切 timeline：单组平铺
    await w.find('[data-testid="ide-task-organize-timeline"]').trigger('click')
    expect(w.find('[data-testid="ide-task-group-ide.task.timeline"]').exists()).toBe(true)
  })

  it('移动到分组调 setSessionCategory；分享导出调 exportSession', async () => {
    const w = mountSidebar()
    await flushPromises()
    const vm = w.vm as any
    await vm.onSessionAction('move-cat-7', sessions[2])
    expect(setSessionCategory).toHaveBeenCalledWith('s-active', 7)
    await vm.onSessionAction('move-none', sessions[2])
    expect(setSessionCategory).toHaveBeenCalledWith('s-active', null)
    await vm.onSessionAction('share', sessions[3])
    expect(exportSession).toHaveBeenCalledWith('s-other', 'full', 'json')
  })

  it('新建分组走 createSessionCategory 并刷新列表', async () => {
    const w = mountSidebar()
    await flushPromises()
    const vm = w.vm as any
    vm.newGroupDraft = '新分组'
    await vm.createGroup()
    expect(createSessionCategory).toHaveBeenCalledWith('新分组')
    expect(vm.categories.some((c: any) => c.id === 9)).toBe(true)
  })

  it('feature 条含终端入口（点击开 sidePane 终端页签）', async () => {
    const w = mountSidebar()
    await flushPromises()
    expect(w.find('[data-testid="ide-feat-terminal"]').exists()).toBe(true)
    await w.find('[data-testid="ide-feat-terminal"]').trigger('click')
    const ide = useIdeStore()
    expect(ide.sidePane.open).toBe(true)
    expect(ide.sidePane.tab).toBe('terminal')
  })

  it('自动化入口跳 JobsView', async () => {
    const w = mountSidebar()
    await flushPromises()
    await w.find('[data-testid="ide-task-automations"]').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'hermes.jobs' })
  })
})
