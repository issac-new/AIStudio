// overlay/custom/server/__tests__/zcode-engine-bridge.test.ts
// R4-P1 守门：vendored rpc 同步断言 + 桥模块结构 + 健康面控制器 + patch 380 登记。
// S4 守门：握手超时（WS open / RPC 每步）+ 失败分支统一 terminate（连接不泄漏）。
// 2026-11-23 兼容批：全文件豁免废除——改确定性预期内容比较（.js 后缀归一化 + X3 头注），
// index.ts 因有意收窄导出单独断言；并补 retryable/profileId 透传与 EventError 订阅结束行为回归。
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { resolve, join } from 'path'
import { tmpdir } from 'os'
import net from 'net'
import { WebSocketServer } from 'ws'
import { connectZCodeEngine, wsMessageToVSBuffer } from '../zcode/engine-bridge'
import { upstreamPath } from '../../test/upstream-root'
import { ChannelClient, Emitter, VSBuffer } from '../zcode/vendor/rpc'
import { BufferWriter, serialize } from '../zcode/vendor/rpc/serialization'
import type { IMessagePassingProtocol } from '../zcode/vendor/rpc/protocol'

const OVERLAY_ROOT = resolve(__dirname, '../../..')
const VENDOR = resolve(OVERLAY_ROOT, 'custom/server/zcode/vendor/rpc')
const ZCODE_RPC_SRC = upstreamPath('zcode/packages/rpc/src')

/** 宿主实际 import 闭包（proxy-channel→channels→channelServer/delayedChannel 全链）。 */
const CLOSURE_FILES = [
  'buffer.ts', 'foundation.ts', 'serialization.ts', 'protocol.ts',
  'channels.shared.ts', 'channelServer.ts', 'channelClient.ts',
  'delayedChannel.ts', 'proxy-channel.ts', 'channels.ts',
]
/** 叶子模块（无相对 import，无头注）。 */
const LEAF_FILES = new Set(['buffer.ts', 'foundation.ts'])
const X3_POINTER = '// import 形态不变量见 channels.ts 头注释（相对 import 省略扩展名；迁移 ESM 前须回补）。'
const X3_CHANNELS_HEADER = `// overlay vendored @zcode/rpc · import 形态不变量（X3）：
// 本目录相对 import 一律省略扩展名（"./buffer" 而非 "./buffer.js"）。这是【有意
// 不变量】而非隐患——当前运行链是 ts-node CJS（require 解析自动补 .ts）与 vitest
// 转换链，省略形态合法；但 Node ESM 直跑即 ERR_MODULE_NOT_FOUND。迁移 ESM 前必须
// 回补全部扩展名，并同步更新守门测试
// custom/server/__tests__/zcode-vendor-rpc-import-form.test.ts（形态扫描断言）。
// 其余文件头部一行指针指回本注释；升级重拷 upstream 源文件后指针会被抹掉，
// 守门测试会 fail 提醒回放（勿绕过，回放指针即可）。
`

/** 确定性归一化：上游原文 → 仅移除相对 import 的 .js 后缀 → 加逐文件 X3 头注。
 * 除此之外的任何字节差异都是协议漂移，不再有整文件豁免。 */
