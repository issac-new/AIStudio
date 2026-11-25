// N34-13 根治守门（2026-11-25）：引擎连接的「首帧竞态」。
// 根因：connectZCodeEngine 先等 WebSocket 'open'，之后才构造 SocketProtocol（挂 'message' 监听）；
// 而引擎在连接建立的同一拍就发出 RPC 初始化帧。两者合并到达时，这一帧在监听挂上之前被派发而丢失，
// ChannelClient 停在「未初始化」，之后所有请求排队不发——表现是握手超时。
// 真实引擎对照实测（隔离实例，各 200 次新连接）：打开后才挂监听＝失败 20 次，且失败的 20 次
// 全部是「打开瞬间首帧已到达」、成功的 180 次全部是「尚未到达」；创建时即挂监听＝失败 0 次。
// 本用例用假 WebSocket 复刻最坏时序（'open' 之后同一拍立刻派发初始化帧），把竞态变成确定性用例。
import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VSBuffer, SocketProtocol, Emitter, Event } from '../zcode/vendor/rpc'
import { ChannelServer } from '../zcode/vendor/rpc/channelServer'

const { FakeWebSocket, wire, created } = vi.hoisted(() => {
  // 极简事件派发器（不依赖任何导入——vi.hoisted 先于 import 执行）
  class Hub {
    private handlers = new Map<string, Array<(...a: unknown[]) => void>>()
    on(type: string, fn: (...a: unknown[]) => void) { this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]) }
    once(type: string, fn: (...a: unknown[]) => void) {
      const wrapped = (...a: unknown[]) => { this.off(type, wrapped); fn(...a) }
      this.on(type, wrapped)
    }
    off(type: string, fn: (...a: unknown[]) => void) { this.handlers.set(type, (this.handlers.get(type) ?? []).filter((f) => f !== fn)) }
    emit(type: string, ...a: unknown[]) { for (const fn of [...(this.handlers.get(type) ?? [])]) fn(...a) }
  }
  class FakeWebSocket extends Hub {
    // 与真实 ws 一致：就绪态常量在类与实例上都可取（桥接用 ws.readyState === ws.OPEN 判断可写）
    static readonly OPEN = 1
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSING = 2
    readonly CLOSED = 3
    readyState = 0
    private messageListeners(): number {
      return (this as unknown as { handlers: Map<string, Array<unknown>> }).handlers.get('message')?.length ?? 0
    }
    constructor() {
      super()
      created.listenersAtConstruction = this.messageListeners()
      setImmediate(() => {
        // 取样时刻＝连接打开这一拍、首帧派发之前：协议监听此时是否已挂好
        created.listenersAtOpen = this.messageListeners()
        this.readyState = FakeWebSocket.OPEN
        this.emit('open')
        // 打开之后到达的帧（请求应答）异步送达；首帧除外——见下
        wire.toClient = (bytes) => this.emit('message', Buffer.from(bytes))
        // 最坏时序：与连接应答合并到达的首帧（初始化帧），紧跟 'open' 派发
        if (wire.initFrame) this.emit('message', Buffer.from(wire.initFrame))
      })
    }
    send(data: Uint8Array) { const bytes = new Uint8Array(data); setImmediate(() => wire.toServer?.(bytes)) }
    close() { this.readyState = 3 }
    terminate() { this.readyState = 3 }
  }
  return {
    FakeWebSocket,
    created: { listenersAtConstruction: -1, listenersAtOpen: -1 },
    wire: {
      initFrame: null as Uint8Array | null,
      toServer: null as null | ((bytes: Uint8Array) => void),
      toClient: null as null | ((bytes: Uint8Array) => void),
    },
  }
})

vi.mock('ws', () => ({ default: FakeWebSocket }))

import { connectZCodeEngine } from '../zcode/engine-bridge'

/** 起一个「真 ChannelServer」当对端：构造即发初始化帧，zcode-agent 通道应答 hello。 */
function startFakeEngine(): void {
  const serverIn = new Emitter<VSBuffer>()
  const out: Uint8Array[] = []
  const server = new ChannelServer(new SocketProtocol({
    onData: serverIn.event, onClose: Event.None, onEnd: Event.None,
    // 对端写出：第一帧是初始化帧（由假连接在 'open' 之后同一拍送出，复刻最坏时序）；
    // 之后的帧（请求应答）异步回送客户端。
    write: (b: VSBuffer) => {
      const bytes = new Uint8Array(b.buffer)
      out.push(bytes)
      if (!wire.initFrame) { wire.initFrame = bytes; return }
      setImmediate(() => wire.toClient?.(bytes))
    },
    end() {}, drain: async () => {}, dispose() {},
  } as never), 'ctx')
  server.registerChannel('zcode-agent', {
    call: (_ctx, name: string) => Promise.resolve(name === 'helloConversationV4' ? { protocolVersion: 7 } : { ok: true }),
    listen: () => Event.None,
  })
  if (out.length === 0) throw new Error('对端未发出初始化帧——用例前提不成立')
  wire.initFrame = out[0]
  wire.toServer = (bytes) => serverIn.fire(VSBuffer.wrap(bytes))
}

describe('引擎连接首帧竞态（N34-13）', () => {
  it('初始化帧紧跟连接打开到达时，握手仍能完成', async () => {
    startFakeEngine()
    created.listenersAtOpen = -1
    const home = mkdtempSync(join(tmpdir(), 'bridge-race-'))
    try {
      const bridge = await connectZCodeEngine(home, { url: 'ws://127.0.0.1:1/ws', rpcTimeoutMs: 400 })
      expect(created.listenersAtOpen, '协议监听须在连接打开之前挂好').toBeGreaterThan(0)
      expect(await bridge.agent.helloConversationV4()).toMatchObject({ protocolVersion: 7 })
      bridge.close()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('验收反例前提：对端的初始化帧确实是「构造即发」', () => {
    startFakeEngine()
    expect(wire.initFrame).toBeTruthy()
  })
})
