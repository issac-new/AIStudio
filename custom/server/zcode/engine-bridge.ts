// overlay[zcode] R4-P1：hermes 服务端 ↔ zcode 引擎服务（:3030）WS 通道桥。
// 嵌接依据：ws-embed-research.md（evidence/20260923-zcode-r4/）——
//   /ws 端点 web-remote-replayable/terminal-client；握手先 helloConversationV4
//   再 initializeConversationV4（clientId 须稳定持久化）；写路径走 v4
//   sendConversationCommandV4；fragment 帧重组列 P2（首批只消费 complete 帧）。
import { createHash } from 'crypto'
import { basename } from 'path'
import WebSocket from 'ws'
import { VSBuffer, SocketProtocol, ChannelClient, Emitter, ProxyChannel } from './vendor/rpc/index'

export interface ZcodeEngineAgentService {
  helloConversationV4(): Promise<{ protocolVersion: number }>
  initializeConversationV4(hello: Record<string, unknown>): Promise<unknown>
  // v4 通道（2026-10-08 实证接通）：config.mode=引擎任务档（yolo/plan/edit/auto/autoEdit/build），
  // 锚=upstream/zcode packages/shared/src/zcode-protocol-v4/command.ts:39 createSessionRequestedConfigSchema
  // projectId（N34-2）：独立形态引擎要求会话属于已登记项目，缺则 project.remote-project-required。
  createSession(params: { workspacePath: string; config?: { mode?: string }; projectId?: string }): Promise<{ session: { sessionId: string } }>
  listSessions(params: { workspacePath: string }): Promise<Array<{ sessionId: string }>>
  subscribeConversationV4(params: { workspacePath: string; sessionId: string }): Promise<{ ack: { subscriptionId: string; mode: string } }>
  subscribeSessionsIndexV4(params: { workspacePath: string }): Promise<{ ack: { subscriptionId: string; mode?: string } }>
  // projectId＋建会话命令：服务端转发前按 clientId＋commandId 预留任务并绑定该项目（N34-2 第二步）；
  // result＝命令回执的附带结果（如 createSession 的 sessionId、forkAssistant 的子会话 id）。
  // 连接作用域（2026-11-25 隔离引擎实测）：terminal-client 角色下，每条命令的 envelope.clientId
  // 必须等于握手登记的桥接 clientId（vendor/zcode …/zcodeAgentConnectionScope.ts
  // sendConversationCommandV4 → fault.command.clientMismatch）。宿主所有写入口统一用 bridge.clientId。
  sendConversationCommandV4(params: { workspacePath: string; projectId?: string; envelope: Record<string, unknown> }): Promise<{ status: string; reasonCode?: string; result?: unknown }>
  // 只读取水位（N34-1）：返回里的 atRevision/atLogEpoch 是服务端取值时的修订号与日志纪元，
  // 即比对基线命令（forkAssistant/editUserQuery/applyFileRewind/switchCollaborationMode…）
  // 信封必须携带的 baseRevision/baseLogEpoch。走 ProxyChannel 动态代理，调用面见 cas-command.ts。
  // 锚=纯净 4.0 树 packages/services/src/zcode-agent/zcodeAgentService.ts conversationRowsRangeV4；
  // 返回契约=packages/shared/src/zcode-protocol-v4/transport.ts v4ConversationRowsRangeResultSchema。
  conversationRowsRangeV4(params: { workspacePath: string; sessionId: string; beforeRowId?: number; limit: number }): Promise<{ rows: unknown[]; atSeq: number; atRevision: number; atLogEpoch: string; hasMore: boolean }>
  onDynamicConversationFrame(params: { workspacePath: string }): (cb: (wire: Record<string, unknown>) => void) => { dispose(): void }
  onDynamicSessionsIndexFrame(params: { workspacePath: string }): (cb: (wire: Record<string, unknown>) => void) => { dispose(): void }
  onAgentRuntimeRestarted(cb: (event: Record<string, unknown>) => void): { dispose(): void }
  // ── workflow 查询面（workflow 集成轮）──
  // 锚点 upstream/zcode packages/services/src/zcode-agent/zcodeAgentService.ts:
  // conversationWorkflowRunsV4:5322 / conversationWorkflowRunEventsV4:5307 /
  // listSavedWorkflows:3938 / listSavedWorkflowRuns:3974。全只读查询，
  // 走 ProxyChannel 动态代理（接口声明即调用面，返回形状见 zcode v4 result schema）。
  conversationWorkflowRunsV4(params: { workspacePath: string; sessionId: string; limit?: number }): Promise<Record<string, unknown>>
  conversationWorkflowRunEventsV4(params: { workspacePath: string; sessionId: string; runId: string; afterSequence?: number; limit?: number }): Promise<Record<string, unknown>>
  listSavedWorkflows(params: { workspacePath?: string; scope?: string }): Promise<Record<string, unknown>>
  listSavedWorkflowRuns(params: { workspacePath?: string; name?: string; limit: number; scope?: string }): Promise<Record<string, unknown>>
  // overlay 002-import-session-rpc（#22 写入面）：归一化行→imported 会话。
  importSessionV4(params: { workspacePath: string; source: 'codex' | 'kimi' | 'claudeCode'; sourceId: string; rows: Array<{ role: 'user' | 'assistant' | 'tool'; text: string; at: number }> }): Promise<{ sessionId: string; rowsWritten: number }>
  // ── 插件面（2026-10-18 电脑操作接通轮）：listPlugins/setPluginEnabled 锚=
  // upstream/zcode packages/services/src/zcode-agent/zcodeAgent.ts:658/792 与
  // zcodeAgentPluginParams.ts（workspacePath+pluginId+enabled+scope）。插件启停=
  // user 级全局态，CLI 进程读写 ~/.zcode 插件目录并热更新运行态。
  listPlugins(params: { workspacePath: string; configScope?: 'user' | 'workspace' }): Promise<{ plugins: Array<{ id: string; enabled: boolean }>; diagnostics?: Array<Record<string, unknown>> }>
  setPluginEnabled(params: { workspacePath: string; pluginId: string; enabled: boolean; scope?: 'user' | 'workspace'; operationId?: string }): Promise<Record<string, unknown>>
}

