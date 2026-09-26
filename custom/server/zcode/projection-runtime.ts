// overlay[zcode] R4-P2：投影运行时——桥连接生命周期 + 投影实例 + socket 扇出。
//
// 常驻单例（进程内）；引擎不在线时 watch 请求以 engine_unreachable 落 status 事件
// 并保留 watch 意图，连接建立（或重启）后重放。重连语义：
//   - bridge.onReconnected（WS 断开）→ 重连
//   - onAgentRuntimeRestarted（引擎进程重启，订阅面作废）→ 重连并重放全部 watch
// 每次重连重建 ZcodeSessionProjection（订阅 id 换代，旧实例废弃）。
import { EventEmitter } from 'events'
import { connectZCodeEngine, type ZcodeEngineBridge } from './engine-bridge'
import { ZcodeSessionProjection, type ProjectionAgentPort, type ProjectionEvent } from './session-projection'
import { emitZcodeProjectionEvent } from './projection-socket'

export interface ProjectionRuntimeOptions {
  homeDir?: string
  url?: string
  token?: string
  now?: () => number
  /** 连接重试间隔（默认 10s）；测试注入 0 走即时路径。 */
  retryDelayMs?: number
  log?: (msg: string, meta?: Record<string, unknown>) => void
}

interface WatchIntent {
  workspacePath: string
  conversationSessions: Set<string>
}

export class ZcodeProjectionRuntime {
  private readonly opts: Required<Pick<ProjectionRuntimeOptions, 'retryDelayMs'>> & ProjectionRuntimeOptions
  private bridge: ZcodeEngineBridge | null = null
  private projection: ZcodeSessionProjection | null = null
  private readonly intents = new Map<string, WatchIntent>()
  private connecting: Promise<void> | null = null
  private disposed = false
  private restartSub: { dispose(): void } | null = null
  private readonly model = new EventEmitter()

  constructor(opts: ProjectionRuntimeOptions = {}) {
    this.opts = { retryDelayMs: 10_000, ...opts }
  }

  /** watch 状态流（status 事件也在连接失败时产出，cockpit 可挂 chip）。 */
  onEvent(cb: (event: ProjectionEvent) => void): { dispose(): void } {
    this.model.on('event', cb)
    return { dispose: () => this.model.off('event', cb) }
  }

  get watching(): Array<{ workspacePath: string; conversationSessions: string[] }> {
    if (this.projection) return this.projection.snapshot()
    return [...this.intents.values()].map((w) => ({ workspacePath: w.workspacePath, conversationSessions: [...w.conversationSessions] }))
  }

  get connected(): boolean {
    return this.bridge !== null
  }

  /** watch 意图是否登记（S6：控制器按实际意图状态回报 retained，不再无条件 true）。 */
  /** 行查询（fork/rewind 锚点）：委托投影实例的行缓存。 */
  listRows(workspacePath: string, sessionId: string): Array<{ rowId: number; entityId?: string; kind: string; state?: string; text: string }> {
    return this.projection ? this.projection.listRows(workspacePath, sessionId) : []
  }

  hasWatchIntent(workspacePath: string): boolean {
    return this.intents.has(workspacePath)
  }

  /** 在已连接桥上执行引擎调用（未连接先 ensureConnected；断言面供派单链 P3 等复用）。 */
  async withAgent<T>(fn: (agent: NonNullable<ZcodeEngineBridge['agent']>) => Promise<T>): Promise<T> {
    await this.ensureConnected()
    if (!this.bridge) throw new Error('zcode 引擎未连接')
    return fn(this.bridge.agent)
  }

  async watchWorkspace(workspacePath: string): Promise<void> {
    if (!this.intents.has(workspacePath)) this.intents.set(workspacePath, { workspacePath, conversationSessions: new Set() })
    await this.ensureConnected()
    if (this.projection) await this.projection.watchWorkspace(workspacePath)
  }

