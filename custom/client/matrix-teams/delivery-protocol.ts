// overlay/custom/client/matrix-teams/delivery-protocol.ts
// ══ M-A 协议 v2 草稿（未编译未测试，shell 恢复后按 ma-drafts/NOTES.md 应用）══
// v2 变更（架构 spec v1.1 §5 + M-A 计划 T1）：
//   1) schemaVersion 1→2：读面双认 1|2（在途 v1 案例房不丢状态），写面只写 2，未知版本仍降级只读
//   2) CaseContent 增 projectId（多项目维度）
//   3) DELIVERY_GATES 扩 R1-R4（任务级评审门）；HUMAN_GATES 扩为 G1/G5+R1-R4（R 门任何 verdict 须人拍板）
//   4) GateContent 增 signoff（每事件单条、本人签核；多人会签=多条事件，aggregateSignoffs 投影聚合）
//   5) 新增 project index account data（两级索引：项目 → 案例房）
//   6) 新增 aggregateSignoffs（全员 pass 才 pass，任一 reject 即 reject，否则 conditional）
// 事件类型字符串只准在本文件出现（守门测试强制，模式同 protocol.ts）。
// 容错纪律同 protocol.ts：非法输入一律返回 null，不抛。
export const DELIVERY_SCHEMA_VERSION = 2
/** 读面双认：v1 在途事件仍可投影；写面只写 DELIVERY_SCHEMA_VERSION。 */
const KNOWN_SCHEMA_VERSIONS: readonly number[] = [1, 2]

export const DELIVERY_EVENT_TYPES = {
  case: 'com.swarmstudio.delivery.case',
  stage: 'com.swarmstudio.delivery.stage',
  gate: 'com.swarmstudio.delivery.gate',
} as const

export const DELIVERY_INDEX_ACCOUNT_DATA_TYPE = 'com.swarmstudio.delivery.index'
export const PROJECT_INDEX_ACCOUNT_DATA_TYPE = 'com.swarmstudio.project'

const DELIVERY_EVENT_PREFIX = 'com.swarmstudio.delivery.'

export function isDeliveryEventType(type: string): boolean {
  return type.startsWith(DELIVERY_EVENT_PREFIX)
}

export const DELIVERY_STAGES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const
export const DELIVERY_GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'R1', 'R2', 'R3', 'R4'] as const
/** 需人类 sender 的门：G1 需求冻结 / G5 发布准入（spec §6）；R1-R4 任务级评审（spec v1.1 §5.4：任何 verdict 须人拍板）。 */
export const HUMAN_GATES = ['G1', 'G5', 'R1', 'R2', 'R3', 'R4'] as const
export type DeliveryStage = (typeof DELIVERY_STAGES)[number]
export type DeliveryGate = (typeof DELIVERY_GATES)[number]
export type DeliveryTier = 'lite' | 'standard' | 'compliance'

/** 建交付案例房时的 power level 覆盖（spec §5：case state=50，stage/gate 普通消息=0）。 */
export const CASE_ROOM_POWER_LEVELS = {
  events_default: 0,
  state_default: 50,
  events: {
    [DELIVERY_EVENT_TYPES.case]: 50,
    [DELIVERY_EVENT_TYPES.stage]: 0,
    [DELIVERY_EVENT_TYPES.gate]: 0,
  },
} as const

export interface CaseContent {
  schemaVersion: number
  caseId: string
  title: string
  repoUrl: string
  tier: DeliveryTier
  stage: DeliveryStage
  ownerAccount: string
  /** G1 pass 后冻结的验收标准摘要（spec §6 纪律 1：改动=新案例）。 */
  frozenAcceptance?: string
  /** v2：所属项目（多项目维度，spec v1.1 §5.1）。 */
  projectId?: string
  createdAt: number
  updatedAt: number
  updatedBy: string
}

export interface IndexContent {
  schemaVersion: number
  roomIds: string[]
  updatedBy: string
  updatedAt: number
}

// ── 解析器 ──
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}
/** 读面双认并回显输入版本：v1 夹具与在途事件解析后 schemaVersion 保持原值，
 *    既有 toEqual(ok) 断言零回归；写面由发送方引用 DELIVERY_SCHEMA_VERSION 只写 2。 */
