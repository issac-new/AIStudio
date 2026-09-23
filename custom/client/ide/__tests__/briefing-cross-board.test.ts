// @vitest-environment jsdom
// briefing 跨板解析守门：aipaydev 推演 ide-briefing-cross-board-empty 立项修复。
// 深链任务不在当前选中板时，IdeShell 须逐板 listBoards+listTasks 解析并切板回填；
// 当前板命中或全板未命中均不额外请求。通过 vi.mock 隔离 pinia store 与 api 层。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { reactive, ref } from 'vue'

const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh: {} } })

// 组件走 useRoute() composable（非模板 $route），测试环境无 router 实例须 mock
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRoute: () => ({ query: {}, fullPath: '/ide' }) }
})

// ── 受控替身 ──
const ideState = reactive({ activeTaskId: null as string | null, dimension: 'workspace' })
const kanbanState = reactive({
  tasks: [] as Array<{ id: string; title: string; status: string; session_id?: string | null }>,
  selectedBoard: 'default',
})
const setBoardCalls: string[] = []
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
    setBoard: (b: string) => { setBoardCalls.push(b); kanbanState.selectedBoard = b },
  }),
}))
const listBoardsMock = vi.fn()
const listTasksMock = vi.fn()
vi.mock('@/api/hermes/kanban', () => ({
  listBoards: (...a: unknown[]) => listBoardsMock(...a),
  listTasks: (...a: unknown[]) => listTasksMock(...a),
}))
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: () => ({}) }))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ sessions: [] }) }))
vi.mock('@/custom/ide/api/git', () => ({ ideGitApi: { status: vi.fn(), log: vi.fn(async () => ({ commits: [] })) } }))

// 布局/重活组件全部 stub，只保留脚本逻辑
import IdeShell from '@/custom/ide/views/IdeShell.vue'

// 每用例 unmount：mock 的 ide/kanban store 是模块级单例，前一个用例残留的
// 组件实例其 eager watch 仍订阅 activeTaskId，会把 setBoard 打出重复次数。
let activeWrapper: ReturnType<typeof mount> | null = null
function mountShell() {
  activeWrapper = mount(IdeShell, {
    global: {
      plugins: [i18n],
      mocks: { $route: { query: {} } },
      stubs: {
        IaGlobalTop: true, IaColumnControls: true, IdeTaskSidebar: true,
        IdeChatPane: true, IdeSidePane: true, IdeStatusBar: true,
        IdeCommandPalette: true, IdeTaskContextBar: true, TaskBriefingPanel: true,
        CockpitRunTraceModal: true,
      },
    },
  })
}

describe('IdeShell briefing 跨板解析', () => {
  beforeEach(() => {
    ideState.activeTaskId = null
    kanbanState.tasks = []
    kanbanState.selectedBoard = 'default'
    setBoardCalls.length = 0
    listBoardsMock.mockReset()
    listTasksMock.mockReset()
  })
  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
  })

  it('任务在当前板 store 缓存内：零额外请求', async () => {
    kanbanState.tasks = [{ id: 't_local', title: '本板任务', status: 'todo' }]
    mountShell()
    ideState.activeTaskId = 't_local'
    await vi.waitFor(() => expect(listBoardsMock).not.toHaveBeenCalled())
    expect(listTasksMock).not.toHaveBeenCalled()
    expect(setBoardCalls).toEqual([])
  })

  it('任务在他板：逐板解析→命中→切板回填', async () => {
    listBoardsMock.mockResolvedValue([{ slug: 'default' }, { slug: 'aipay-rfd' }])
    listTasksMock.mockImplementation(({ board }: { board: string }) =>
      Promise.resolve(board === 'aipay-rfd'
        ? [{ id: 't_remote', title: '远端板任务', status: 'running', body: 'body' }]
        : []))
    mountShell()
    ideState.activeTaskId = 't_remote'
    await vi.waitFor(() => expect(setBoardCalls).toEqual(['aipay-rfd']))
    expect(listTasksMock).toHaveBeenCalledWith({ board: 'default' })
    expect(listTasksMock).toHaveBeenCalledWith({ board: 'aipay-rfd' })
  })

  it('全板未命中：不崩溃不报错，保持空态', async () => {
    listBoardsMock.mockResolvedValue([{ slug: 'default' }, { slug: 'other' }])
    listTasksMock.mockResolvedValue([])
    mountShell()
    ideState.activeTaskId = 't_ghost'
    await vi.waitFor(() => expect(listTasksMock).toHaveBeenCalledWith({ board: 'other' }))
    expect(setBoardCalls).toEqual([])
  })

  it('session_id 命中也解析（深链会话形态）', async () => {
    listBoardsMock.mockResolvedValue([{ slug: 'agent-board' }])
    listTasksMock.mockResolvedValue([{ id: 't_x', session_id: 'sess_abc', title: '按会话', status: 'todo' }])
    kanbanState.selectedBoard = 'other-board'
    listBoardsMock.mockResolvedValue([{ slug: 'other-board' }, { slug: 'agent-board' }])
    listTasksMock.mockImplementation(({ board }: { board: string }) =>
      Promise.resolve(board === 'agent-board'
        ? [{ id: 't_x', session_id: 'sess_abc', title: '按会话', status: 'todo' }]
        : []))
    mountShell()
    ideState.activeTaskId = 'sess_abc'
    await vi.waitFor(() => expect(setBoardCalls).toEqual(['agent-board']))
  })
})
