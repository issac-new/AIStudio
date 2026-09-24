// overlay[zcode] R4-P2：v4 会话投影——订阅 sessions-index / conversation topic，
// complete 物理帧归一化为统筹事件（session.upserted / session.removed /
// conversation.frame / projection.status），推给驾驶舱数据面。
//
// 帧契约锚点（upstream/zcode @872ad96）：
//   wire 封装 packages/shared/src/zcode-protocol-v4/wire.ts（complete 携带 logical
//   frame 于 .frame；fragment 只有 dataBase64 分片，重组列后批，现状按 topic 计数
//   并以 frame_fragment_skipped 透传）。
//   logical frame transport.ts createTopicFrameSchema：{topic, subscriptionId,
//   fromSeq, toSeq, sentAt, payload:{kind:'snapshot'|'deltas',...}}；
//   sessions-index delta op ∈ session.upserted / session.removed（sessions-index.ts）。
//   服务面 zcodeAgentService.ts:5494 subscribeSessionsIndexV4 / :5473
//   onDynamicConversationFrame / onDynamicSessionsIndexFrame（workspace 键回调，
//   帧自带 topic 供路由）。
import { EventEmitter } from 'events'
import { coerceDispatchReasonCode, type DispatchReasonCode } from './dispatch-reasons'

/** wire 物理帧的最小消费面（complete 携带 logical frame；fragment 只识别计数）。 */
export interface ZcodeWireFrameLike {
  kind?: string
  topic?: string
  subscriptionId?: string
  frame?: TopicFrameLike
}

interface TopicFrameLike {
  topic?: string
  subscriptionId?: string
  fromSeq?: number
  toSeq?: number
  payload?: { kind?: string; snapshot?: unknown; deltas?: unknown[] }
}

export type ProjectionEvent =
  | { type: 'projection.status'; workspaceId: string; reason: DispatchReasonCode; detail?: string; at: number }
  | { type: 'session.upserted'; workspaceId: string; sessionId: string; at: number; session: unknown }
  | { type: 'session.removed'; workspaceId: string; sessionId: string; at: number }
  | { type: 'conversation.frame'; workspaceId: string; sessionId: string; at: number; fromSeq?: number; toSeq?: number; payloadKind?: string; deltaCount: number }

/** zcode-agent 通道的投影消费面（engine-bridge 的子集 + sessions-index 组）。 */
export interface ProjectionAgentPort {
  subscribeSessionsIndexV4(params: { workspacePath: string }): Promise<{ ack: { subscriptionId: string; mode?: string } }>
  subscribeConversationV4(params: { workspacePath: string; sessionId: string }): Promise<{ ack: { subscriptionId: string; mode?: string } }>
  onDynamicSessionsIndexFrame(params: { workspacePath: string }): (cb: (wire: ZcodeWireFrameLike) => void) => { dispose(): void }
  onDynamicConversationFrame(params: { workspacePath: string }): (cb: (wire: ZcodeWireFrameLike) => void) => { dispose(): void }
  onAgentRuntimeRestarted?(): (cb: (event: unknown) => void) => { dispose(): void }
}

export interface SessionProjectionOptions {
  agent: ProjectionAgentPort
  /** workspacePath → workspaceId 的稳定映射（默认取路径最后一段之外的全路径 hash 不够直观；投影事件直接用 workspacePath 作 id）。 */
  now?: () => number
  log?: (msg: string, meta?: Record<string, unknown>) => void
}

interface WatchState {
  workspacePath: string
  disposers: Array<{ dispose(): void }>
  conversationSessions: Set<string>
  fragmentSkips: Map<string, number>
}

/**
 * 单引擎连接上的会话投影。生命周期由调用方（projection runtime）管理；
 * 引擎重启/断线后由调用方重建并重放 watch（本类不自行重连）。
 */
export class ZcodeSessionProjection {
  private readonly agent: ProjectionAgentPort
  private readonly now: () => number
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void
  private readonly watches = new Map<string, WatchState>()
  readonly events = new EventEmitter()

  constructor(opts: SessionProjectionOptions) {
    this.agent = opts.agent
    this.now = opts.now ?? Date.now
    this.log = opts.log ?? (() => {})
    this.events.setMaxListeners(50)
  }

  onEvent(cb: (event: ProjectionEvent) => void): { dispose(): void } {
    this.events.on('projection', cb)
    return { dispose: () => this.events.off('projection', cb) }
  }

  /** 订阅 workspace 的 sessions-index（列表活性）并开始消费帧。幂等。 */
  async watchWorkspace(workspacePath: string): Promise<void> {
    if (this.watches.has(workspacePath)) return
    const state: WatchState = { workspacePath, disposers: [], conversationSessions: new Set(), fragmentSkips: new Map() }
    this.watches.set(workspacePath, state)
    try {
      await this.agent.subscribeSessionsIndexV4({ workspacePath })
      const indexSub = this.agent.onDynamicSessionsIndexFrame({ workspacePath })((wire) => {
        this.consumeSessionsIndexFrame(state, wire)
      })
      state.disposers.push(indexSub)
      // conversation 回调按 workspace 键控（服务面无会话级回调），帧自带 topic 路由；
      // watchSession 只负责 subscribe，消费面在此统一注册。
      const convSub = this.agent.onDynamicConversationFrame({ workspacePath })((wire) => {
        this.consumeConversationFrame(state, wire)
      })
      state.disposers.push(convSub)
    } catch (err) {
      this.watches.delete(workspacePath)
      this.emit({
        type: 'projection.status', workspaceId: workspacePath,
        reason: err instanceof Error && /connect|ECONNREFUSED|handshake/i.test(err.message) ? 'engine_unreachable' : 'subscription_failed',
        detail: err instanceof Error ? err.message : String(err), at: this.now(),
      })
      throw err
    }
  }