function knownSchemaVersion(raw: Record<string, unknown>): number | null {
  const sv = num(raw.schemaVersion)
  return sv !== undefined && KNOWN_SCHEMA_VERSIONS.includes(sv) ? sv : null
}
function isDeliveryStage(v: string): v is DeliveryStage {
  return (DELIVERY_STAGES as readonly string[]).includes(v)
}

const MAX_TITLE = 200
const MAX_ACCEPTANCE = 4000
const MAX_ROOMS = 50
const MAX_PROJECT_ID = 64
const MAX_PROJECTS = 50

export function parseCaseContent(raw: unknown): CaseContent | null {
  if (!isRecord(raw)) return null
  const sv = knownSchemaVersion(raw)
  if (sv === null) return null
  const caseId = str(raw.caseId)
  const title = str(raw.title)
  const repoUrl = str(raw.repoUrl)
  const ownerAccount = str(raw.ownerAccount)
  const updatedBy = str(raw.updatedBy)
  const tier = str(raw.tier)
  const stage = str(raw.stage)
  const createdAt = num(raw.createdAt)
  const updatedAt = num(raw.updatedAt)
  if (!caseId || !title || !repoUrl || !ownerAccount || !updatedBy) return null
  if (createdAt === undefined || updatedAt === undefined) return null
  if (title.length > MAX_TITLE) return null
  if (tier !== 'lite' && tier !== 'standard' && tier !== 'compliance') return null
  if (stage === undefined || !isDeliveryStage(stage)) return null
  const frozenAcceptance = str(raw.frozenAcceptance)
  if (frozenAcceptance !== undefined && frozenAcceptance.length > MAX_ACCEPTANCE) return null
  const projectId = str(raw.projectId)
  if (projectId !== undefined && projectId.length > MAX_PROJECT_ID) return null
  return {
    schemaVersion: sv, caseId, title, repoUrl,
    tier, stage, ownerAccount, frozenAcceptance, projectId, createdAt, updatedAt, updatedBy,
  }
}

export function parseIndexContent(raw: unknown): IndexContent | null {
  if (!isRecord(raw)) return null
  const sv = knownSchemaVersion(raw)
  if (sv === null) return null
  const updatedBy = str(raw.updatedBy)
  const updatedAt = num(raw.updatedAt)
  if (!updatedBy || updatedAt === undefined || !Array.isArray(raw.roomIds)) return null
  if (raw.roomIds.length > MAX_ROOMS) return null
  const roomIds: string[] = []
  for (const r of raw.roomIds) {
    if (typeof r !== 'string') return null
    roomIds.push(r)
  }
  return { schemaVersion: sv, roomIds, updatedBy, updatedAt }
}

export type StageWorker = { account: string; agentTeam?: string; profile?: string }
export type StageOutcome = 'started' | 'done' | 'failed'

export interface StageContent {
  schemaVersion: number
  caseId: string
  stage: DeliveryStage
  worker: StageWorker
  outcome: StageOutcome
  /** 制品指针 git:<ref>#<commit>:<path>，本体在中央仓，不进事件（spec §4 边界规则 2）。 */
  artifactRef?: string
  reportedBy: string
  at: number
}

export type GateVerdict = 'pass' | 'conditional' | 'reject'
export type GateEvidenceKind = 'command-exit' | 'artifact' | 'human'

/** v2：单事件单签核（wire 形态见 aggregateSignoffs 注释）。 */
export interface GateSignoff {
  decidedBy: string
  verdict: GateVerdict
  at: number
}

export interface GateContent {
  schemaVersion: number
  caseId: string
  gate: DeliveryGate
  verdict: GateVerdict
  evidence: { kind: GateEvidenceKind; summary: string }
  /** reject/conditional 必填（打回必附方向）；pass 可选。 */
  reason?: string
  /** v2：本事件代表的单人签核；缺省时签核 = 事件本身的 decidedBy/verdict/at。 */
  signoff?: GateSignoff
  decidedBy: string
  at: number
}

const MAX_REF = 512
const MAX_SUMMARY = 400
const MAX_REASON = 1000

function isDeliveryGate(v: string): v is DeliveryGate {
  return (DELIVERY_GATES as readonly string[]).includes(v)
}

function parseWorker(v: unknown): StageWorker | null {
  if (!isRecord(v)) return null
  const account = str(v.account)
  if (!account) return null
  return { account, agentTeam: str(v.agentTeam), profile: str(v.profile) }
}

