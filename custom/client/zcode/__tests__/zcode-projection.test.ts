// R4-P2 验收闭环守门：客户端投影 store——事件词表消费、chip 文案映射、状态条接线。
// C1/C2 追加：订阅生命周期（监听器不累积/重连重订/精确清理）、重复事件幂等、
// chip 故障样式落在 <style> 块内（SFC 编译器可收集）。
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parse } from '@vue/compiler-sfc'
import type { Socket } from 'socket.io-client'
import {
  REASON_CHIP_TEXT, handleZcodeEvent, resetProjectionStateForTests, useZcodeProjection,
} from '../store/zcode-projection'

const { ioMock } = vi.hoisted(() => ({ ioMock: vi.fn() }))
vi.mock('socket.io-client', () => ({ io: ioMock }))
vi.mock('@/api/client', () => ({ getApiKey: () => 'test-key', getBaseUrlValue: () => 'http://127.0.0.1:8647' }))
import { connectZcode, disconnectZcode, subscribeZcodeWorkspace } from '../api/zcode-socket'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

describe('zcode 投影 store（/zcode 事件消费）', () => {
  it('session.upserted/removed 维护会话面；conversation.frame 累计 delta', () => {
    resetProjectionStateForTests()
    handleZcodeEvent({ type: 'session.upserted', workspaceId: '/w', sessionId: 's1', session: { title: 'a', phase: 'idle' }, at: 1 })
    handleZcodeEvent({ type: 'session.upserted', workspaceId: '/w', sessionId: 's2', session: {}, at: 2 })
    handleZcodeEvent({ type: 'conversation.frame', workspaceId: '/w', sessionId: 's1', deltaCount: 3, at: 3 })
    handleZcodeEvent({ type: 'session.removed', workspaceId: '/w', sessionId: 's2', at: 4 })
    const { state, sessionCount } = useZcodeProjection()
    expect(sessionCount.value).toBe(1)
    expect(state.sessions.s1.title).toBe('a')
    expect(state.conversationDeltaTotal).toBe(3)
  })

  it('status/mention 事件按词表字面值映射 chip 文案；非成功档标 trouble', () => {
    resetProjectionStateForTests()
    handleZcodeEvent({ type: 'projection.status', workspaceId: '/w', reason: 'runtime_offline', at: 1 })
    const p1 = useZcodeProjection()
    expect(p1.lastReasonText.value).toBe('运行时离线')
    expect(p1.lastReasonIsTrouble.value).toBe(true)
    handleZcodeEvent({ type: 'mention.outcome', workspaceId: '/w', reason: 'queued', at: 2 })
    const p2 = useZcodeProjection()
    expect(p2.lastReasonText.value).toBe('已入队')
    expect(p2.lastReasonIsTrouble.value).toBe(false)
  })

  it('未知 reason 原样展示字面值；状态环有界 20', () => {
    resetProjectionStateForTests()
    handleZcodeEvent({ type: 'projection.status', workspaceId: '/w', reason: 'future_code_xyz', at: 1 })
    expect(useZcodeProjection().lastReasonText.value).toBe('future_code_xyz')
    for (let i = 0; i < 30; i++) {
      handleZcodeEvent({ type: 'projection.status', workspaceId: '/w', reason: 'queued', at: i })
    }
    expect(useZcodeProjection().state.statusEvents.length).toBe(20)
  })

  it('重复事件幂等：同帧重投不重复累加 delta、status 不重复入环（双房间投递/补发）', () => {
    resetProjectionStateForTests()
    const frame = { type: 'conversation.frame', workspaceId: '/w', sessionId: 's1', deltaCount: 3, fromSeq: 1, toSeq: 3, at: 3 }
    handleZcodeEvent(frame)
    handleZcodeEvent(frame)
    const frameNoSeq = { type: 'conversation.frame', workspaceId: '/w', sessionId: 's2', deltaCount: 2, at: 4 }
    handleZcodeEvent(frameNoSeq)
    handleZcodeEvent(frameNoSeq)
    const status = { type: 'projection.status', workspaceId: '/w', reason: 'runtime_offline', at: 5 }
    handleZcodeEvent(status)
    handleZcodeEvent(status)
    const { state } = useZcodeProjection()
    expect(state.conversationDeltaTotal).toBe(5)
    expect(state.statusEvents).toHaveLength(1)
  })
})