function expectedVendored(file: string, upstreamText: string): string {
  const stripped = upstreamText.replace(/(["'])(\.\.?\/[^"']+)\.js\1/g, '$1$2$1')
  if (file === 'channels.ts') return X3_CHANNELS_HEADER + stripped
  if (LEAF_FILES.has(file)) return stripped
  return `${X3_POINTER}\n${stripped}`
}

describe('zcode engine bridge（R4-P1）', () => {
  it('vendored rpc 与上游源确定性一致（.js 归一化 + X3 头注，无整文件豁免）', () => {
    for (const f of CLOSURE_FILES) {
      const ours = readFileSync(resolve(VENDOR, f), 'utf8')
      const theirs = resolve(ZCODE_RPC_SRC, f)
      expect(existsSync(resolve(VENDOR, f)), `缺 vendor 文件 ${f}`).toBe(true)
      if (!existsSync(theirs)) continue // zcode 未克隆环境跳过对账
      const expected = expectedVendored(f, readFileSync(theirs, 'utf8'))
      expect(ours, `${f} 与上游源存在超出声明形态差异的漂移——升级 pin 后须按同步纪律重拷`).toBe(expected)
    }
  })

  it('index.ts：有意收窄导出面并声明当前 pin（不与上游全量 index 对齐）', () => {
    const index = readFileSync(resolve(VENDOR, 'index.ts'), 'utf8')
    expect(index).toContain('pin @a4b44451')
    expect(index).toContain('export { VSBuffer } from "./buffer"')
    expect(index).toContain('export { Event, Emitter, CancellationToken, CancellationTokenSource, DisposableStore } from "./foundation"')
    expect(index).toContain('export type { IDisposable } from "./foundation"')
    expect(index).toContain('export { serialize, deserialize } from "./serialization"')
    expect(index).toContain('export { SocketProtocol } from "./protocol"')
    expect(index).toContain('export { ChannelClient } from "./channelClient"')
    expect(index).toContain('export { ProxyChannel } from "./proxy-channel"')
    expect(index).not.toContain('PersistentProtocol') // 未被宿主引用的模块不引入
  })

  it('桥模块导出 connectZCodeEngine/probeZCodeEngine，握手序 hello→clientHello', () => {
    const bridge = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/engine-bridge.ts'), 'utf8')
    expect(bridge).toContain('export async function connectZCodeEngine')
    expect(bridge).toContain('export async function probeZCodeEngine')
    expect(bridge.indexOf('helloConversationV4')).toBeLessThan(bridge.indexOf('initializeConversationV4'))
    expect(bridge).toContain("client.getChannel('zcode-agent')")
    expect(bridge).toContain('clientKind: \'web\'')
    expect(bridge).toContain('sendConversationCommandV4') // 写路径走 v4，不用废弃 sendPrompt
    expect(bridge).not.toContain('sendPrompt')
  })

  it('健康面控制器挂载 REST GET /api/zcode-engine/health', () => {
    const controller = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/engine-controller.ts'), 'utf8')
    expect(controller).toContain("router.get('/health'")
    expect(controller).toContain('probeZCodeEngine')
  })

  it('patch 380 登记且挂载点存在（注入态 routes.ts 含 import+use）', () => {
    const series = readFileSync(resolve(OVERLAY_ROOT, 'patches/series'), 'utf8')
    expect(series).toMatch(/^380-server-zcode-engine-health-route\.patch$/m)
    const routesPath = upstreamPath('hermes-studio/packages/server/src/bootstrap/routes.ts')
    if (existsSync(routesPath)) {
      const routes = readFileSync(routesPath, 'utf8')
      expect(routes).toContain("import { zcodeEngineRoutes } from '../custom/zcode/engine-controller'")
      expect(routes).toContain('app.use(zcodeEngineRoutes.routes())')
    }
  })
})

describe('RPC 协议行为回归（pin fec97590 新语义）', () => {
  class FakeProtocol {
    sent: VSBuffer[] = []
    private emitter = new Emitter<VSBuffer>()
    onMessage = this.emitter.event
    send = (buffer: VSBuffer) => { this.sent.push(buffer) }
    feed = (buffer: VSBuffer) => { this.emitter.fire(buffer) }
  }
  /** 帧 = header 数组 + 显式 body（undefined 也序列化占位——老实现会先解 body）。 */
  const frame = (header: any[], body?: any): VSBuffer => {
    const writer = new BufferWriter()
    serialize(writer, header)
    serialize(writer, body)
    return writer.buffer
  }
  const makeClient = () => {
    const proto = new FakeProtocol()
    const client = new ChannelClient(proto as unknown as IMessagePassingProtocol)
    proto.feed(frame([200])) // Initialize → Idle，后续 call/listen 同步发出
    return { proto, client }
  }

  it('PromiseError 透传 retryable/profileId（上游新增字段不得丢失）', async () => {
    const { proto, client } = makeClient()
    const pending = client.getChannel('zcode-agent').call('helloConversationV4', { a: 1 })
    expect(proto.sent.length).toBe(1) // Idle 后同步发出
    // 响应 id=0（首个请求）；PromiseError 携带上游新增的 retryable/profileId
    proto.feed(frame([202, 0], { message: 'boom', name: 'EngineError', stack: undefined, code: 'E_ENGINE', retryable: true, profileId: 'p-main' }))
    const err: any = await pending.then(
      () => { throw new Error('expected rejection') },
      (e) => e,
    )
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('boom')
    expect(err.name).toBe('EngineError')
    expect(err.code).toBe('E_ENGINE')
    expect(err.retryable, '上游 fec97590 新增 retryable 字段必须透传').toBe(true)
    expect(err.profileId, '上游 fec97590 新增 profileId 字段必须透传').toBe('p-main')
    client.dispose()
  })

  it('EventError 结束订阅：错误不进事件流、console.error 留痕、旧 id 后续 Fire 不投递', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const { proto, client } = makeClient()
      const seen: unknown[] = []
      const sub = client.getChannel('zcode-agent').listen('sessionsChanged')(e => { seen.push(e) })
      expect(proto.sent.length).toBe(1) // EventListen id=0 已发出
      proto.feed(frame([205, 0], { name: 'SubscribeError', message: 'denied', stack: undefined }))
      expect(seen).toEqual([]) // 错误对象不得进入正常事件流
      expect(errSpy).toHaveBeenCalledTimes(1)
      expect(String(errSpy.mock.calls[0][0])).toContain('sessionsChanged')
      proto.feed(frame([204, 0], 'must-not-deliver'))
      expect(seen).toEqual([]) // handlers 已清理：订阅失败后旧 id 不再投递
      sub.dispose()
      client.dispose()
    } finally {
      errSpy.mockRestore()
    }
  })
})

describe('握手超时与连接泄漏（S4）', () => {
  it('WS open 无响应 → 连接超时抛可识别错误，不无限挂起', async () => {
    // TCP 只 accept 不回 WS 握手应答 → 'open' 永不触发
    const socks = new Set<net.Socket>()
    const server = net.createServer((sock) => {
      socks.add(sock)
      sock.on('close', () => socks.delete(sock))
      sock.resume() // 读走升级请求，否则 FIN 不达、close 不回调
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    const home = mkdtempSync(join(tmpdir(), 'zcode-bridge-'))
    try {
      await expect(connectZCodeEngine(home, { url: `ws://127.0.0.1:${port}/ws`, openTimeoutMs: 50, rpcTimeoutMs: 50 }))
        .rejects.toThrow(/connect timeout/)
    } finally {
      rmSync(home, { recursive: true, force: true })
      for (const s of socks) s.destroy()
      await new Promise<void>((r) => server.close(() => r()))
    }
  })

  it('hello RPC 无响应 → handshake timeout 抛错，且 ws 被 terminate（连接不泄漏）', async () => {
    let serverSawClose: Promise<void> | null = null
    const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    wss.on('connection', (sock) => {
      // 收下 WS 连接但不回任何 RPC 帧
      serverSawClose = new Promise<void>((r) => sock.on('close', () => r()))
    })
    await new Promise<void>((r) => wss.on('listening', () => r()))
    const port = (wss.address() as { port: number }).port
    const home = mkdtempSync(join(tmpdir(), 'zcode-bridge-'))
    try {
      await expect(connectZCodeEngine(home, { url: `ws://127.0.0.1:${port}/ws`, openTimeoutMs: 1000, rpcTimeoutMs: 80 }))
        .rejects.toThrow(/handshake timeout/)
      expect(serverSawClose).toBeTruthy() // WS 连接确实建立过
      await serverSawClose // 失败分支统一 terminate：服务端看到连接关闭
    } finally {
      rmSync(home, { recursive: true, force: true })
      await new Promise<void>((r) => wss.close(() => r()))
    }
  })

  it('超时面源级守门：open 与 hello/initialize 每步都挂超时，失败分支统一 terminate', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/engine-bridge.ts'), 'utf8')
    expect(src).toContain('ws.terminate()')
    // withTimeout 至少三处：WS open / helloConversationV4 / initializeConversationV4
    expect(src.match(/withTimeout\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})

describe('ws 帧归一化（X4）：文本帧/二进制帧都正确进解码器', () => {
  it('文本帧（string）按 utf8 进字节，不再被 new Uint8Array(string) 静默清空', () => {
    const text = 'héllo 中文'
    const bytes = wsMessageToVSBuffer(text)
    expect([...bytes.buffer]).toEqual([...Buffer.from(text, 'utf8')])
    // 回归钉死旧缺陷：new Uint8Array('abc') 得空数组、new Uint8Array('3') 得 [0,0,0]，
    // 文本帧静默损坏——归一化后不得再走这条路径。
    expect(new Uint8Array('abc' as unknown as ArrayBuffer).length).toBe(0)
    expect([...bytes.buffer]).not.toEqual([...new Uint8Array(text as unknown as ArrayBuffer)])
  })

  it('二进制帧（Buffer / ArrayBuffer / Buffer[]）原样保真', () => {
    expect([...wsMessageToVSBuffer(Buffer.from([1, 2, 3])).buffer]).toEqual([1, 2, 3])
    expect([...wsMessageToVSBuffer(new Uint8Array([4, 5]).buffer).buffer]).toEqual([4, 5])
    expect([...wsMessageToVSBuffer([Buffer.from([6]), Buffer.from([7, 8])]).buffer]).toEqual([6, 7, 8])
  })
})
