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
    })
  }

  for (const entry of live) {
    const existing = byId.get(entry.id)
    const liveActiveAt = entry.isWorking ? now : existing?.lastActiveAt || now
    byId.set(entry.id, {
      id: entry.id,
      profile: entry.profile || existing?.profile || 'default',
      title: existing?.title || entry.id,
      status: entry.isWorking ? 'working' : 'idle',
      isAborting: entry.isAborting,
      queueLength: entry.queueLength,
      runStartedAt: entry.runStartedAt,
      lastActiveAt: liveActiveAt,
      source: entry.source || existing?.source || '',
      agent: existing?.agent || '',
      lastPreview: clip(entry.lastPreview || existing?.lastPreview),
      approvals: entry.approvals,
      clarifies: entry.clarifies,
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
