// overlay/custom/client/ide/__tests__/organize-zcode-merge.test.ts
// 「组织取 zcode 信息」守门（2026-10-19）：项目/时间线组织把 zcode CLI 会话
// 按 zcode 权威项目路径（session.directory）混排进组；分组模式 CLI 保持独立段。
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'fs'
import { resolve } from 'path'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh-CN' } }) }))
vi.mock('@/api/client', () => ({ getBaseUrl: () => '', request: vi.fn() }))

const cliSessions = [
  { id: 'sess_cli1', title: 'CLI 修构建', directory: '/Users/x/lab/ncwk', timeUpdated: Date.now() - 1000, timeCreated: 0 },
  { id: 'sess_cliold', title: 'CLI 上月', directory: '/Users/x/lab/old', timeUpdated: Date.now() - 10 * 24 * 3600_000, timeCreated: 0 },
]
vi.mock('../api/devtools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/devtools')>()
  return { ...actual, fetchCliSessions: vi.fn(async () => ({ sessions: cliSessions })), launchDevtool: vi.fn(async () => undefined) }
})
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }))

import IdeTaskSidebar from '../views/IdeTaskSidebar.vue'
import { useIdeStore } from '../store/ide'
import { cliProjectOf, filterCliSessions } from '../utils/sessionProjects'

function sessionsFixture() {
  return [
    { id: 's-ide1', title: 'IDE 当前', workspace: '/Users/x/lab/ncwk', updatedAt: Date.now() - 2000, createdAt: 0, codingAgentMode: 'scoped' },
    { id: 's-ide2', title: 'IDE 内部目录', workspace: '/Users/x/.hermes-web-ui/coding-agent/workspace/default/global', updatedAt: Date.now() - 3000, createdAt: 0 },
  ]
}
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    sessions: sessionsFixture(),
    activeSessionId: 's-ide1',
    sessionProfileFilter: null,
    sessionsLoaded: true,
    switchSession: vi.fn(), newChat: vi.fn(), loadSessions: vi.fn(async () => {}),
    archiveSession: vi.fn(), deleteSession: vi.fn(),
  }),
}))
const { togglePinned } = vi.hoisted(() => ({ togglePinned: vi.fn() }))
vi.mock('../utils/pins', () => ({
  useIdePins: () => ({ pinnedIds: [], isPinned: () => false, togglePinned, onChange: vi.fn() }),
  readPinnedIds: () => [],
}))
vi.mock('../api/agents', () => ({ listTasks: vi.fn(async () => []) }))
vi.mock('../api/archivedSessions', () => ({ fetchArchivedSessions: vi.fn(async () => ({ items: [] })) }))
vi.mock('@/api/studio/sessions', () => ({ exportSession: vi.fn() }))
vi.mock('@/custom/settings-layers', () => ({ readSetting: () => ({ layer: 'default', value: null }), writeSetting: vi.fn() }))
vi.mock('naive-ui', () => ({
  NDropdown: { name: 'NDropdown', props: ['options', 'trigger'], emits: ['select'], template: '<div><slot /></div>' },
  useMessage: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('纯函数：cliProjectOf / filterCliSessions', () => {
  it('CLI 项目=zcode directory 末段；空目录未绑', () => {
    expect(cliProjectOf({ id: 'a', title: 't', directory: '/Users/x/lab/ncwk', timeUpdated: 0 })).toBe('ncwk')
    expect(cliProjectOf({ id: 'b', title: 't', directory: '', timeUpdated: 0 })).toBeNull()
  })

  it('filterCliSessions 按视图与搜索过滤', () => {
    const now = Date.now()
    const list = [
      { id: 'new', title: '新', directory: '/p/a', timeUpdated: now - 1000 },
      { id: 'old', title: '旧', directory: '/p/b', timeUpdated: now - 5 * 24 * 3600_000 },
    ]
    expect(filterCliSessions(list, 'active', '', now).map(s => s.id)).toEqual(['new'])
    expect(filterCliSessions(list, 'done', '', now).map(s => s.id)).toEqual(['old'])
    expect(filterCliSessions(list, 'workspace', '旧', now).map(s => s.id)).toEqual(['old'])
  })
})

describe('项目/时间线组织混排 zcode CLI 会话', () => {
  it('项目组织：ncwk 组同时含 IDE 会话与 CLI 会话；独立 CLI 段隐藏', async () => {
    const ide = useIdeStore()
    ide.setSessionView('active')
    const w = mount(IdeTaskSidebar)
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    // ncwk 项目组：IDE 行 + CLI 混排行
    const ncwk = w.find('[data-testid="ide-task-group-ncwk"]')
    expect(ncwk.exists()).toBe(true)
    expect(ncwk.find('[data-testid="ide-task-item-s-ide1"]').exists()).toBe(true)
    expect(ncwk.find('[data-testid="ide-task-cli-sess_cli1"]').exists()).toBe(true)
    // 项目模式：独立 CLI 段不显示（已混排）；内部目录 IDE 会话落未绑项目
    expect(w.find('[data-testid="ide-task-zcode-cli"]').exists()).toBe(false)
    const noproject = w.find('[data-testid="ide-task-group-未绑项目"]')
    expect(noproject.exists()).toBe(true)
    expect(noproject.find('[data-testid="ide-task-item-s-ide2"]').exists()).toBe(true)
    w.unmount()
  })

  it('分组模式：CLI 保持独立段（zcode 无自建分组存储）', async () => {
    const ide = useIdeStore()
    ide.setOrganize('grouped')
    ide.setSessionView('active')
    const w = mount(IdeTaskSidebar)
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    expect(w.find('[data-testid="ide-task-zcode-cli"]').exists()).toBe(true)
    w.unmount()
  })

  it('时间线组织：CLI 会话按时间并入分层（新的进今天段）', async () => {
    const ide = useIdeStore()
    ide.setSessionView('workspace') // 工作空间视图强制 project…改用 active+timeline
    ide.setSessionView('active')
    ide.setOrganize('timeline')
    const w = mount(IdeTaskSidebar)
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    const today = w.find('[data-testid="ide-task-group-今天"]')
    expect(today.exists()).toBe(true)
    expect(today.find('[data-testid="ide-task-cli-sess_cli1"]').exists()).toBe(true)
    w.unmount()
  })
})

describe('源码守门：组织取 zcode 信息', () => {
  it('侧栏接线：cliFiltered 混排 + CLI-only 项目成组 + 分组模式独立段', () => {
    const src = readFileSync(resolve(__dirname, '../views/IdeTaskSidebar.vue'), 'utf8')
    expect(src).toContain('cliProjectOf')
    expect(src).toContain('只有 CLI 会话的项目（IDE 无会话）也成组')
    expect(src).toContain("effectiveOrganizeMode === 'grouped'")
    expect(src).toContain(':sessions="cliFiltered"')
  })
})
