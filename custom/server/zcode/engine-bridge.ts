// overlay[zcode] R4-P1：hermes 服务端 ↔ zcode 引擎服务（:3030）WS 通道桥。
// 嵌接依据：ws-embed-research.md（evidence/20260923-zcode-r4/）——
//   /ws 端点 web-remote-replayable/terminal-client；握手先 helloConversationV4
//   再 initializeConversationV4（clientId 须稳定持久化）；写路径走 v4
//   sendConversationCommandV4；fragment 帧重组列 P2（首批只消费 complete 帧）。
import { createHash } from 'crypto'
import WebSocket from 'ws'
import { VSBuffer, SocketProtocol, ChannelClient, Emitter, ProxyChannel } from './vendor/rpc/index'

export interface ZcodeEngineAgentService {
  helloConversationV4(): Promise<{ protocolVersion: number }>
  initializeConversationV4(hello: Record<string, unknown>): Promise<unknown>
  createSession(params: { workspacePath: string }): Promise<{ session: { sessionId: string } }>
  subscribeConversationV4(params: { workspacePath: string; sessionId: string }): Promise<{ ack: { subscriptionId: string; mode: string } }>
  subscribeSessionsIndexV4(params: { workspacePath: string }): Promise<{ ack: { subscriptionId: string; mode?: string } }>
  sendConversationCommandV4(params: { workspacePath: string; envelope: Record<string, unknown> }): Promise<{ status: string; reasonCode?: string }>
  onDynamicConversationFrame(params: { workspacePath: string }): (cb: (wire: Record<string, unknown>) => void) => { dispose(): void }
  onDynamicSessionsIndexFrame(params: { workspacePath: string }): (cb: (wire: Record<string, unknown>) => void) => { dispose(): void }
  onAgentRuntimeRestarted(cb: (event: Record<string, unknown>) => void): { dispose(): void }
}

export interface ZcodeEngineBridge {
  agent: ZcodeEngineAgentService
  clientId: string
  protocolVersion: number
  readyAt: number
  onReconnected: (cb: () => void) => void
  close(): void
}

interface EngineBridgeOptions {
  url?: string
  token?: string
  clientId?: string
}

/** clientId 稳定性：持久化在数据根（重启同机同 id，zcode 侧会话关联不丢）。 */
function loadOrCreateClientId(homeDir: string): string {
  const path = `${homeDir}/zcode-engine-client-id`
  try {
    const fs = require('fs') as typeof import('fs')
    const existing = fs.readFileSync(path, 'utf8').trim()
    if (existing) return existing
  } catch { /* 首启 */ }
  const created = `hermes-${createHash('sha1').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 16)}`
  try {
    const fs = require('fs') as typeof import('fs')
    fs.mkdirSync(homeDir, { recursive: true })
    fs.writeFileSync(path, created, { mode: 0o600 })
  } catch { /* 落盘失败不阻断，临时 id */ }
  return created
}

function wrapNodeSocket(ws: WebSocket) {
  const onData = new Emitter<VSBuffer>()
  const onClose = new Emitter<void>()
  const onEnd = new Emitter<void>()
  ws.on('message', (raw: Buffer) => onData.fire(VSBuffer.wrap(new Uint8Array(raw))))
  ws.on('close', () => { onClose.fire(); onEnd.fire() })
  ws.on('error', () => { onClose.fire(); onEnd.fire() })
  return {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write: (b: VSBuffer) => { if (ws.readyState === ws.OPEN) ws.send(b.buffer) },
    end: () => ws.close(),
    drain: async () => {},
    dispose: () => ws.close(),
  }
}

/** 连接 + v4 握手（hello → clientHello）。失败抛错（调用方决定重试/降级）。 */
export async function connectZCodeEngine(homeDir: string, opts: EngineBridgeOptions = {}): Promise<ZcodeEngineBridge> {
  const url = opts.url || 'ws://127.0.0.1:3030/ws'
  const token = opts.token ?? process.env.ZCODE_SERVER_AUTH_TOKEN ?? ''
  const target = token ? `${url}?token=${encodeURIComponent(token)}` : url
  const ws = new WebSocket(target)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  const client = new ChannelClient(new SocketProtocol(wrapNodeSocket(ws)))
  const agent = ProxyChannel.toService<ZcodeEngineAgentService>(client.getChannel('zcode-agent'))

  const hello = await agent.helloConversationV4()
  if (!hello || typeof hello.protocolVersion !== 'number') {
    ws.close()
    throw new Error(`zcode 引擎握手失败：helloConversationV4 返回异常 ${JSON.stringify(hello)}`)
  }
  const clientId = opts.clientId || loadOrCreateClientId(homeDir)
  await agent.initializeConversationV4({
    kind: 'clientHello',
    protocolVersion: hello.protocolVersion,
    clientId,
    clientKind: 'web',
    appVersion: 'swarmstudio',
  })

  const reconnectEmitter = new Emitter<void>()
  ws.on('close', () => {
    // 本轮 MVP：断线只报事件；重连与订阅恢复在 P2 一并落（含 onAgentRuntimeRestarted）
    reconnectEmitter.fire()
  })

  return {
    agent,
    clientId,
    protocolVersion: hello.protocolVersion,
    readyAt: Date.now(),
    onReconnected: (cb) => reconnectEmitter.event(cb),
    close: () => { try { client.dispose?.(new Error('closed')) } catch {}; ws.close() },
  }
}

/** 引擎在线探测：只连不发（WS open 即算在线），供健康面。 */
export async function probeZCodeEngine(url = 'ws://127.0.0.1:3030/ws', timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => { try { ws.terminate() } catch {}; resolve(false) }, timeoutMs)
    ws.once('open', () => { clearTimeout(timer); ws.close(); resolve(true) })
    ws.once('error', () => { clearTimeout(timer); resolve(false) })
  })
}
