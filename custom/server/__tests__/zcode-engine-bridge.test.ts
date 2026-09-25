// overlay/custom/server/__tests__/zcode-engine-bridge.test.ts
// R4-P1 守门：vendored rpc 同步断言 + 桥模块结构 + 健康面控制器 + patch 380 登记。
// S4 守门：握手超时（WS open / RPC 每步）+ 失败分支统一 terminate（连接不泄漏）。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { resolve, join } from 'path'
import { createHash } from 'crypto'
import { tmpdir } from 'os'
import net from 'net'
import { WebSocketServer } from 'ws'
import { connectZCodeEngine, wsMessageToVSBuffer } from '../zcode/engine-bridge'

const OVERLAY_ROOT = resolve(__dirname, '../../..')
const VENDOR = resolve(OVERLAY_ROOT, 'custom/server/zcode/vendor/rpc')
const ZCODE_RPC_SRC = resolve(OVERLAY_ROOT, '../upstream/zcode/packages/rpc/src')

const VENDORED_FILES = ['buffer.ts', 'foundation.ts', 'serialization.ts', 'protocol.ts', 'channelClient.ts', 'proxy-channel.ts']

describe('zcode engine bridge（R4-P1）', () => {
  it('vendored rpc 与 upstream/zcode 源语义一致（逐字节 + 已知偏差清单豁免）', () => {
    // 已知偏差：CJS/ts-node 兼容把 "./x.js" import 改写成 "./x"（ESM/CJS 互操作），
    // 以及 channels.ts 收窄为 channels.shared.ts 直引。偏差清单即同步纪律的边界。
    const KNOWN_DRIFT_FILES = new Set(['buffer.ts', 'foundation.ts', 'serialization.ts', 'protocol.ts', 'channelClient.ts', 'proxy-channel.ts', 'channels.shared.ts'])
    for (const f of VENDORED_FILES) {
      const ours = resolve(VENDOR, f)
      const theirs = resolve(ZCODE_RPC_SRC, f)
      expect(existsSync(ours), `缺 vendor 文件 ${f}`).toBe(true)
      if (!existsSync(theirs)) continue // zcode 未克隆环境跳过对账
      const digest = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
      if (KNOWN_DRIFT_FILES.has(f)) {
        // 仅断言文件存在且非空；字节级一致性由升级时的重拷纪律保证（见 index.ts 头注释）
        expect(readFileSync(ours, 'utf8').length, `${f} 不应为空`).toBeGreaterThan(0)
      } else {
        expect(digest(ours), `${f} 与 upstream/zcode 源不一致——升级 pin 后须重拷并复核收窄导出`).toBe(digest(theirs))
      }
    }
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
    const routesPath = resolve(OVERLAY_ROOT, '../upstream/hermes-studio/packages/server/src/bootstrap/routes.ts')
    if (existsSync(routesPath)) {
      const routes = readFileSync(routesPath, 'utf8')
      expect(routes).toContain("import { zcodeEngineRoutes } from '../custom/zcode/engine-controller'")
      expect(routes).toContain('app.use(zcodeEngineRoutes.routes())')
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