/**
 * 引擎项目通道（N34-2，挂账 2026-11-24-zcode-400-pending-batch）。
 * 本仓 zcode:serve 拉起的是独立形态引擎（packages/server entry-http），上游让它以「远端宿主」
 * 身份持库：会话必须属于已登记项目，未登记的工作区建会话即拒（project.remote-project-required；
 * 规则锚=纯净 4.0 树 packages/services/src/project-storage/remote-policy.ts
 * assertRemoteTaskDirectories 与 node.ts createServerHostServices 的身份装配）。
 * 契约锚=packages/services/src/project/contract.ts IProjectService（通道名 project）、
 * project-storage/repository-contract.ts SaveProjectInput / VirtualProject。
 */
export interface ZcodeEngineProjectService {
  readProjects(params?: { includeDeleted?: boolean; hostId?: string }): Promise<Array<{ id: string; hostId: string; deleted: boolean; roots: Array<{ rootPath: string }> }>>
  saveProject(input: { roots?: string[]; hostId?: string; name?: string; defaultName?: string }): Promise<{ id: string; hostId: string; name: string; roots: Array<{ rootPath: string }> }>
}

export interface ZcodeEngineBridge {
  agent: ZcodeEngineAgentService
  project: ZcodeEngineProjectService
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
  /** WS open 超时覆盖 ms（默认 HANDSHAKE_OPEN_TIMEOUT_MS；测试注入小值）。 */
  openTimeoutMs?: number
  /** 握手 RPC 每步超时覆盖 ms（默认 HANDSHAKE_RPC_TIMEOUT_MS；测试注入小值）。 */
  rpcTimeoutMs?: number
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

/**
 * ws 交付帧归一化（X4）：ws 文本帧交付 utf8 string、二进制帧交付 Buffer（另有
 * ArrayBuffer / Buffer[] 形态）。此前 `new Uint8Array(raw)` 只在 raw 为 Buffer 时
 * 成立——文本帧 string 会被按「长度参数」解析成垃圾字节（'str' → 空数组），帧静默
 * 损坏。统一先归一化为 Buffer 再进 VSBuffer 解码器，文本帧与二进制帧同路径保真。
 */
export function wsMessageToVSBuffer(raw: unknown): VSBuffer {
  const buf = typeof raw === 'string'
    ? Buffer.from(raw, 'utf8')
    : Buffer.isBuffer(raw)
      ? raw
      : Array.isArray(raw)
        ? Buffer.concat(raw as Buffer[])
        : Buffer.from(raw as ArrayBuffer)
  return VSBuffer.wrap(new Uint8Array(buf))
}

function wrapNodeSocket(ws: WebSocket) {
  const onData = new Emitter<VSBuffer>()
  const onClose = new Emitter<void>()
  const onEnd = new Emitter<void>()
  ws.on('message', (raw: Buffer | string) => onData.fire(wsMessageToVSBuffer(raw)))
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

/** 握手超时面（S4）：WS open 3s、RPC 每步 5s。引擎不响应时快速失败，不无限挂起。 */
const HANDSHAKE_OPEN_TIMEOUT_MS = 3000
const HANDSHAKE_RPC_TIMEOUT_MS = 5000

/** 超时包装：到点抛可识别错误（消息含 connect/handshake 字样，供上层归类 reason）。 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

/** 连接 + v4 握手（hello → clientHello）。失败抛错（调用方决定重试/降级）。 */
export async function connectZCodeEngine(homeDir: string, opts: EngineBridgeOptions = {}): Promise<ZcodeEngineBridge> {
  const url = opts.url || 'ws://127.0.0.1:3030/ws'
  const token = opts.token ?? process.env.ZCODE_SERVER_AUTH_TOKEN ?? ''
  const target = token ? `${url}?token=${encodeURIComponent(token)}` : url
  const ws = new WebSocket(target)
  // 首帧竞态（N34-13）：引擎在连接建立的同一拍就发出 RPC 初始化帧，可能与连接应答合并成
  // 同一个网络包到达。协议监听必须在等待 'open' 之前挂好——若等 'open' 之后再挂，这一帧会在
  // 监听挂上之前被派发而丢失，ChannelClient 停在「未初始化」、此后所有请求排队不发，
  // 表现为握手超时（隔离引擎实测：约一成的新连接中招）。守门见
  // custom/server/__tests__/zcode-engine-bridge-open-race.test.ts。
  const client = new ChannelClient(new SocketProtocol(wrapNodeSocket(ws)))
  const agent = ProxyChannel.toService<ZcodeEngineAgentService>(client.getChannel('zcode-agent'))
  const project = ProxyChannel.toService<ZcodeEngineProjectService>(client.getChannel('project'))
  const openTimeoutMs = opts.openTimeoutMs ?? HANDSHAKE_OPEN_TIMEOUT_MS
  const rpcTimeoutMs = opts.rpcTimeoutMs ?? HANDSHAKE_RPC_TIMEOUT_MS
  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve())
        ws.once('error', reject)
      }),
      openTimeoutMs,
      `zcode 引擎连接超时（connect timeout ${openTimeoutMs}ms）`,
    )

    const hello = await withTimeout(
      agent.helloConversationV4(), rpcTimeoutMs,
      `zcode 引擎握手超时（handshake timeout：helloConversationV4 ${rpcTimeoutMs}ms）`,
    )
    if (!hello || typeof hello.protocolVersion !== 'number') {
      throw new Error(`zcode 引擎握手失败：helloConversationV4 返回异常 ${JSON.stringify(hello)}`)
    }
    const clientId = opts.clientId || loadOrCreateClientId(homeDir)
    await withTimeout(
      agent.initializeConversationV4({
        kind: 'clientHello',
        protocolVersion: hello.protocolVersion,
        clientId,
        clientKind: 'web',
        appVersion: 'swarmstudio',
      }),
      rpcTimeoutMs,
      `zcode 引擎握手超时（handshake timeout：initializeConversationV4 ${rpcTimeoutMs}ms）`,
    )

    const reconnectEmitter = new Emitter<void>()
    ws.on('close', () => {
      // 本轮 MVP：断线只报事件；重连与订阅恢复在 P2 一并落（含 onAgentRuntimeRestarted）
      reconnectEmitter.fire()
    })

    return {
      agent,
      project,
      clientId,
      protocolVersion: hello.protocolVersion,
      readyAt: Date.now(),
      onReconnected: (cb) => reconnectEmitter.event(cb),
      close: () => { try { client.dispose?.(new Error('closed')) } catch {}; ws.close() },
    }
  } catch (err) {
    // 失败分支统一 terminate 再抛（S4）：此前 hello/initialize 抛错路径不关 ws，连接泄漏。
    // 协议监听在等待 'open' 之前就已挂上（见上），失败时一并撤掉，避免在未打开的连接上留监听。
    try { client.dispose?.(new Error('connect failed')) } catch { /* 已断 */ }
    try { ws.terminate() } catch { /* 已断 */ }
    throw err
  }
}

