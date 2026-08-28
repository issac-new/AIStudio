// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { mockKanbanTasks, fetchTasks } = vi.hoisted(() => ({
  mockKanbanTasks: [] as any[],
  fetchTasks: vi.fn(async () => {}),
}))
vi.mock('@/stores/hermes/kanban', () => ({
  useKanbanStore: () => ({ tasks: mockKanbanTasks, fetchTasks, fetchAssignees: vi.fn(async () => {}), startEventStream: vi.fn() }),
}))
const { searchSessions, listWorkspaceFiles, getTimeline } = vi.hoisted(() => ({
  searchSessions: vi.fn(async () => []),
  listWorkspaceFiles: vi.fn(async () => []),
  getTimeline: vi.fn(async () => ({ items: [], total: 0 })),
}))
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({ searchSessions, listWorkspaceFiles, getTimeline }))
const { getTask, addComment } = vi.hoisted(() => ({
  getTask: vi.fn(async () => null),
  addComment: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/api/hermes/kanban', async () => {
  const actual = await vi.importActual<any>('@/api/hermes/kanban')
  return { ...actual, getTask, addComment }
})
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sendMessage: vi.fn(async () => {}), switchSession: vi.fn(async () => {}) }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), joinRoom: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}), sortedMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), activeRoomMessages: [] }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// 终端工具探测 API mock（默认全部已安装）
const { fetchTerminalTools } = vi.hoisted(() => ({
  fetchTerminalTools: vi.fn(async () => [
    { id: 'claude-code', installed: true, path: '/usr/local/bin/claude' },
    { id: 'codex', installed: true, path: '/opt/homebrew/bin/codex' },
    { id: 'deepseek-harness', installed: false, path: null },
  ]),
}))
vi.mock('@/custom/cockpit/api/terminal-tools', () => ({ fetchTerminalTools }))

// Mock xterm.js 及其 addons（jsdom 环境不支持 canvas/终端渲染）
vi.mock('@xterm/xterm', () => {
  const mockTerminal = vi.fn().mockImplementation(() => ({
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    onData: vi.fn(),
    dispose: vi.fn(),
  }))
  return { Terminal: mockTerminal }
})
vi.mock('@xterm/addon-fit', () => {
  const mockFitAddon = vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
  }))
  return { FitAddon: mockFitAddon }
})
vi.mock('@xterm/addon-web-links', () => {
  const mockWebLinksAddon = vi.fn()
  return { WebLinksAddon: mockWebLinksAddon }
})

// jsdom 没有 ResizeObserver，全局 mock
vi.stubGlobal('ResizeObserver', vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
})))

// 可控 WebSocket mock：收集实例与 send 载荷，测试里手动派发服务端控制消息
class MockWebSocket {
  static OPEN = 1
  readyState = 1
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    mockWebSockets.push(this)
  }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3; this.onclose?.() }
  // 模拟服务端 session created 控制消息
  emitCreated(shell = 'zsh') {
    this.onmessage?.({ data: JSON.stringify({ type: 'created', id: `s${mockWebSockets.length}`, pid: 1, shell }) })
  }
}
const mockWebSockets: MockWebSocket[] = []
vi.stubGlobal('WebSocket', MockWebSocket)

import CockpitTerminalPane from '@/custom/cockpit/components/CockpitTerminalPane.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { TERMINAL_TOOL_STORAGE_KEY } from '@/custom/cockpit/terminal/terminal-tools'

const kt = (over: Record<string, any> = {}) => ({
  id: 't1', title: 'T', body: null, assignee: 'alice', status: 'todo',
  priority: 0, created_by: null, created_at: 0, started_at: null, completed_at: null,
  workspace_kind: 'dir', workspace_path: '~/ws/auth-svc', tenant: null, project_id: null,
  result: null, skills: null, latest_summary: null, ...over,
})

// 可变 localStorage mock（支持 setItem 回读）
const storageBacking = new Map<string, string>()
const storageStub = {
  getItem: (k: string) => storageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => storageBacking.set(k, v),
  removeItem: (k: string) => storageBacking.delete(k),
  clear: () => storageBacking.clear(),
}

async function mountPane() {
  const w = mount(CockpitTerminalPane)
  await flushPromises()
  return w
}

