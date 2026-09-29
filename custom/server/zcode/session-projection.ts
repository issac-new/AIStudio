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

/**
 * 会话条目稳定投影形状（X5 契约归一化）。
 *
 * 取证锚点（upstream/zcode @872ad96）：sessions-index 条目即
 * packages/shared/src/zcode-protocol-v4/sessions-index.ts 的 sessionSummarySchema——
 * { sessionId, workspaceId, parentSessionId?, title, titleSource?, phase,
 *   sessionEnded, hasBackgroundWork, workflowActivity?, pendingInteraction?,
 *   pendingInteractionSummary?, goalStatus?, lastActivityAt, lastAssistantPreview?, createdAt }
 * phase 枚举见 snapshot.ts sessionPhaseSchema：draft/prewarming/running/
 * completedSuccess/completedInterrupted/error。
 *
 * 此前服务端把引擎条目 `session: unknown` 直投 socket、客户端按 {title?,phase?} 裸读，
 * 字段名一变即恒 undefined 且无人发觉。归一化后两端以本形状为唯一事实源：
 * 已知字段显式直取（类型不符即丢弃）；workflow 集成轮起 workflowActivity 亦经
 * normalizeWorkflowActivity 归一化透传（有界 ≤4 runs），其余未知/复合字段仍不透传，
 * 消费端读不到新字段时是「未实现」而非「契约漂移」。
 */
export interface ProjectionSession {
  sessionId: string
  title?: string
  phase?: string
  workspaceId?: string
  parentSessionId?: string
  titleSource?: string
  sessionEnded?: boolean
  hasBackgroundWork?: boolean
  goalStatus?: string
  lastActivityAt?: number
  lastAssistantPreview?: string
  createdAt?: number
  /**
   * 侧栏工作流运行摘要（workflow 集成轮）：zcode sessions-index 的
   * sessionWorkflowActivitySchema 有界投影（≤4 runs）。契约锚点
   * upstream/zcode packages/shared/src/zcode-protocol-v4/sessions-index-workflow-activity.ts。
   */
  workflowActivity?: ProjectionWorkflowActivity
}

/** 站点灯四态（zcode sessionWorkflowPhaseStatusSchema 同词表）。 */
export type ProjectionWorkflowPhaseStatus = 'pending' | 'running' | 'done' | 'failed'

export interface ProjectionWorkflowPhase {
  name: string
  status: ProjectionWorkflowPhaseStatus
  /** 并行站下标（声明表路径才有；退化路缺席）。 */
  alongside?: number[]
}

/** run 终态五词表（zcode workflowRunSchema.shape.status 同词表）。 */
export type ProjectionWorkflowRunStatus = 'pending' | 'running' | 'completed' | 'errored' | 'stopped'

export type ProjectionWorkflowStopReason = 'user' | 'model' | 'provider' | 'interrupted' | 'superseded'

export interface ProjectionWorkflowRunSummary {
  runId: string
  toolCallId?: string
  /** 展示名（= 后台工作标题）。 */
  name?: string
  status: ProjectionWorkflowRunStatus
  stopReason?: ProjectionWorkflowStopReason
  startedAt?: number
  phases: ProjectionWorkflowPhase[]
  currentPhase?: string
  /** status === 'running' 的子代理数。 */
  agentsWorking: number
}

export interface ProjectionWorkflowActivity {
  runs: ProjectionWorkflowRunSummary[]
}

const WORKFLOW_RUN_STATUSES: readonly string[] = ['pending', 'running', 'completed', 'errored', 'stopped']
const WORKFLOW_STOP_REASONS: readonly string[] = ['user', 'model', 'provider', 'interrupted', 'superseded']
const WORKFLOW_PHASE_STATUSES: readonly string[] = ['pending', 'running', 'done', 'failed']
/** 会话级 run 摘要上界（zcode SESSION_WORKFLOW_ACTIVITY_MAX_RUNS = 4）。 */
const WORKFLOW_ACTIVITY_MAX_RUNS = 4

/**
 * 引擎 workflowActivity → 稳定形状。与 normalizeSessionSummary 同纪律：
 * 逐字段显式直取，形状不符整条丢弃（runs 非数组 / 超上界截断 / 单 run 缺
 * runId 或 status 非词表 → 该 run 丢弃，不让坏行污染整份摘要）。
 */
