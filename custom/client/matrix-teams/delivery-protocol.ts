// overlay/custom/client/matrix-teams/delivery-protocol.ts
// 交付案例房事件协议（分布式交付网络 spec §5 单一事实源）。
// 事件类型字符串只准在本文件出现（守门测试强制，模式同 protocol.ts）。
// 容错纪律同 protocol.ts：非法输入一律返回 null，不抛。
// schemaVersion 只认当前版本：未知版本解析为 null，事件被投影忽略（spec §11 降级只读）。
export const DELIVERY_SCHEMA_VERSION = 1

export const DELIVERY_EVENT_TYPES = {
  case: 'com.swarmstudio.delivery.case',
  stage: 'com.swarmstudio.delivery.stage',
  gate: 'com.swarmstudio.delivery.gate',
} as const

export const DELIVERY_INDEX_ACCOUNT_DATA_TYPE = 'com.swarmstudio.delivery.index'

const DELIVERY_EVENT_PREFIX = 'com.swarmstudio.delivery.'

export function isDeliveryEventType(type: string): boolean {
  return type.startsWith(DELIVERY_EVENT_PREFIX)
}

export const DELIVERY_STAGES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const
export const DELIVERY_GATES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const
/** G1 需求冻结 / G5 发布准入：verdict 的 sender 必须是人类账号（spec §6）。 */
export const HUMAN_GATES = ['G1', 'G5'] as const
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
function knownVersion(raw: Record<string, unknown>): boolean {
  return raw.schemaVersion === DELIVERY_SCHEMA_VERSION
}
function isDeliveryStage(v: string): v is DeliveryStage {
  return (DELIVERY_STAGES as readonly string[]).includes(v)
}

const MAX_TITLE = 200
const MAX_ACCEPTANCE = 4000
const MAX_ROOMS = 50

export function parseCaseContent(raw: unknown): CaseContent | null {
  if (!isRecord(raw) || !knownVersion(raw)) return null
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
  return {
    schemaVersion: DELIVERY_SCHEMA_VERSION, caseId, title, repoUrl,
    tier, stage, ownerAccount, frozenAcceptance, createdAt, updatedAt, updatedBy,
  }
}

export function parseIndexContent(raw: unknown): IndexContent | null {
  if (!isRecord(raw) || !knownVersion(raw)) return null
  const updatedBy = str(raw.updatedBy)
  const updatedAt = num(raw.updatedAt)
  if (!updatedBy || updatedAt === undefined || !Array.isArray(raw.roomIds)) return null
  if (raw.roomIds.length > MAX_ROOMS) return null
  const roomIds: string[] = []
  for (const r of raw.roomIds) {
    if (typeof r !== 'string') return null
    roomIds.push(r)
  }
  return { schemaVersion: DELIVERY_SCHEMA_VERSION, roomIds, updatedBy, updatedAt }
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

export interface GateContent {
  schemaVersion: number
  caseId: string
  gate: DeliveryGate
  verdict: GateVerdict
  evidence: { kind: GateEvidenceKind; summary: string }
  /** reject/conditional 必填（打回必附方向）；pass 可选。 */
  reason?: string
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
  if (!isRecord(raw) || !knownVersion(raw)) return null
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
  return { schemaVersion: DELIVERY_SCHEMA_VERSION, caseId, stage, worker, outcome, artifactRef, reportedBy, at }
}

export function parseGateContent(raw: unknown): GateContent | null {
  if (!isRecord(raw) || !knownVersion(raw)) return null
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
  return {
    schemaVersion: DELIVERY_SCHEMA_VERSION, caseId, gate, verdict,
    evidence: { kind, summary }, reason, decidedBy, at,
  }
}