/**
 * 确保工作区在引擎里是一个未删除的已登记项目，返回项目 id（建会话前调用，N34-2）。
 * 独立形态引擎的「按根目录复用或新建」入口（reuseExistingRoot）只对本机身份开放
 * （project.invalid-directory-open），所以这里分两步：先在项目通道里按根目录找未删除的
 * 单根项目，找不到再新建。新建的项目归在引擎自己的宿主身份下，不进桌面版本机项目列表。
 * 同一工作区的并发调用在进程内合并成一次，避免同时 miss 建出重复项目。
 *
 * 路径形态约束（2026-11-25 隔离引擎实测，回归锁见 zcode-engine-bridge.test.ts）：登记与查找
 * 一律沿用调用方给定的路径字符串，不做真实路径改写。引擎建会话时按「项目根目录 === 会话
 * 工作区」逐字校验（不符即拒 project.cwd-not-in-roots），而会话用的是同一个给定字符串；
 * 若这里改写成真实路径（解析 /tmp、符号链接），两者就对不上。代价：同一目录的不同写法
 * 会各得一个项目——每次新建都有一行日志，累积可见。
 */
const ensuring = new Map<string, Promise<string>>()

export async function ensureEngineProject(project: Pick<ZcodeEngineProjectService, 'readProjects' | 'saveProject'>, workspacePath: string): Promise<string> {
  let inflight = ensuring.get(workspacePath)
  if (!inflight) {
    inflight = ensureEngineProjectUncached(project, workspacePath).finally(() => ensuring.delete(workspacePath))
    ensuring.set(workspacePath, inflight)
  }
  return inflight
}

async function ensureEngineProjectUncached(project: Pick<ZcodeEngineProjectService, 'readProjects' | 'saveProject'>, workspacePath: string): Promise<string> {
  const projectIdOf = (value: unknown): string | null => {
    const id = (value as { id?: unknown } | null | undefined)?.id
    return typeof id === 'string' && id ? id : null
  }
  const projects = await project.readProjects({ includeDeleted: false })
  if (Array.isArray(projects)) {
    const existing = projects.find((p) => !p.deleted && p.roots?.length === 1 && p.roots[0]?.rootPath === workspacePath)
    const found = projectIdOf(existing)
    if (found) return found
  }
  const saved = await project.saveProject({ roots: [workspacePath], defaultName: basename(workspacePath) || workspacePath })
  const id = projectIdOf(saved)
  if (!id) throw new Error('project.ensure-failed：引擎未返回项目标识')
  // 新建留痕：该函数每次派单建会话都调用，项目随派单累积时此日志是排查锚点。
  console.log(`[zcode] 引擎项目登记：新建「${basename(workspacePath) || workspacePath}」→ ${id}（root=${workspacePath}）`)
  return id
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
