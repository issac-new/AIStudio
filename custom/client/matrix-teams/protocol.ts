// overlay/custom/client/matrix-teams/protocol.ts
// ══ M-A 协议 v2 草稿（未编译未测试，shell 恢复后按 ma-drafts/NOTES.md 应用）══
// v2 变更（架构 spec v1.1 §5 + M-A 计划 T2）：
//   1) TASK_EVENT_TYPES 增 agent.message（bot 徽章消息，PL=0）；渲染留 M-D
//   2) AssignContent 增 parentId / capability / phase / dependsOn 四可选字段；
//      不新增 dueDate——dueAt 已存在（v1 protocol.ts:62），直接复用
//   3) ReceiptStatus 扩 'waiting-human'（HumanGate 挂起态，执行轴收口）
//   4) 新增注册房 agent.profile state 事件（PL=50，本机 bot 只写自己的条目）
// 团队注册房间事件协议（spec §4.2 单一事实源）。
// 事件类型字符串只准在本文件出现（守门测试强制），读写两端一律引用常量。
import { DELIVERY_SCHEMA_VERSION, DELIVERY_STAGES } from './delivery-protocol'

export const TEAM_EVENT_TYPES = {
  account: 'com.swarmstudio.team.account',
  leaders: 'com.swarmstudio.team.leaders',
  duty: 'com.swarmstudio.team.duty',
} as const

export const TASK_EVENT_TYPES = {
  assign: 'com.swarmstudio.task.assign',
  receipt: 'com.swarmstudio.task.receipt',
  message: 'com.swarmstudio.agent.message',
} as const

export const AGENT_PROFILE_EVENT_TYPE = 'com.swarmstudio.agent.profile'

export const REGISTRY_ACCOUNT_DATA_TYPE = 'com.swarmstudio.registry'

const TEAM_EVENT_PREFIX = 'com.swarmstudio.'

export function isSwarmStudioEventType(type: string): boolean {
  return type.startsWith(TEAM_EVENT_PREFIX)
}

/** 建注册房间时的 power level 覆盖（spec §4.2 PL 矩阵）。
 *  events_default/state_default 补齐默认语义：未列出的消息事件 PL=0、state 事件 PL=50，
 *  显式列出的按矩阵覆盖。agent.message 普通消息=0；agent.profile state=50（本机 bot 写自己）。 */