export function parseStageContent(raw: unknown): StageContent | null {
  if (!isRecord(raw)) return null
  const sv = knownSchemaVersion(raw)
  if (sv === null) return null
  const caseId = str(raw.caseId)
  const stage = str(raw.stage)
  const reportedBy = str(raw.reportedBy)
  const outcome = str(raw.outcome)
  const at = num(raw.at)
  if (!caseId || !reportedBy || at === undefined) return null
  if (stage === undefined || !isDeliveryStage(stage)) return null
  if (outcome !== 'started' && outcome !== 'done' && outcome !== 'failed') return null
  const worker = parseWorker(raw.worker)
  if (!worker) return null
  const artifactRef = str(raw.artifactRef)
  if (artifactRef !== undefined && artifactRef.length > MAX_REF) return null
  return { schemaVersion: sv, caseId, stage, worker, outcome, artifactRef, reportedBy, at }
}

export function parseGateContent(raw: unknown): GateContent | null {
  if (!isRecord(raw)) return null
  const sv = knownSchemaVersion(raw)
  if (sv === null) return null
  const caseId = str(raw.caseId)
  const gate = str(raw.gate)
  const verdict = str(raw.verdict)
  const decidedBy = str(raw.decidedBy)
  const at = num(raw.at)
  if (!caseId || !decidedBy || at === undefined) return null
  if (gate === undefined || !isDeliveryGate(gate)) return null
  if (verdict !== 'pass' && verdict !== 'conditional' && verdict !== 'reject') return null
  if (!isRecord(raw.evidence)) return null
  const kind = str(raw.evidence.kind)
  const summary = str(raw.evidence.summary)
  if (kind !== 'command-exit' && kind !== 'artifact' && kind !== 'human') return null
  if (!summary || summary.length > MAX_SUMMARY) return null
  const reason = str(raw.reason)
  if (reason !== undefined && reason.length > MAX_REASON) return null
  if ((verdict === 'reject' || verdict === 'conditional') && !reason) return null
  let signoff: GateSignoff | undefined
  if (raw.signoff !== undefined) {
    if (!isRecord(raw.signoff)) return null
    const sdBy = str(raw.signoff.decidedBy)
    const sdVerdict = str(raw.signoff.verdict)
    const sdAt = num(raw.signoff.at)
    if (!sdBy || sdAt === undefined) return null
    if (sdVerdict !== 'pass' && sdVerdict !== 'conditional' && sdVerdict !== 'reject') return null
    signoff = { decidedBy: sdBy, verdict: sdVerdict, at: sdAt }
  }
  return {
    schemaVersion: sv, caseId, gate, verdict,
    evidence: { kind, summary }, reason, signoff, decidedBy, at,
  }
}

// ── v2：项目两级索引（项目 → 案例房），结构沿 delivery.index 模式 ──

export interface ProjectSummary {
  projectId: string
  title: string
  roomIds: string[]
}

export interface ProjectIndexContent {
  schemaVersion: number
  projects: ProjectSummary[]
  updatedBy: string
  updatedAt: number
}

export function parseProjectIndexContent(raw: unknown): ProjectIndexContent | null {
  if (!isRecord(raw)) return null
  const sv = knownSchemaVersion(raw)
  if (sv === null) return null
  const updatedBy = str(raw.updatedBy)
  const updatedAt = num(raw.updatedAt)
  if (!updatedBy || updatedAt === undefined || !Array.isArray(raw.projects)) return null
  if (raw.projects.length > MAX_PROJECTS) return null
  const projects: ProjectSummary[] = []
  for (const p of raw.projects) {
    if (!isRecord(p)) return null
    const projectId = str(p.projectId)
    const title = str(p.title)
    if (!projectId || projectId.length > MAX_PROJECT_ID) return null
    if (!title || title.length > MAX_TITLE) return null
    if (!Array.isArray(p.roomIds) || p.roomIds.length > MAX_ROOMS) return null
    const roomIds: string[] = []
    for (const r of p.roomIds) {
      if (typeof r !== 'string') return null
      roomIds.push(r)
    }
    projects.push({ projectId, title, roomIds })
  }
  return { schemaVersion: sv, projects, updatedBy, updatedAt }
}

// ── 发送者主体校验（应用层角色约束，spec §5；Matrix PL 只管类型不管主体归属） ──

