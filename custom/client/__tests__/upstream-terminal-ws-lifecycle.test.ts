// @vitest-environment jsdom
// 回归测试：2026-08-28 PTY 泄漏事故（252 个 PTY 耗尽 macOS 系统池）。
//
// 泄漏机制：ws.close() 异步，close 事件在 onUnmounted 返回后才触发；
// onclose 无条件 setTimeout(connect, 3000) → 卸载后 3 秒创建无人认领的
// 僵尸 WebSocket，服务端为其自动创建的 PTY 永不释放。
//
// 本文件直接挂载 upstream TerminalView.vue（patch 192 修复对象），
// 验证：卸载后零僵尸重连；意外断线仍正常重连。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/api/client', () => ({ getApiKey: () => 'test-key', getBaseUrlValue: () => '' }))
vi.mock('naive-ui', () => ({
  NButton: { name: 'NButton', template: '<button><slot name="icon" /><slot /></button>' },
  NPopconfirm: { name: 'NPopconfirm', template: '<div><slot /></div>' },
  NTooltip: { name: 'NTooltip', template: '<div><slot /></div>' },
  NSelect: { name: 'NSelect', template: '<select />' },
  useMessage: () => ({ error: vi.fn() }),
}))

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
vi.mock('@xterm/addon-fit', () => ({ FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })) }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: vi.fn() }))

class MockWebSocket {
  static OPEN = 1
  readyState = 1
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e?: { code?: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    mockWebSockets.push(this)
  }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }) }
}
const mockWebSockets: MockWebSocket[] = []
vi.stubGlobal('WebSocket', MockWebSocket)

import TerminalView from '@/views/hermes/TerminalView.vue'

describe('TerminalView PTY 泄漏回归（patch 192）', () => {
  beforeEach(() => {
    mockWebSockets.splice(0, mockWebSockets.length)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('意外断线时仍正常重连（功能不回归）', async () => {
    const w = mount(TerminalView)
    await flushPromises()
    expect(mockWebSockets.length).toBe(1)

    // 服务端异常断开（非主动 close）
    mockWebSockets[0].onclose?.({ code: 1006 })
    vi.advanceTimersByTime(3000)
    expect(mockWebSockets.length).toBe(2) // 重连
    w.unmount()
  })

  it('卸载后 3 秒不再产生僵尸连接（PTY 泄漏根因）', async () => {
    const w = mount(TerminalView)
    await flushPromises()
    expect(mockWebSockets.length).toBe(1)
    const sock = mockWebSockets[0]

    w.unmount()
    // 主动 close 的事件即使触发也已无 handler；连接本身已关闭
    expect(sock.readyState).toBe(3)

    vi.advanceTimersByTime(10000)
    expect(mockWebSockets.length).toBe(1) // 没有僵尸重连
  })

  it('卸载前捕获的旧 onclose 闭包被身份守卫拦截', async () => {
    const w = mount(TerminalView)
    await flushPromises()
    const sock = mockWebSockets[0]
    const staleClose = sock.onclose // 卸载前捕获旧 handler

    w.unmount()
    // 模拟极端情况：旧闭包仍被调用（例如事件已入队）
    staleClose?.({ code: 1006 })
    vi.advanceTimersByTime(10000)
    expect(mockWebSockets.length).toBe(1)
  })
})