export const REGISTRY_ROOM_POWER_LEVELS = {
  events_default: 0,
  state_default: 50,
  events: {
    [TEAM_EVENT_TYPES.account]: 0,
    [TASK_EVENT_TYPES.receipt]: 0,
    [TASK_EVENT_TYPES.message]: 0,
    [TEAM_EVENT_TYPES.leaders]: 50,
    [TEAM_EVENT_TYPES.duty]: 50,
    [TASK_EVENT_TYPES.assign]: 50,
    [AGENT_PROFILE_EVENT_TYPE]: 50,
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
  /** v2：父任务/案例引用（任务树拆解 fan-out）。 */
  parentId?: string
  /** v2：能力标签（Orchestrator 路由依据，如 'module:payment'、'test'）。 */
  capability?: string[]
  /** v2：交付阶段归属 P1..P6（统计与看板聚合）。 */
  phase?: string
  /** v2：前置任务引用（甘特与关键路径数据源）。 */
  dependsOn?: string[]
  target: { account: string; agentTeam?: string; profile?: string }
  issuedBy: string
  issuedAt: number
}
export type ReceiptStatus = 'created' | 'running' | 'waiting-human' | 'done' | 'failed'
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
const MAX_PARENT_ID = 128
const MAX_CAPABILITIES = 10
const MAX_CAPABILITY_LEN = 64
const CAPABILITY_RE = /^[a-z0-9][a-z0-9:-]*$/
const MAX_DEPENDS = 20
const MAX_AGENTS = 20
const MAX_AGENT_ID = 64
const MAX_AGENT_TYPE = 32
const MAX_LIST_FIELDS = 32
const MAX_LIST_FIELD_LEN = 64
const MAX_TEXT = 4000

function isCapability(v: string): boolean {
  return v.length <= MAX_CAPABILITY_LEN && CAPABILITY_RE.test(v)
}

function parseStringList(v: unknown, maxItems: number, maxLen: number): string[] | null {
  if (!Array.isArray(v) || v.length > maxItems) return null
  const out: string[] = []
  for (const s of v) {
    if (typeof s !== 'string' || !s || s.length > maxLen) return null
    out.push(s)
  }
  return out
}

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
  const parentId = str(raw.parentId)
  if (parentId !== undefined && parentId.length > MAX_PARENT_ID) return null
  const phase = str(raw.phase)
  if (phase !== undefined && !(DELIVERY_STAGES as readonly string[]).includes(phase)) return null
  let capability: string[] | undefined
  if (raw.capability !== undefined) {
    const caps = parseStringList(raw.capability, MAX_CAPABILITIES, MAX_CAPABILITY_LEN)
    if (caps === null) return null
    capability = caps
    if (capability.some(c => !isCapability(c))) return null
  }
  let dependsOn: string[] | undefined
  if (raw.dependsOn !== undefined) {
    const deps = parseStringList(raw.dependsOn, MAX_DEPENDS, MAX_PARENT_ID)
    if (deps === null) return null
    dependsOn = deps
  }
  return {
    taskId, title,
    body: str(raw.body), priority: str(raw.priority), dueAt: num(raw.dueAt),
    parentId, capability, phase, dependsOn,
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
  if (status !== 'created' && status !== 'running' && status !== 'waiting-human' && status !== 'done' && status !== 'failed') return null
  return {
    taskId, status,
    localTaskId: str(raw.localTaskId), reason: str(raw.reason),
    reportedBy, reportedAt,
  }
}

// ── v2：Agent 能力注册（注册房 state 事件，本机 bot 只写自己的条目） ──

export interface AgentDescriptor {
  agentId: string
  agentType: string
  capabilities: string[]
  maxParallel?: number
  needsHumanConfirm?: string[]
  permissions?: string[]
  lastReportAt?: number
}

export interface AgentProfileContent {
  schemaVersion: number
  agents: AgentDescriptor[]
  updatedBy: string
  updatedAt: number
}

export function parseAgentProfileContent(raw: unknown): AgentProfileContent | null {
  if (!isRecord(raw)) return null
  if (raw.schemaVersion !== DELIVERY_SCHEMA_VERSION) return null
  const updatedBy = str(raw.updatedBy)
  const updatedAt = num(raw.updatedAt)
  if (!updatedBy || updatedAt === undefined || !Array.isArray(raw.agents)) return null
  if (raw.agents.length > MAX_AGENTS) return null
  const agents: AgentDescriptor[] = []
  for (const a of raw.agents) {
    if (!isRecord(a)) return null
    const agentId = str(a.agentId)
    const agentType = str(a.agentType)
    if (!agentId || agentId.length > MAX_AGENT_ID) return null
    if (!agentType || agentType.length > MAX_AGENT_TYPE) return null
    const capabilities = parseStringList(a.capabilities, MAX_CAPABILITIES, MAX_CAPABILITY_LEN)
    if (capabilities === null || capabilities.some(c => !isCapability(c))) return null
    const maxParallel = num(a.maxParallel)
    if (maxParallel !== undefined && (!Number.isInteger(maxParallel) || maxParallel < 1)) return null
    let needsHumanConfirm: string[] | undefined
    if (a.needsHumanConfirm !== undefined) {
      const l = parseStringList(a.needsHumanConfirm, MAX_LIST_FIELDS, MAX_LIST_FIELD_LEN)
      if (l === null) return null
      needsHumanConfirm = l
    }
    let permissions: string[] | undefined
    if (a.permissions !== undefined) {
      const l = parseStringList(a.permissions, MAX_LIST_FIELDS, MAX_LIST_FIELD_LEN)
      if (l === null) return null
      permissions = l
    }
    agents.push({
      agentId, agentType, capabilities,
      maxParallel, needsHumanConfirm, permissions, lastReportAt: num(a.lastReportAt),
    })
  }
  return { schemaVersion: DELIVERY_SCHEMA_VERSION, agents, updatedBy, updatedAt }
}

// ── v2：Agent 徽章消息（普通客户端回落显示 text；渲染留 M-D） ──

export interface AgentMessageContent {
  agentId: string
  agentType: string
  text: string
}

export function parseAgentMessageContent(raw: unknown): AgentMessageContent | null {
  if (!isRecord(raw)) return null
  const agentId = str(raw.agentId)
  const agentType = str(raw.agentType)
  const text = str(raw.text)
  if (!agentId || agentId.length > MAX_AGENT_ID) return null
  if (!agentType || agentType.length > MAX_AGENT_TYPE) return null
  if (!text || text.length > MAX_TEXT) return null
  return { agentId, agentType, text }
}