/** @<user>-agent 为集群 bot 命名约定（ncwk-sim §2.1）；非该后缀视为人类账号。 */
export function isHumanAccount(userId: string): boolean {
  const colon = userId.indexOf(':')
  const local = userId.startsWith('@') ? userId.slice(1, colon >= 0 ? colon : undefined) : userId
  return !local.endsWith('-agent')
}

function principalKey(userId: string): string {
  const colon = userId.indexOf(':')
  const domain = colon >= 0 ? userId.slice(colon) : ''
  let local = userId.startsWith('@') ? userId.slice(1, colon >= 0 ? colon : undefined) : userId
  if (local.endsWith('-agent')) local = local.slice(0, -'-agent'.length)
  return `${local}${domain}`
}

/** 同一人类与其集群 bot 视为同主体（人类名去 -agent 后缀 + 域名一致）。 */
export function samePrincipal(a: string, b: string): boolean {
  return principalKey(a) === principalKey(b)
}

export function validateGateSender(content: GateContent, sender: string): string[] {
  const errors: string[] = []
  if ((HUMAN_GATES as readonly string[]).includes(content.gate) && !isHumanAccount(sender)) {
    errors.push(`gate ${content.gate} requires human sender`)
  }
  const effectiveDecidedBy = content.signoff?.decidedBy ?? content.decidedBy
  if (!samePrincipal(effectiveDecidedBy, sender)) {
    errors.push('decidedBy is not the sender principal')
  }
  return errors
}

export function validateStageSender(content: StageContent, sender: string): string[] {
  const ok = samePrincipal(content.worker.account, sender) && samePrincipal(content.reportedBy, sender)
  return ok ? [] : ['stage sender does not match worker/reportedBy principal']
}

// ── 幂等投影：事件按 key 归并，同 key 取 at 最新（at 相同取靠后元素，homeserver 定序兜底） ──

export function latestBy<T>(items: readonly T[], keyOf: (t: T) => string, atOf: (t: T) => number): Map<string, T> {
  const out = new Map<string, T>()
  for (const it of items) {
    const k = keyOf(it)
    const prev = out.get(k)
    if (prev === undefined || atOf(it) >= atOf(prev)) out.set(k, it)
  }
  return out
}

export function latestGateVerdicts(gates: readonly GateContent[]): Map<string, GateContent> {
  return latestBy(gates, g => `${g.caseId}:${g.gate}`, g => g.at)
}

export function latestStageOutcomes(stages: readonly StageContent[]): Map<string, StageContent> {
  return latestBy(stages, s => `${s.caseId}:${s.stage}`, s => s.at)
}

// ── v2：会签投影。wire 形态=每 gate 事件带本人一条 signoff（或缺省即事件本身），
//    同 (caseId,gate) 内每个 decidedBy 取最新签核后聚合：全员 pass 才 pass，任一 reject 即 reject，否则 conditional。 ──

export interface GateAggregate {
  caseId: string
  gate: DeliveryGate
  verdict: GateVerdict
  signoffs: GateSignoff[]
}

export function aggregateSignoffs(gates: readonly GateContent[]): Map<string, GateAggregate> {
  const perKey = new Map<string, Map<string, GateSignoff>>()
  const meta = new Map<string, { caseId: string; gate: DeliveryGate }>()
  for (const g of gates) {
    const key = `${g.caseId}:${g.gate}`
    const entry: GateSignoff = g.signoff ?? { decidedBy: g.decidedBy, verdict: g.verdict, at: g.at }
    let m = perKey.get(key)
    if (!m) {
      m = new Map()
      perKey.set(key, m)
      meta.set(key, { caseId: g.caseId, gate: g.gate })
    }
    const prev = m.get(entry.decidedBy)
    if (prev === undefined || entry.at >= prev.at) m.set(entry.decidedBy, entry)
  }
  const out = new Map<string, GateAggregate>()
  for (const [key, m] of perKey) {
    const info = meta.get(key)
    if (info === undefined) continue
    const signoffs = [...m.values()]
    const verdict: GateVerdict = signoffs.some(s => s.verdict === 'reject')
      ? 'reject'
      : signoffs.every(s => s.verdict === 'pass') ? 'pass' : 'conditional'
    out.set(key, { caseId: info.caseId, gate: info.gate, verdict, signoffs })
  }
  return out
}
