// overlay/custom/client/matrix-teams/protocol.ts
// 团队注册房间事件协议（spec §4.2 单一事实源）。
// 事件类型字符串只准在本文件出现（守门测试强制），读写两端一律引用常量。
export const TEAM_EVENT_TYPES = {
  account: 'com.swarmstudio.team.account',
  leaders: 'com.swarmstudio.team.leaders',
  duty: 'com.swarmstudio.team.duty',
} as const

export const TASK_EVENT_TYPES = {
  assign: 'com.swarmstudio.task.assign',
  receipt: 'com.swarmstudio.task.receipt',
} as const

export const REGISTRY_ACCOUNT_DATA_TYPE = 'com.swarmstudio.registry'

const TEAM_EVENT_PREFIX = 'com.swarmstudio.'

export function isSwarmStudioEventType(type: string): boolean {
  return type.startsWith(TEAM_EVENT_PREFIX)
}

/** 建注册房间时的 power level 覆盖（spec §4.2 PL 矩阵）。
 *  events_default/state_default 补齐默认语义：未列出的消息事件 PL=0、state 事件 PL=50，
 *  显式列出的按矩阵覆盖。 */
export const REGISTRY_ROOM_POWER_LEVELS = {
  events_default: 0,
  state_default: 50,
  events: {
    [TEAM_EVENT_TYPES.account]: 0,
    [TASK_EVENT_TYPES.receipt]: 0,
    [TEAM_EVENT_TYPES.leaders]: 50,
    [TEAM_EVENT_TYPES.duty]: 50,
    [TASK_EVENT_TYPES.assign]: 50,
  },
} as const

export interface AgentTeam {
  slug: string
  name: string
  profiles: string[]
  defaultProfile?: string
}
export interface AccountContent {
  displayName: string
  agentTeams: AgentTeam[]
  updatedAt: number
}
export interface LeadersContent { leaders: string[] }
export interface DutyContent {
  assigneeKind: 'account' | 'agentTeam'
  assigneeId: string
  roomName?: string
  updatedBy: string
  updatedAt: number
}
export interface AssignContent {
  taskId: string
  title: string
  body?: string
  priority?: string
  dueAt?: number
  target: { account: string; agentTeam?: string; profile?: string }
  issuedBy: string
  issuedAt: number
}
export type ReceiptStatus = 'created' | 'running' | 'done' | 'failed'
export interface ReceiptContent {
  taskId: string
  status: ReceiptStatus
  localTaskId?: string
  reason?: string
  reportedBy: string
  reportedAt: number
}

export function agentTeamGlobalId(ownerUserId: string, slug: string): string {
  return `${ownerUserId}/${slug}`
}

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'team'
}

// ── 解析器：非法输入一律返回 null（spec §5 容错），不抛 ──
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function str(v: unknown): string | undefined { return typeof v === 'string' ? v : undefined }
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

const MAX_TEAMS = 20
const MAX_PROFILES = 20

export function parseAccountContent(raw: unknown): AccountContent | null {
  if (!isRecord(raw)) return null
  const displayName = str(raw.displayName)
  const updatedAt = num(raw.updatedAt)
  if (!displayName || updatedAt === undefined || !Array.isArray(raw.agentTeams)) return null
  if (raw.agentTeams.length > MAX_TEAMS) return null
  const agentTeams: AgentTeam[] = []
  for (const t of raw.agentTeams) {
    if (!isRecord(t)) return null
    const slug = str(t.slug)
    const name = str(t.name)
    if (!slug || !name || !Array.isArray(t.profiles) || t.profiles.length > MAX_PROFILES) return null
    const profiles: string[] = []
    for (const p of t.profiles) {
      if (typeof p !== 'string') return null
      profiles.push(p)
    }
    agentTeams.push({ slug, name, profiles, defaultProfile: str(t.defaultProfile) })
  }
  return { displayName, agentTeams, updatedAt }
}

export function parseLeadersContent(raw: unknown): LeadersContent | null {
  if (!isRecord(raw) || !Array.isArray(raw.leaders)) return null
  const leaders: string[] = []
  for (const l of raw.leaders) {
    if (typeof l !== 'string') return null
    leaders.push(l)
  }
  return { leaders }
}

export function parseDutyContent(raw: unknown): DutyContent | null {
  if (!isRecord(raw)) return null
  const kind = str(raw.assigneeKind)
  const assigneeId = str(raw.assigneeId)
  const updatedBy = str(raw.updatedBy)
  const updatedAt = num(raw.updatedAt)
  if (!assigneeId || !updatedBy || updatedAt === undefined) return null
  if (kind !== 'account' && kind !== 'agentTeam') return null
  return { assigneeKind: kind, assigneeId, roomName: str(raw.roomName), updatedBy, updatedAt }
}

export function parseAssignContent(raw: unknown): AssignContent | null {
  if (!isRecord(raw)) return null
  const taskId = str(raw.taskId)
  const title = str(raw.title)
  const issuedBy = str(raw.issuedBy)
  const issuedAt = num(raw.issuedAt)
  if (!taskId || !title || !issuedBy || issuedAt === undefined) return null
  if (!isRecord(raw.target)) return null
  const account = str(raw.target.account)
  if (!account) return null
  return {
    taskId, title,
    body: str(raw.body), priority: str(raw.priority), dueAt: num(raw.dueAt),
    target: { account, agentTeam: str(raw.target.agentTeam), profile: str(raw.target.profile) },
    issuedBy, issuedAt,
  }
}

export function parseReceiptContent(raw: unknown): ReceiptContent | null {
  if (!isRecord(raw)) return null
  const taskId = str(raw.taskId)
  const reportedBy = str(raw.reportedBy)
  const reportedAt = num(raw.reportedAt)
  const status = str(raw.status)
  if (!taskId || !reportedBy || reportedAt === undefined) return null
  if (status !== 'created' && status !== 'running' && status !== 'done' && status !== 'failed') return null
  return {
    taskId, status,
    localTaskId: str(raw.localTaskId), reason: str(raw.reason),
    reportedBy, reportedAt,
  }
}