  async watchSession(workspacePath: string, sessionId: string): Promise<void> {
    const intent = this.intents.get(workspacePath)
    if (!intent) throw new Error(`workspace 未 watch：${workspacePath}`)
    intent.conversationSessions.add(sessionId)
    await this.ensureConnected()
    if (this.projection) await this.projection.watchSession(workspacePath, sessionId)
  }

  async unwatch(workspacePath: string): Promise<void> {
    this.intents.delete(workspacePath)
    this.projection?.stop(workspacePath)
  }

  dispose(): void {
    this.disposed = true
    this.projection?.stop()
    this.bridge?.close()
    this.bridge = null
    this.projection = null
  }

  private emit(event: ProjectionEvent): void {
    this.model.emit('event', event)
    emitZcodeProjectionEvent(undefined, event)
  }

  private async ensureConnected(): Promise<void> {
    if (this.bridge) return
    if (!this.connecting) this.connecting = this.connect().finally(() => { this.connecting = null })
    return this.connecting
  }

  private async connect(): Promise<void> {
    if (this.disposed || this.bridge) return
    try {
      const bridge = await connectZCodeEngine(this.opts.homeDir ?? `${process.env.HOME ?? '/tmp'}/.hermes/zcode-engine`, {
        url: this.opts.url, token: this.opts.token,
      })
      this.bridge = bridge
      this.attach(bridge)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      for (const intent of this.intents.values()) {
        this.emit({
          type: 'projection.status', workspaceId: intent.workspacePath,
          reason: /handshake|protocolVersion/i.test(detail) ? 'handshake_failed' : 'engine_unreachable',
          detail, at: (this.opts.now ?? Date.now)(),
        })
      }
      if (this.disposed) return
      // 引擎可能稍后起来：延迟重试，间隔后若有 watch 意图再连。
      const delay = this.opts.retryDelayMs
      if (delay > 0) {
        // 失败的重试必须 catch（S5）：悬浮 promise 会产生 unhandledRejection 崩进程；
        // 失败本身已落 status 事件并再排下一轮重试，这里吞掉返回值即可。
        setTimeout(() => { if (!this.disposed && this.intents.size > 0) void this.ensureConnected().catch(() => {}) }, delay)
      }
      throw err
    }
  }

  private attach(bridge: ZcodeEngineBridge): void {
    const projection = new ZcodeSessionProjection({
      agent: bridge.agent as unknown as ProjectionAgentPort,
      now: this.opts.now,
      log: this.opts.log,
    })
    projection.onEvent((event) => this.emit(event))
    this.projection = projection
    bridge.onReconnected(() => { void this.handleDisconnect() })
    this.restartSub = bridge.agent.onAgentRuntimeRestarted(() => { void this.handleDisconnect() })
    // 建立后重放全部 watch 意图（首轮 attach 与重连重放共用此路径）。
    void this.replayIntents()
  }

  private async handleDisconnect(): Promise<void> {
    if (!this.bridge) return
    this.projection?.stop()
    this.projection = null
    try { this.restartSub?.dispose() } catch { /* 已断 */ }
    this.restartSub = null
    try { this.bridge.close() } catch { /* 已断 */ }
    this.bridge = null
    try { await this.ensureConnected() } catch { /* 失败已落 status + 重试已排程 */ }
  }

  private async replayIntents(): Promise<void> {
    const projection = this.projection
    if (!projection) return
    for (const intent of this.intents.values()) {
      try {
        await projection.watchWorkspace(intent.workspacePath)
        for (const sessionId of intent.conversationSessions) {
          try { await projection.watchSession(intent.workspacePath, sessionId) } catch { /* 单会话失败已落 status */ }
        }
      } catch { /* watch 失败已落 status 事件 */ }
    }
  }
}

/** 进程级单例（dev 单实例假设；多实例部署时按数据根分键）。 */
let runtimeSingleton: ZcodeProjectionRuntime | null = null

export function getZcodeProjectionRuntime(opts?: ProjectionRuntimeOptions): ZcodeProjectionRuntime {
  if (!runtimeSingleton) runtimeSingleton = new ZcodeProjectionRuntime(opts)
  return runtimeSingleton
}