  /** 订阅单会话 conversation topic（在已 watch 的 workspace 上）。幂等。 */
  async watchSession(workspacePath: string, sessionId: string): Promise<void> {
    const state = this.watches.get(workspacePath)
    if (!state) throw new Error(`workspace 未投影：${workspacePath}`)
    if (state.conversationSessions.has(sessionId)) return
    try {
      await this.agent.subscribeConversationV4({ workspacePath, sessionId })
      state.conversationSessions.add(sessionId)
    } catch (err) {
      this.emit({
        type: 'projection.status', workspaceId: workspacePath,
        reason: 'subscription_failed',
        detail: `conversation ${sessionId}: ${err instanceof Error ? err.message : String(err)}`, at: this.now(),
      })
      throw err
    }
  }

  /** 当前 watch 面（状态查询/重启重放用）。 */
  snapshot(): Array<{ workspacePath: string; conversationSessions: string[] }> {
    return [...this.watches.values()].map((w) => ({ workspacePath: w.workspacePath, conversationSessions: [...w.conversationSessions] }))
  }

  stop(workspacePath?: string): void {
    const targets = workspacePath ? [this.watches.get(workspacePath)].filter(Boolean) as WatchState[] : [...this.watches.values()]
    for (const w of targets) {
      for (const d of w.disposers) { try { d.dispose() } catch { /* 引擎侧已断 */ } }
      this.watches.delete(w.workspacePath)
    }
  }

  private consumeSessionsIndexFrame(state: WatchState, wire: ZcodeWireFrameLike): void {
    const logical = this.acceptWire(state, wire)
    if (!logical) return
    const payload = logical.payload ?? {}
    if (payload.kind === 'snapshot') {
      const sessions = (payload.snapshot as { sessions?: Array<{ sessionId?: string }> } | undefined)?.sessions ?? []
      for (const s of sessions) {
        if (s && typeof s.sessionId === 'string') {
          this.emit({ type: 'session.upserted', workspaceId: state.workspacePath, sessionId: s.sessionId, session: s, at: this.now() })
        }
      }
    } else if (payload.kind === 'deltas' && Array.isArray(payload.deltas)) {
      for (const d of payload.deltas as Array<{ op?: string; session?: { sessionId?: string }; sessionId?: string }>) {
        if (d?.op === 'session.upserted' && d.session?.sessionId) {
          this.emit({ type: 'session.upserted', workspaceId: state.workspacePath, sessionId: d.session.sessionId, session: d.session, at: this.now() })
        } else if (d?.op === 'session.removed' && typeof d.sessionId === 'string') {
          this.emit({ type: 'session.removed', workspaceId: state.workspacePath, sessionId: d.sessionId, at: this.now() })
        } else {
          this.emit({ type: 'projection.status', workspaceId: state.workspacePath, reason: 'frame_malformed', detail: 'sessions-index delta op 未知或缺 sessionId', at: this.now() })
        }
      }
    } else {
      this.emit({ type: 'projection.status', workspaceId: state.workspacePath, reason: 'frame_malformed', detail: `payload.kind=${String(payload.kind)}`, at: this.now() })
    }
  }

  private consumeConversationFrame(state: WatchState, wire: ZcodeWireFrameLike): void {
    const logical = this.acceptWire(state, wire)
    if (!logical) return
    const topic = logical.topic ?? wire.topic ?? ''
    const sessionId = topic.startsWith('conversation/') ? topic.slice('conversation/'.length) : ''
    if (!sessionId) {
      this.emit({ type: 'projection.status', workspaceId: state.workspacePath, reason: 'frame_malformed', detail: `conversation topic 非法：${topic}`, at: this.now() })
      return
    }
    const payload = logical.payload ?? {}
    this.emit({
      type: 'conversation.frame', workspaceId: state.workspacePath, sessionId, at: this.now(),
      fromSeq: logical.fromSeq, toSeq: logical.toSeq, payloadKind: payload.kind,
      deltaCount: payload.kind === 'deltas' && Array.isArray(payload.deltas) ? payload.deltas.length : 0,
    })
  }

  /** wire 帧准入：complete 才有 logical frame；fragment 按 topic 计数并透传 reason。 */
  private acceptWire(state: WatchState, wire: ZcodeWireFrameLike): TopicFrameLike | null {
    if (wire?.kind === 'fragment') {
      const key = wire.topic ?? '(no-topic)'
      const n = (state.fragmentSkips.get(key) ?? 0) + 1
      state.fragmentSkips.set(key, n)
      this.emit({ type: 'projection.status', workspaceId: state.workspacePath, reason: 'frame_fragment_skipped', detail: `${key} ×${n}`, at: this.now() })
      return null
    }
    if (wire?.kind !== 'complete' || !wire.frame) {
      this.emit({ type: 'projection.status', workspaceId: state.workspacePath, reason: 'frame_malformed', detail: `wire.kind=${String(wire?.kind)}`, at: this.now() })
      return null
    }
    return wire.frame
  }

  private emit(event: ProjectionEvent): void {
    this.events.emit('projection', event)
  }
}

/** 引擎拒绝命令时把引擎侧 reason 透传收口为词表值（未知值不炸、可观测）。 */
export function engineReasonToDispatchReason(engineReason: unknown): DispatchReasonCode {
  return coerceDispatchReasonCode(engineReason)
}