export function normalizeWorkflowActivity(raw: unknown): ProjectionWorkflowActivity | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const runsRaw = (raw as Record<string, unknown>).runs
  if (!Array.isArray(runsRaw)) return undefined
  const runs: ProjectionWorkflowRunSummary[] = []
  for (const item of runsRaw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const runId = str(r.runId)
    const status = str(r.status)
    if (!runId || !status || !WORKFLOW_RUN_STATUSES.includes(status)) continue
    const phasesRaw = Array.isArray(r.phases) ? r.phases : []
    const phases: ProjectionWorkflowPhase[] = []
    for (const p of phasesRaw) {
      if (!p || typeof p !== 'object') continue
      const pr = p as Record<string, unknown>
      const name = str(pr.name)
      const pstatus = str(pr.status)
      if (!name || !pstatus || !WORKFLOW_PHASE_STATUSES.includes(pstatus)) continue
      const alongside = Array.isArray(pr.alongside)
        ? pr.alongside.filter((n): n is number => Number.isInteger(n) && n >= 0)
        : undefined
      phases.push({ name, status: pstatus as ProjectionWorkflowPhaseStatus, ...(alongside?.length ? { alongside } : {}) })
    }
    const stopReason = str(r.stopReason)
    const startedAt = num(r.startedAt)
    const agentsWorking = num(r.agentsWorking)
    runs.push({
      runId,
      ...(str(r.toolCallId) ? { toolCallId: str(r.toolCallId) } : {}),
      ...(str(r.name) ? { name: str(r.name) } : {}),
      status: status as ProjectionWorkflowRunStatus,
      ...(stopReason !== undefined && WORKFLOW_STOP_REASONS.includes(stopReason) ? { stopReason: stopReason as ProjectionWorkflowStopReason } : {}),
      ...(startedAt !== undefined ? { startedAt } : {}),
      phases,
      ...(str(r.currentPhase) ? { currentPhase: str(r.currentPhase) } : {}),
      agentsWorking: agentsWorking !== undefined && agentsWorking >= 0 ? Math.floor(agentsWorking) : 0,
    })
    if (runs.length >= WORKFLOW_ACTIVITY_MAX_RUNS) break
  }
  // 与引擎侧 deriveSessionWorkflowActivity 同姿态：没有任何有效 run → 键整个缺席。
  if (runs.length === 0) return undefined
  return { runs }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

/** 引擎 sessions-index 条目 → 稳定形状；缺 sessionId（非会话条目）返回 null。 */
export function normalizeSessionSummary(raw: unknown): ProjectionSession | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const sessionId = str(r.sessionId)
  if (!sessionId) return null
  const out: ProjectionSession = { sessionId }
  const title = str(r.title)
  if (title !== undefined) out.title = title
  const phase = str(r.phase)
  if (phase !== undefined) out.phase = phase
  const workspaceId = str(r.workspaceId)
  if (workspaceId !== undefined) out.workspaceId = workspaceId
  const parentSessionId = str(r.parentSessionId)
  if (parentSessionId !== undefined) out.parentSessionId = parentSessionId
  const titleSource = str(r.titleSource)
  if (titleSource !== undefined) out.titleSource = titleSource
  const sessionEnded = bool(r.sessionEnded)
  if (sessionEnded !== undefined) out.sessionEnded = sessionEnded
  const hasBackgroundWork = bool(r.hasBackgroundWork)
  if (hasBackgroundWork !== undefined) out.hasBackgroundWork = hasBackgroundWork
  const goalStatus = str(r.goalStatus)
  if (goalStatus !== undefined) out.goalStatus = goalStatus
  const lastActivityAt = num(r.lastActivityAt)
  if (lastActivityAt !== undefined) out.lastActivityAt = lastActivityAt
  const lastAssistantPreview = str(r.lastAssistantPreview)
  if (lastAssistantPreview !== undefined) out.lastAssistantPreview = lastAssistantPreview
  const createdAt = num(r.createdAt)
  if (createdAt !== undefined) out.createdAt = createdAt
  const workflowActivity = normalizeWorkflowActivity(r.workflowActivity)
  if (workflowActivity !== undefined) out.workflowActivity = workflowActivity
  return out
}

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
  | { type: 'session.upserted'; workspaceId: string; sessionId: string; at: number; session: ProjectionSession }
  | { type: 'session.removed'; workspaceId: string; sessionId: string; at: number }
  | { type: 'conversation.frame'; workspaceId: string; sessionId: string; at: number; fromSeq?: number; toSeq?: number; payloadKind?: string; deltaCount: number }
  | { type: 'conversation.branch'; workspaceId: string; sessionId: string; at: number; fromRowId: number; removedRows: number }

/** zcode-agent 通道的投影消费面（engine-bridge 的子集 + sessions-index 组）。 */
export interface ProjectionAgentPort {
  subscribeSessionsIndexV4(params: { workspacePath: string; runtimePolicy?: string }): Promise<{ ack: { subscriptionId: string; mode?: string } }>
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
  /** 行缓存（fork/rewind 锚点）：sessionId → rowId → 行简视图。 */
  rows: Map<string, Map<number, ProjectionRow>>
}

/** 行简视图（forkAssistant/applyFileRewind 的 rowId/entityId 锚源）。 */
export interface ProjectionRow {
  rowId: number
  entityId?: string
  kind: string
  state?: string
  /** 文本摘要（前 80 字——匹配/展示用，不存全文防膨胀）。 */
  text: string
}