describe('CockpitTerminalPane', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    mockWebSockets.splice(0, mockWebSockets.length)
    storageBacking.clear()
    Object.defineProperty(globalThis, 'localStorage', { value: storageStub, configurable: true, writable: true })
    fetchTerminalTools.mockReset().mockImplementation(async () => [
      { id: 'claude-code', installed: true, path: '/usr/local/bin/claude' },
      { id: 'codex', installed: true, path: '/opt/homebrew/bin/codex' },
      { id: 'deepseek-harness', installed: false, path: null },
    ])
  })

  function seed() {
    mockKanbanTasks.push(kt({ id: 't1', workspace_path: '~/ws/auth-svc' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    return s
  }

  it('renders terminal header with workspace root path', async () => {
    seed()
    const w = await mountPane()
    expect(w.text()).toContain('~/ws/auth-svc')
  })

  it('renders the xterm container element', async () => {
    seed()
    const w = await mountPane()
    expect(w.find('.cockpit-terminal-pane__body').exists()).toBe(true)
  })

  it('exit button calls store.exitTerminal', async () => {
    const s = seed()
    s.enterTerminal()
    const w = await mountPane()
    await w.find('[data-action="exit"]').trigger('click')
    expect(s.terminalMode).toBe(false)
  })

  // ── 多工具支持 ──

  it('renders tool select options in priority order', async () => {
    seed()
    const w = await mountPane()
    const options = w.findAll('[data-action="tool-select"] option')
    expect(options.map((o) => o.attributes('value'))).toEqual([
      'claude-code',
      'codex',
      'deepseek-harness',
    ])
    // 探测到未安装的 dsh：禁用并标注
    const dsh = options[2]
    expect(dsh.attributes('disabled')).toBeDefined()
    expect(dsh.text()).toContain('cockpit.termToolNotInstalled')
  })

  it('auto-picks highest priority installed tool (claude-code) on session created', async () => {
    seed()
    await mountPane()
    expect(mockWebSockets.length).toBe(1)
    mockWebSockets[0].emitCreated()
    const sent = mockWebSockets[0].sent
    expect(sent[sent.length - 1]).toBe(
      '(cd "~/ws/auth-svc" && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude agents --dangerously-skip-permissions --effort max)\r',
    )
  })

  it('falls back to codex when claude-code is not installed', async () => {
    seed()
    fetchTerminalTools.mockImplementation(async () => [
      { id: 'claude-code', installed: false, path: null },
      { id: 'codex', installed: true, path: '/opt/homebrew/bin/codex' },
      { id: 'deepseek-harness', installed: true, path: '/usr/local/bin/dsh' },
    ])
    const w = await mountPane()
    expect((w.find('[data-action="tool-select"]').element as HTMLSelectElement).value).toBe('codex')
    mockWebSockets[0].emitCreated()
    const sent = mockWebSockets[0].sent
    expect(sent[sent.length - 1]).toBe('(cd "~/ws/auth-svc" && codex --dangerously-bypass-approvals-and-sandbox)\r')
  })

  it('falls back to deepseek-harness when only dsh is installed', async () => {
    seed()
    fetchTerminalTools.mockImplementation(async () => [
      { id: 'claude-code', installed: false, path: null },
      { id: 'codex', installed: false, path: null },
      { id: 'deepseek-harness', installed: true, path: '/usr/local/bin/dsh' },
    ])
    await mountPane()
    mockWebSockets[0].emitCreated()
    const sent = mockWebSockets[0].sent
    expect(sent[sent.length - 1]).toBe('(cd "~/ws/auth-svc" && dsh --profile tui)\r')
  })

  it('falls back to claude-code untouched when probe endpoint fails', async () => {
    seed()
    fetchTerminalTools.mockRejectedValue(new Error('server too old'))
    const w = await mountPane()
    // 探测失败：不禁用任何选项，回退 claude-code
    const options = w.findAll('[data-action="tool-select"] option')
    expect(options.every((o) => o.attributes('disabled') === undefined)).toBe(true)
    mockWebSockets[0].emitCreated()
    const sent = mockWebSockets[0].sent
    expect(sent[sent.length - 1]).toContain('claude agents --dangerously-skip-permissions')
  })

  it('uses powershell syntax when server shell is powershell', async () => {
    seed()
    await mountPane()
    mockWebSockets[0].emitCreated('powershell.exe')
    const sent = mockWebSockets[0].sent
    expect(sent[sent.length - 1]).toBe(
      'Set-Location "~/ws/auth-svc"; $env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1; claude agents --dangerously-skip-permissions --effort max\r',
    )
  })

  it('restores persisted tool choice when still installed', async () => {
    seed()
    storageBacking.set(TERMINAL_TOOL_STORAGE_KEY, 'codex')
    const w = await mountPane()
    expect((w.find('[data-action="tool-select"]').element as HTMLSelectElement).value).toBe('codex')
    mockWebSockets[0].emitCreated()
    const sent = mockWebSockets[0].sent
    expect(sent[sent.length - 1]).toContain('codex --dangerously-bypass-approvals-and-sandbox')
  })

  it('switching tool persists choice and restarts session with new tool command', async () => {
    seed()
    fetchTerminalTools.mockImplementation(async () => [
      { id: 'claude-code', installed: true, path: '/usr/local/bin/claude' },
      { id: 'codex', installed: true, path: '/opt/homebrew/bin/codex' },
      { id: 'deepseek-harness', installed: true, path: '/usr/local/bin/dsh' },
    ])
    const w = await mountPane()
    mockWebSockets[0].emitCreated()

    // setValue 对 select 会同时触发 change
    await w.find('[data-action="tool-select"]').setValue('deepseek-harness')
    await flushPromises()

    expect(storageBacking.get(TERMINAL_TOOL_STORAGE_KEY)).toBe('deepseek-harness')
    // 旧 ws 关闭，新 session 建立
    expect(mockWebSockets.length).toBe(2)
    expect(mockWebSockets[0].readyState).toBe(3)
    mockWebSockets[1].emitCreated()
    const sent = mockWebSockets[1].sent
    expect(sent[sent.length - 1]).toBe('(cd "~/ws/auth-svc" && dsh --profile tui)\r')
  })
})

// ── PTY 泄漏回归（2026-08-28 事故：卸载后僵尸重连 → 服务端 PTY 永不释放）──

describe('CockpitTerminalPane PTY 泄漏回归', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockKanbanTasks.splice(0, mockKanbanTasks.length)
    mockWebSockets.splice(0, mockWebSockets.length)
    storageBacking.clear()
    Object.defineProperty(globalThis, 'localStorage', { value: storageStub, configurable: true, writable: true })
    fetchTerminalTools.mockReset().mockImplementation(async () => [
      { id: 'claude-code', installed: true, path: '/usr/local/bin/claude' },
      { id: 'codex', installed: true, path: '/opt/homebrew/bin/codex' },
      { id: 'deepseek-harness', installed: true, path: '/usr/local/bin/dsh' },
    ])
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function seed() {
    mockKanbanTasks.push(kt({ id: 't1', workspace_path: '~/ws/auth-svc' }))
    const s = useCockpitStore()
    ;(s as any).selectedTaskId = 't1'
    return s
  }

  it('卸载后 3 秒不再产生僵尸连接（PTY 泄漏根因）', async () => {
    seed()
    const w = mount(CockpitTerminalPane)
    await flushPromises()
    expect(mockWebSockets.length).toBe(1)
    const sock = mockWebSockets[0]

    w.unmount()
    // dispose 摘除事件处理器并关闭连接：迟到的 close 事件无 handler 可触发
    expect(sock.readyState).toBe(3)
    expect(sock.onclose).toBeNull()
    expect(sock.onmessage).toBeNull()

    vi.advanceTimersByTime(10000)
    expect(mockWebSockets.length).toBe(1) // 没有僵尸重连
  })

  it('卸载前捕获的旧 onclose 闭包被身份守卫拦截', async () => {
    seed()
    const w = mount(CockpitTerminalPane)
    await flushPromises()
    const sock = mockWebSockets[0]
    const staleClose = sock.onclose

    w.unmount()
    staleClose?.() // 极端情况：旧闭包仍被调用
    vi.advanceTimersByTime(10000)
    expect(mockWebSockets.length).toBe(1)
  })

  it('意外断线时仍正常重连（功能不回归）', async () => {
    seed()
    const w = mount(CockpitTerminalPane)
    await flushPromises()
    expect(mockWebSockets.length).toBe(1)

    // 服务端异常断开 → 3 秒后重连
    mockWebSockets[0].onclose?.()
    vi.advanceTimersByTime(3000)
    expect(mockWebSockets.length).toBe(2)
    w.unmount()
  })

  it('切换工具的重启路径：旧 socket 迟到事件不影响新连接、不产生多余连接', async () => {
    seed()
    const w = mount(CockpitTerminalPane)
    await flushPromises()
    expect(mockWebSockets.length).toBe(1)
    const oldSock = mockWebSockets[0]
    const oldClose = oldSock.onclose

    await w.find('[data-action="tool-select"]').setValue('codex')
    await flushPromises()
    expect(mockWebSockets.length).toBe(2)

    // 旧 socket 的迟到 close（handler 已摘除，这里手动调旧闭包模拟极端情况）
    oldClose?.()
    // 新 socket 的身份守卫：它自己的 close 应正常触发重连语义
    expect((mockWebSockets[1] as any).onclose).not.toBeNull()

    vi.advanceTimersByTime(10000)
    // oldClose 无效果；无任何额外连接产生
    expect(mockWebSockets.length).toBe(2)
    w.unmount()
  })
})
