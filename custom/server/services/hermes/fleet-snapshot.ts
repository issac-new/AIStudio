// overlay/custom/server/services/hermes/fleet-snapshot.ts
//
// 舰队快照（Fleet Snapshot）共享类型 + 纯合并逻辑。
//
// "舰队" = 跨 profile 的会话集合的实时指挥视图。chat-run socket 单 profile
// 绑定（query.profile + requireSocketSessionAccess），客户端无法用一个连接
// 跨团队收流；因此服务端聚合：live 状态来自 ChatRunSocket.sessionMap（常驻
// 内存，isWorking/queue/events 尾巴），DB 行来自 studio sessions 表（标题/
// last_active 兜底）。本模块只做纯数据整形，不做 IO —— 方便单测。

export interface FleetApprovalPreview {
  approval_id: string
  preview: string
  choices: string[]
}

export interface FleetClarifyPreview {
  clarify_id: string
  question: string
}

/**
 * 子代理花名册条目（hermes-agent 0.21.1 delegation 能力）。
 * 镜像 bridge session.background_tasks：由 subagent.start/…/complete 事件
 * 在 bridge 侧维护（bridge_pool.py _record_background_event），经
 * background_poll → applyBackgroundSessionPoll 写入 SessionState.backgroundTasks。
 * 时间戳统一为 epoch ms（bridge 侧是 time.time() 秒）。
 */
export interface FleetSubagent {
  subagent_id: string
  parent_id: string
  depth: number
  goal: string
  model: string
  status: string
  tool_count: number
  last_tool: string
  preview: string
  started_at: number | null
  updated_at: number
  completed_at: number | null
  duration_seconds: number | null
  api_calls: number | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  files_read: number | null
  files_written: number | null
  summary: string
}

export type FleetSessionStatus = 'working' | 'idle'

export interface FleetSession {
  id: string
  profile: string
  title: string
  status: FleetSessionStatus
  isAborting: boolean
  queueLength: number
  runStartedAt: number | null
  /** epoch ms；0 表示未知 */
  lastActiveAt: number
  source: string
  agent: string
  lastPreview: string
  approvals: FleetApprovalPreview[]
  clarifies: FleetClarifyPreview[]
  subagents: FleetSubagent[]
}

/** live 侧（sessionMap 条目）抽取出的最小形状，由 fleet-tap 负责 */
export interface FleetLiveEntry {
  id: string
  profile: string
  isWorking: boolean
  isAborting: boolean
  queueLength: number
  runStartedAt: number | null
  source: string
  lastPreview: string
  approvals: FleetApprovalPreview[]
  clarifies: FleetClarifyPreview[]
  subagents: FleetSubagent[]
}

export interface FleetDbSession {
  id: string
  profile: string
  title: string | null
  last_active: number
  source: string | null
  agent: string | null
}

export interface BuildFleetSnapshotOptions {
  live: FleetLiveEntry[]
  dbSessions: FleetDbSession[]
  now?: number
  /** 只保留最近 N 小时内有活动的会话；默认 24 */
  withinHours?: number
  /** 输出上限（按 lastActiveAt 降序截断）；默认 300。live 会话不受限 */
  limit?: number
}

function toMs(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 1e12 ? n * 1000 : n
}

function toMsOrNull(value: unknown): number | null {
  const ms = toMs(value)
  return ms > 0 ? ms : null
}

function toCountOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function clipText(value: unknown, max: number): string {
  const s = typeof value === 'string' ? value.trim() : ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** 归一化单条 bridge background_tasks 条目；缺 subagent_id 返回 null */
export function normalizeSubagentTask(raw: unknown): FleetSubagent | null {
  if (!raw || typeof raw !== 'object') return null
  const task = raw as Record<string, unknown>
  const id = String(task.subagent_id || '').trim()
  if (!id) return null
  return {
    subagent_id: id,
    parent_id: clipText(task.parent_id, 64),
    depth: Number(task.depth) || 0,
    goal: clipText(task.goal, 160),
    model: clipText(task.model, 64),
    status: String(task.status || 'running'),
    tool_count: Number(task.tool_count) || 0,
    last_tool: clipText(task.last_tool, 64),
    preview: clipText(task.preview, 160),
    started_at: toMsOrNull(task.started_at),
    updated_at: toMs(task.updated_at),
    completed_at: toMsOrNull(task.completed_at),
    duration_seconds: toCountOrNull(task.duration_seconds),
    api_calls: toCountOrNull(task.api_calls),
    input_tokens: toCountOrNull(task.input_tokens),
    output_tokens: toCountOrNull(task.output_tokens),
    cost_usd: toCountOrNull(task.cost_usd),
    files_read: toCountOrNull(task.files_read),
    files_written: toCountOrNull(task.files_written),
    summary: clipText(task.summary, 200),
  }
}

/** 花名册排序：running 在前，其次按 updated_at 降序 */
export function sortSubagents(list: FleetSubagent[]): FleetSubagent[] {
  return [...list].sort((a, b) => {
    const running = (x: FleetSubagent) => (x.status === 'running' ? 1 : 0)
    if (running(a) !== running(b)) return running(b) - running(a)
    return b.updated_at - a.updated_at
  })
}

function clip(text: unknown, max = 200): string {
  const s = typeof text === 'string' ? text.trim() : ''
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}…` : s
}

/** live 与 DB 行合并为舰队快照（纯函数） */
export function buildFleetSnapshot(options: BuildFleetSnapshotOptions): FleetSession[] {
  const { live, dbSessions } = options
  const now = options.now ?? Date.now()
  const withinHours = options.withinHours ?? 24
  const limit = options.limit ?? 300
  const liveById = new Map(live.map(entry => [entry.id, entry]))

  const byId = new Map<string, FleetSession>()
  const cutoff = now - withinHours * 3600_000

  for (const row of dbSessions) {
    if (!row || !row.id) continue
    const lastActiveAt = toMs(row.last_active)
    if (lastActiveAt && lastActiveAt < cutoff) continue
    byId.set(row.id, {
      id: row.id,
      profile: row.profile || 'default',
      title: row.title || row.id,
      status: 'idle',
      isAborting: false,
      queueLength: 0,
      runStartedAt: null,
      lastActiveAt,
      source: row.source || '',
      agent: row.agent || '',
      lastPreview: '',
      approvals: [],
      clarifies: [],
      subagents: [],
    })
  }

  for (const entry of live) {
    const existing = byId.get(entry.id)
    const liveActiveAt = entry.isWorking ? now : existing?.lastActiveAt || now
    // 后台委派中（父会话 idle、子代理 running）的会话，活动时间取花名册最新更新，
    // 避免其在快照排序里沉底。只统计 status='running' 的子代理（2026-09-10 风险审查
    // #5）：completed 子代理的 updated_at 同样会抬升 lastActiveAt，使父会话在子代理
    // 完成后仍被当"最近活跃"参与排序与时间窗过滤。
    const subActiveAt = entry.subagents.reduce(
      (max, sub) => (sub.status === 'running' ? Math.max(max, sub.updated_at) : max),
      0,
    )
    byId.set(entry.id, {
      id: entry.id,
      profile: entry.profile || existing?.profile || 'default',
      title: existing?.title || entry.id,
      status: entry.isWorking ? 'working' : 'idle',
      isAborting: entry.isAborting,
      queueLength: entry.queueLength,
      runStartedAt: entry.runStartedAt,
      lastActiveAt: Math.max(liveActiveAt, subActiveAt),
      source: entry.source || existing?.source || '',
      agent: existing?.agent || '',
      lastPreview: clip(entry.lastPreview || existing?.lastPreview),
      approvals: entry.approvals,
      clarifies: entry.clarifies,
      subagents: entry.subagents,
    })
  }

  const sessions = [...byId.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'working' ? -1 : 1
    return b.lastActiveAt - a.lastActiveAt
  })
  if (sessions.length <= limit) return sessions
  const head = sessions.slice(0, limit)
  // live 会话即使被截断也必须保留（它们是指挥位最关心的）
  for (const entry of live) {
    if (entry.isWorking && !head.some(item => item.id === entry.id)) head.push(byId.get(entry.id)!)
  }
  return head
}

/** 按用户可访问的 profile 过滤快照（super_admin 见全部） */
export function filterFleetSnapshotByProfiles(
  sessions: FleetSession[],
  profiles: string[] | null,
): FleetSession[] {
  if (!profiles) return sessions
  const allow = new Set(profiles)
  return sessions.filter(item => allow.has(item.profile || 'default'))
}