/** 引擎行 → 简视图（未知 kind 宽容截取）。 */
function toProjectionRow(row: Record<string, unknown>): ProjectionRow {
  const text = typeof row.text === 'string' ? row.text.slice(0, 80) : ''
  return {
    rowId: Number(row.rowId ?? -1),
    entityId: typeof row.entityId === 'string' ? row.entityId : undefined,
    kind: String(row.kind ?? 'unknown'),
    state: typeof row.state === 'string' ? row.state : undefined,
    text,
  }
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
    const state: WatchState = { workspacePath, disposers: [], conversationSessions: new Set(), fragmentSkips: new Map(), rows: new Map() }
    this.watches.set(workspacePath, state)
    try {
      // 帧回调先注册再订阅：initial 帧走 post-response outbox，订阅应答后才注册会丢首帧
      // （对齐 zcode ui agentSessionsIndexTransport 的 onFrame→subscribe 顺序）；
      // runtimePolicy=existing-only：只接既有运行时，不为投影拉起 CLI 子进程。
      const indexSub = this.agent.onDynamicSessionsIndexFrame({ workspacePath })((wire) => {
        this.consumeSessionsIndexFrame(state, wire)
      })
      state.disposers.push(indexSub)
      const convSub = this.agent.onDynamicConversationFrame({ workspacePath })((wire) => {
        this.consumeConversationFrame(state, wire)
      })
      state.disposers.push(convSub)
      await this.agent.subscribeSessionsIndexV4({ workspacePath, runtimePolicy: 'existing-only' })
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
      const sessions = (payload.snapshot as { sessions?: unknown[] } | undefined)?.sessions ?? []
      for (const s of sessions) {
        // 归一化后投递（X5）：稳定形状见 ProjectionSession；非会话条目可观测不静默。
        const normalized = normalizeSessionSummary(s)
        if (normalized) {
          this.emit({ type: 'session.upserted', workspaceId: state.workspacePath, sessionId: normalized.sessionId, session: normalized, at: this.now() })
        } else {
          this.emit({ type: 'projection.status', workspaceId: state.workspacePath, reason: 'frame_malformed', detail: 'sessions-index snapshot 条目缺 sessionId', at: this.now() })
        }
      }
    } else if (payload.kind === 'deltas' && Array.isArray(payload.deltas)) {
      for (const d of payload.deltas as Array<{ op?: string; session?: unknown; sessionId?: string }>) {
        if (d?.op === 'session.upserted') {
          const normalized = normalizeSessionSummary(d.session)
          if (normalized) {
            this.emit({ type: 'session.upserted', workspaceId: state.workspacePath, sessionId: normalized.sessionId, session: normalized, at: this.now() })
          } else {
            this.emit({ type: 'projection.status', workspaceId: state.workspacePath, reason: 'frame_malformed', detail: 'sessions-index delta 条目缺 sessionId', at: this.now() })
          }
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
    if (payload.kind === 'deltas' && Array.isArray(payload.deltas)) {
      this.applyRowDeltas(state, sessionId, payload.deltas as Array<Record<string, unknown>>)
    }
    this.emit({
      type: 'conversation.frame', workspaceId: state.workspacePath, sessionId, at: this.now(),
      fromSeq: logical.fromSeq, toSeq: logical.toSeq, payloadKind: payload.kind,
      deltaCount: payload.kind === 'deltas' && Array.isArray(payload.deltas) ? payload.deltas.length : 0,
    })
  }

  /** 行缓存维护（v4 三 op：appended/upserted 整行写；removed 截断=分支语义）。 */
  private applyRowDeltas(state: WatchState, sessionId: string, deltas: Array<Record<string, unknown>>): void {
    let rows = state.rows.get(sessionId)
    if (!rows) {
      rows = new Map()
      state.rows.set(sessionId, rows)
    }
    for (const d of deltas) {
      if (d.op === 'row.appended' || d.op === 'row.upserted') {
        const row = d.row as Record<string, unknown> | undefined
        if (row && Number.isFinite(Number(row.rowId))) rows.set(Number(row.rowId), toProjectionRow(row))
      } else if (d.op === 'row.removed') {
        const from = Number(d.fromRowId)
        let removed = 0
        for (const rowId of [...rows.keys()]) {
          if (rowId >= from) { rows.delete(rowId); removed += 1 }
        }
        if (removed > 0) {
          this.emit({
            type: 'conversation.branch', workspaceId: state.workspacePath, sessionId,
            at: this.now(), fromRowId: from, removedRows: removed,
          })
        }
      }
      // row.delta（流式追加）不进缓存：摘要锚点只需终态行；state.updated 与行无关。
    }
  }

  /** 行查询（fork/rewind 锚）：rowId 升序快照。 */
  listRows(workspacePath: string, sessionId: string): ProjectionRow[] {
    const state = this.watches.get(workspacePath)
    if (!state) return []
    const rows = state.rows.get(sessionId)
    if (!rows) return []
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r)
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
