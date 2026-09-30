// @vitest-environment jsdom
// A4 会话深链守门：/ide?session=<id>（沟通协作页「需关注」会话行 R7-B 入口，
// ia2/views/WorkbenchView.vue 发出）。此前 IdeShell 只消费 ?task=，session 参数
// 被静默丢弃。本测试钉死：session 参数须触发 loadSessions（未装载时）+ switchSession。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { reactive, ref } from 'vue'

const i18n = createI18n({ legacy: false, locale: 'zh', messages: { zh: {} } })

// 可变 route query：用例间改写以模拟深链到达/变化
const routeQuery = reactive<Record<string, string | undefined>>({ session: undefined })
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRoute: () => ({ query: routeQuery, fullPath: '/ide' }) }
})

const ideState = reactive({ activeTaskId: null as string | null, dimension: 'workspace' })
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
  useKanbanStore: () => ({ tasks: [], selectedBoard: 'default', setBoard: vi.fn() }),
}))
vi.mock('@/api/hermes/kanban', () => ({ listBoards: vi.fn(), listTasks: vi.fn() }))
vi.mock('@/custom/cockpit/store/cockpit', () => ({ useCockpitStore: () => ({}) }))
// 日程弹窗还原（2026-10-01）后 IdeShell 引 workspace store——同款桩
vi.mock('@/custom/ia2/store/workspace', () => ({ useWorkspaceStore: () => ({ scheduleOpen: false, openSchedule: () => {}, closeSchedule: () => {} }) }))

const chatState = reactive({ sessionsLoaded: false, sessionProfileFilter: null as string | null })
const loadSessionsMock = vi.fn(async () => { chatState.sessionsLoaded = true })
const switchSessionMock = vi.fn(async (_id: string) => {})
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    sessions: [],
    get sessionsLoaded() { return chatState.sessionsLoaded },
    get sessionProfileFilter() { return chatState.sessionProfileFilter },
    loadSessions: loadSessionsMock,
    switchSession: switchSessionMock,
    setRuntimeMode: vi.fn(),
  }),
}))
vi.mock('@/stores/hermes/files', () => ({ useFilesStore: () => ({ openEditor: vi.fn() }) }))
vi.mock('@/api/studio/files', () => ({ listFiles: vi.fn(async () => ({ entries: [], path: '' })) }))
vi.mock('@/custom/ide/api/git', () => ({ ideGitApi: { status: vi.fn(), log: vi.fn(async () => ({ commits: [] })) } }))

import IdeShell from '@/custom/ide/views/IdeShell.vue'

let activeWrapper: ReturnType<typeof mount> | null = null
function mountShell() {
  activeWrapper = mount(IdeShell, {
    global: {
      plugins: [i18n],
      stubs: {
        IaGlobalTop: true, IaColumnControls: true, IdeTaskSidebar: true,
        IdeChatPane: true, IdeSidePane: true, IdeStatusBar: true,
        IdeCommandPalette: true, IdeTaskContextBar: true, TaskBriefingPanel: true,
        CockpitRunTraceModal: true,
      },
    },
  })
}

describe('IdeShell 会话深链（?session=）', () => {
  beforeEach(() => {
    routeQuery.session = undefined
    chatState.sessionsLoaded = false
    loadSessionsMock.mockClear()
    switchSessionMock.mockClear()
  })
  afterEach(() => {
    activeWrapper?.unmount()
    activeWrapper = null
  })

  it('无 session 参数：不触发任何会话切换', async () => {
    mountShell()
    await vi.waitFor(() => expect(switchSessionMock).not.toHaveBeenCalled())
    expect(loadSessionsMock).not.toHaveBeenCalled()
  })

  it('session 参数到达且列表未装载：先 loadSessions 再 switchSession', async () => {
    mountShell()
    routeQuery.session = 'sess_r7b'
    await vi.waitFor(() => expect(switchSessionMock).toHaveBeenCalledWith('sess_r7b'))
    expect(loadSessionsMock).toHaveBeenCalledTimes(1)
    // loadSessions 必须先于 switchSession 完成（调用顺序）
    expect(loadSessionsMock.mock.invocationCallOrder[0]).toBeLessThan(switchSessionMock.mock.invocationCallOrder[0])
  })

  it('列表已装载：直接 switchSession 不重复装载', async () => {
    chatState.sessionsLoaded = true
    mountShell()
    routeQuery.session = 'sess_ready'
    await vi.waitFor(() => expect(switchSessionMock).toHaveBeenCalledWith('sess_ready'))
    expect(loadSessionsMock).not.toHaveBeenCalled()
  })

  it('空白 session 参数：忽略', async () => {
    mountShell()
    routeQuery.session = '   '
    await vi.waitFor(() => expect(switchSessionMock).not.toHaveBeenCalled())
  })
})