describe('状态条与 socket 接线守门', () => {
  it('IdeStatusBar 挂投影 chip；socket 客户端对齐 loop-socket 模式', () => {
    const bar = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ide/views/IdeStatusBar.vue'), 'utf8')
    expect(bar).toContain('useZcodeProjection')
    expect(bar).toContain('ide-zcode-projection')
    const sock = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/zcode/api/zcode-socket.ts'), 'utf8')
    expect(sock).toContain("io(`${baseUrl}/zcode`")
    expect(sock).toContain("emit('subscribe-session'")
  })

  it('IdeStatusBar 按 workspace 订阅/退订：watch 变化先退旧订新，卸载用清理函数精确 off', () => {
    const bar = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ide/views/IdeStatusBar.vue'), 'utf8')
    expect(bar).toContain('watch(() => ide.workspace')
    expect(bar).toContain('unsubscribeZcode?.()')
    // 卸载/换 workspace 不得以「卸载时刻的 workspace」退订（可能与订阅值不同）
    expect(bar).not.toContain('unsubscribeZcodeWorkspace')
  })

  it('zcode-reason chip 故障样式在 <style> 块内（SFC 编译器可收集，不被静默丢弃）', () => {
    const bar = readFileSync(resolve(OVERLAY_ROOT, 'custom/client/ide/views/IdeStatusBar.vue'), 'utf8')
    const { descriptor } = parse(bar, { filename: 'IdeStatusBar.vue' })
    const css = descriptor.styles.map((s) => s.content).join('\n')
    expect(css).toContain('.ide-statusbar__zcode-reason')
    // 规则不得落在最后一个 </style> 之后（SFC 顶层面文本会被编译器丢弃）
    const tail = bar.slice(bar.lastIndexOf('</style>') + '</style>'.length)
    expect(tail).not.toContain('.ide-statusbar__zcode-reason')
  })

  it('chip 文案表与服务端词表的关键档对齐（字面值即契约）', () => {
    for (const key of ['queued', 'coalesced', 'runtime_offline', 'engine_unreachable', 'command_rejected', 'frame_fragment_skipped']) {
      expect(REASON_CHIP_TEXT[key], `缺 ${key} 文案`).toBeTruthy()
    }
  })
})

// ── C1 订阅生命周期（行为级：假 socket 上验证监听器登记/清理/重连重订）──
function makeFakeSocket() {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>()
  const emitted: Array<{ event: string; args: unknown[] }> = []
  return {
    emitted,
    disconnectCount: 0,
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(fn)
    },
    off(event: string, fn: (...args: unknown[]) => void) {
      handlers.get(event)?.delete(fn)
    },
    emit(event: string, ...args: unknown[]) {
      emitted.push({ event, args })
    },
    disconnect() {
      this.disconnectCount += 1
    },
    fire(event: string, ...args: unknown[]) {
      for (const fn of [...(handlers.get(event) ?? [])]) fn(...args)
    },
    listenerCount(event: string) {
      return handlers.get(event)?.size ?? 0
    },
  }
}
type FakeSocket = ReturnType<typeof makeFakeSocket>

describe('订阅生命周期守门（C1）', () => {
  it('subscribe 登记 zcode:event + connect 幂等重订；清理函数 off 两个监听并退订', () => {
    const socket = makeFakeSocket()
    const onEvent = vi.fn()
    const unsubscribe = subscribeZcodeWorkspace(socket as unknown as Socket, '/w', onEvent)
    expect(socket.listenerCount('zcode:event')).toBe(1)
    expect(socket.listenerCount('connect')).toBe(1)
    expect(socket.emitted[0]).toEqual({ event: 'subscribe', args: ['/w'] })
    // 断线重连：服务端是新 socket、房间关系丢失，connect 幂等重订同一 workspace
    socket.fire('connect')
    expect(socket.emitted.filter((m) => m.event === 'subscribe')).toHaveLength(2)
    unsubscribe()
    expect(socket.listenerCount('zcode:event')).toBe(0)
    expect(socket.listenerCount('connect')).toBe(0)
    expect(socket.emitted[socket.emitted.length - 1]).toEqual({ event: 'unsubscribe', args: ['/w'] })
    // 清理后重连不得复活订阅（否则换 workspace/卸载后监听器回流）
    socket.fire('connect')
    expect(socket.emitted.filter((m) => m.event === 'subscribe')).toHaveLength(2)
  })

  it('connectZcode 存在即复用（backoff 窗口内未连接也不另起孤儿实例）；换新前先 disconnect 旧实例', () => {
    ioMock.mockImplementation(() => makeFakeSocket())
    try {
      const first = connectZcode() as unknown as FakeSocket
      expect(ioMock).toHaveBeenCalledTimes(1)
      // 模拟重连 backoff 窗口（connected=false）：仍复用同一实例，不另起孤儿双通道
      ;(first as unknown as { connected: boolean }).connected = false
      const firstAgain = connectZcode() as unknown as FakeSocket
      expect(firstAgain).toBe(first)
      expect(ioMock).toHaveBeenCalledTimes(1)
      disconnectZcode()
      expect(first.disconnectCount).toBe(1) // 换新路径必先 disconnect 旧实例
      const second = connectZcode() as unknown as FakeSocket
      expect(second).not.toBe(first)
      expect(ioMock).toHaveBeenCalledTimes(2)
      disconnectZcode()
    } finally {
      ioMock.mockReset()
    }
  })
})
