// @vitest-environment jsdom
// 深链自动展开简报守门（run6 复盘 UX 缺口立项）：ide?task=<id> 到达时除绑定任务
// 维度外，任务简报抽屉（data-testid=ide-briefing-drawer）须自动展开——跳转意图
// 即"看这个任务"；无 task 参数时不得自动展开（保留用户手动开合权）。
// 脚手架对齐 briefing-cross-board.test.ts（store/api 全替身，重组件 stub）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { reactive } from 'vue'

const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh: {} } })

const routeState = reactive({ query: {} as Record<string, string>, fullPath: '/ide' })
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRoute: () => routeState }
})

const ideState = reactive({ activeTaskId: null as string | null, dimension: 'workspace' })
const kanbanState = reactive({
  tasks: [] as Array<{ id: string; title: string; status: string; session_id?: string | null }>,
  selectedBoard: 'default',
})
vi.mock('@/custom/ide/store/ide', () => ({
  useIdeStore: () => ({
    get activeTaskId() { return ideState.activeTaskId },
    setActiveTask: (v: string | null) => { ideState.activeTaskId = v },
    setDimension: (d: string) => { ideState.dimension = d },
    layout: { sidebar: { maximized: false }, chat: { maximized: false }, sidepane: { maximized: false } },
    sidePane: { open: true, active: 'files' },
    togglePalette: () => {},
    paletteOpen: false,
  }),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({
    get tasks() { return kanbanState.tasks },
    get selectedBoard() { return kanbanState.selectedBoard },
    setBoard: (b: string) => { kanbanState.selectedBoard = b },
  }),
}))
const listBoardsMock = vi.fn()
const listTasksMock = vi.fn()
vi.mock('@/api/hermes/kanban', () => ({
  listBoards: (...a: unknown[]) => listBoardsMock(...a),
  listTasks: (...a: unknown[]) => listTasksMock(...a),
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: () => ({}) }))
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: () => ({ scheduleOpen: false, openSchedule: () => {}, closeSchedule: () => {} }) }))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ sessions: [], setRuntimeMode: vi.fn(), loadSessions: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/files', () => ({ useFilesStore: () => ({ openEditor: vi.fn() }) }))
vi.mock('@/api/studio/files', () => ({ listFiles: vi.fn(async () => ({ entries: [], path: '' })) }))
vi.mock('@/custom/ide/api/git', () => ({ ideGitApi: { status: vi.fn(), log: vi.fn(async () => ({ commits: [] })) } }))

import IdeShell from '@/custom/ide/views/IdeShell.vue'

let activeWrapper: ReturnType<typeof mount> | null = null
function mountShell() {
  activeWrapper = mount(IdeShell, {
    global: {
      plugins: [i18n],
      mocks: { $route: routeState },
      stubs: {
        IaGlobalTop: true, IaColumnControls: true, IdeTaskSidebar: true,
        IdeChatPane: true, IdeSidePane: true, IdeStatusBar: true,
        IdeCommandPalette: true, IdeTaskContextBar: true, TaskBriefingPanel: true,
        CockpitRunTraceModal: true,
      },
    },
  })
}

describe('ide?task= 深链自动展开简报', () => {
  beforeEach(() => {
    routeState.query = {}
    ideState.activeTaskId = null
    ideState.dimension = 'workspace'
    kanbanState.tasks = []
    kanbanState.selectedBoard = 'default'
    listBoardsMock.mockReset().mockResolvedValue([{ slug: 'default' }])
    listTasksMock.mockReset().mockResolvedValue([])
  })
  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
  })

  it('带 task 参数：抽屉自动展开 + 任务维度绑定 + activeTask 落位', async () => {
    kanbanState.tasks = [{ id: 't_dl', title: '深链任务', status: 'todo' }]
    routeState.query = { task: 't_dl' }
    mountShell()
    expect(ideState.activeTaskId).toBe('t_dl')
    expect(ideState.dimension).toBe('task')
    expect(activeWrapper!.find('[data-testid="ide-briefing-drawer"]').exists()).toBe(true)
  })

  it('无 task 参数：抽屉不自动展开（不越权开合）', () => {
    mountShell()
    expect(ideState.activeTaskId).toBeNull()
    expect(activeWrapper!.find('[data-testid="ide-briefing-drawer"]').exists()).toBe(false)
  })

  it('跨板深链未即时命中：抽屉仍展开走空态+兜底重试（不因解析慢而收起）', async () => {
    routeState.query = { task: 't_ghost' }
    mountShell()
    expect(activeWrapper!.find('[data-testid="ide-briefing-drawer"]').exists()).toBe(true)
    // 兜底重试链路触发（跨板解析被调用）
    await vi.waitFor(() => expect(listTasksMock).toHaveBeenCalled())
  })
})
