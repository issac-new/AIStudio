// overlay/custom/server/agentidentity/agent-identity.ts
// agent 身份与委托链台账（P10，2026-10-04 九源轮）。
//
// 出处：EqualAI 治理报告解读文的作者补强——"智能体治理的核心是身份、权限、
// 工具、记忆、审计"；每个智能体应有唯一身份/最小权限/委托链/可撤销凭证/
// 全链路审计。本仓现状：审批有 owner 归属、矩阵有 roster，但没有
// "这个 agent 是谁、替谁行动、凭证可不可撤"的单一台账。
//
// 定位（诚实边界）：这是**台账层**——登记/委托/撤销/审计四动作落 JSON
// 存储并进 approval-log 同款 append-only 事件流；**不接线鉴权**（现有
// 网关/JWT 鉴权面不动），凭证状态只是记录不是 enforcement。接线属后续轮。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join } from 'path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'
import { listPeople } from './people'
import { cardGaps, validateCard, type ResponsibilityCard } from './responsibility'
import { canTransition, normalizeLifecycle, stageOf, type Lifecycle, type TransitionInput } from './lifecycle'

export type IdentityKind = 'human' | 'agent' | 'bot' | 'service'
export type CredentialStatus = 'active' | 'revoked'
export type CredentialKind = 'api-key' | 'jwt' | 'matrix-account' | 'token' | 'none'

export interface CredentialRecord {
  kind: CredentialKind
  label: string
  status: CredentialStatus
  /** 撤销时间（active 时缺省） */
  revokedAt?: number
  revokedBy?: string
  note?: string
}

export interface DelegationRecord {
  /** 委托 id（did-序号） */
  id: string
  from: string
  to: string
  /** 委托范围（自然语言，如"代表我在 #dev 房间执行构建命令"） */
  scope: string
  /** 结构化工具白名单（2026-10-18：唯一可执行的委托范围；空=只写了自然语言 scope）。 */
  toolAllowlist?: string[]
  grantedAt: number
  grantedBy: string
  expiresAt?: number
  revokedAt?: number
  revokedBy?: string
}

/** 能力边界（设计意图）：被造来做什么、明确不做什么。与 toolAllowlist 的「许可」正交——
 *  能力边界写宽不等于权限放宽，两者分别维护（2026-11-05 组织治理能力批，户口五要素补齐）。 */
export interface CapabilityBoundary {
  can: string[]
  cannot: string[]
}

/** 审计要求：抽样比例与留存期。凭证可撤销 ≠ 有审计要求，两件事分别登记。 */
export interface AuditRequirement {
  /** 抽样审计比例 0..1 */
  sampling: number
  /** 留存天数 */
  retentionDays: number
  note?: string
}

export interface AgentIdentity {
  /** 身份 id（aid-序号；稳定主键） */
  id: string
  name: string
  kind: IdentityKind
  /** 责任人（谁为这个身份的行为负责） */
  owner: string
  /** 工具白名单（空=未声明，不等于无限制） */
  toolAllowlist: string[]
  /** 能力边界（2026-11-05 起；存量身份可缺，缺口由 rosterGaps 报出） */
  capabilityBoundary?: CapabilityBoundary
  /** 审计要求（2026-11-05 起；存量身份可缺） */
  auditRequirement?: AuditRequirement
  /** 责任卡（2026-11-06 起）：任务边界之外的追责要素；存量身份可缺，缺口由 cardGaps 报出 */
  responsibilityCard?: ResponsibilityCard
  /** 五阶段生命周期（2026-11-06 起）：缺省按 registered 展示，不批量回填 */
  lifecycle?: Lifecycle
  credentials: CredentialRecord[]
  delegations: DelegationRecord[]
  createdAt: number
  updatedAt: number
}

export interface IdentityEvent {
  ts: number
  actor: string
  action: 'register' | 'update' | 'delegate' | 'revoke-delegation' | 'revoke-credential' | 'add-credential'
  targetId: string
  detail: string
}

// ── 存储（approval-store 同款约定：env 显式 > ~/.hermes-web-ui/）──

function storeDir(): string {
  const env = process.env.AGENT_IDENTITY_STORE?.trim()
  if (env) return env
  return underWebUi('agent-identity')
}

function storePath(): string {
  return join(storeDir(), 'identities.json')
}

function eventLogPath(): string {
  return join(storeDir(), 'events.jsonl')
}

interface StoreShape { identities: AgentIdentity[]; nextSeq: number; nextDelegationSeq: number }

function readStore(): StoreShape {
  let raw: Partial<StoreShape>
  try {
    raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<StoreShape>
  } catch (e) {
    // 仅"首装无文件"按空账处理；损坏/占用/权限错误如实上抛（500）——静默当空账
    // 会让下一次写的全量 writeStore 把既有台账整体覆写清零（24h 审查补）
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      return { identities: [], nextSeq: 1, nextDelegationSeq: 1 }
    }
    throw e
  }
  return {
    identities: Array.isArray(raw.identities) ? raw.identities : [],
    nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
    nextDelegationSeq: typeof raw.nextDelegationSeq === 'number' ? raw.nextDelegationSeq : 1,
  }
}

function writeStore(store: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  const file = storePath()
  atomicWriteJson(file, store)
}

function appendEvent(event: Omit<IdentityEvent, 'ts'> & { ts?: number }): void {
  try {
    mkdirSync(storeDir(), { recursive: true })
    const entry = { ts: event.ts ?? Date.now(), ...event }
    // 环境变量可关闭事件流（测试隔离）；身份台账本体仍写
    if (process.env.AGENT_IDENTITY_NO_EVENTS === '1') return
    writeFileSync(eventLogPath(), JSON.stringify(entry) + '\n', { flag: 'a' })
  } catch { /* 事件流失败不阻断主链路（fail-soft） */ }
}

// ── 校验纯函数 ──

export function validateIdentityInput(input: Partial<AgentIdentity> & { name?: unknown; owner?: unknown; kind?: unknown }): string[] {
  const problems: string[] = []
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 64) {
    problems.push('name 必填（≤64 字符）')
  }
  if (typeof input.owner !== 'string' || !input.owner.trim()) problems.push('owner 必填（责任人）')
  if (input.kind !== undefined && !['human', 'agent', 'bot', 'service'].includes(String(input.kind))) {
    problems.push('kind 须为 human|agent|bot|service')
  }
  if (input.toolAllowlist !== undefined && !Array.isArray(input.toolAllowlist)) problems.push('toolAllowlist 须为字符串数组')
  return problems
}

// ── 域操作（读=快照；写=校验+落盘+事件）──

export function listIdentities(): AgentIdentity[] {
  return readStore().identities.map((i) => ({ ...i }))
}

export function getIdentity(id: string): AgentIdentity | null {
  return readStore().identities.find((i) => i.id === id) ?? null
}

// ── 户口五要素（2026-11-05 组织治理能力批）──
//
// 来源：《定义权之争》下篇动作 3「给 Agent 发户口」——名字、能力边界、权限范围、
// 审计要求、负责人。仓内原有前三项中的名字/负责人/权限范围，能力边界与审计要求缺失。
//
// 纪律：缺口**不 fail-closed 拒绝注册**。存量 30 个 profile 身份全部缺这两项，
// 一次性拒绝会让既有部署立即不可用。改为「注册放行 + 缺口可见 + 门禁拦新增」。

export type RosterField = 'name' | 'capability-boundary-can' | 'capability-boundary-cannot'
  | 'permission-scope' | 'audit-requirement' | 'owner'

export interface RosterGap {
  field: RosterField
  /** 人读说明：缺什么、为什么这条要单独判 */
  detail: string
}

/** 单身份的户口缺项（空数组=五要素齐备）。纯函数，不读盘。 */
export function rosterGaps(identity: Pick<AgentIdentity,
  'name' | 'owner' | 'toolAllowlist' | 'capabilityBoundary' | 'auditRequirement'>): RosterGap[] {
  const gaps: RosterGap[] = []
  if (typeof identity.name !== 'string' || !identity.name.trim()) {
    gaps.push({ field: 'name', detail: '缺身份名——无名身份无法被派单与追溯' })
  }
  const can = Array.isArray(identity.capabilityBoundary?.can) ? identity.capabilityBoundary!.can.filter((c) => c && String(c).trim()) : []
  const cannot = Array.isArray(identity.capabilityBoundary?.cannot) ? identity.capabilityBoundary!.cannot.filter((c) => c && String(c).trim()) : []
  if (can.length === 0) {
    gaps.push({ field: 'capability-boundary-can', detail: '缺能力边界（能做什么）——只写许可不写设计意图，能力与权限会被混同' })
  }
  if (cannot.length === 0) {
    gaps.push({ field: 'capability-boundary-cannot', detail: '缺能力边界（不做什么）——不声明禁区等于默许扩权' })
  }
  if (!Array.isArray(identity.toolAllowlist) || identity.toolAllowlist.length === 0) {
    gaps.push({ field: 'permission-scope', detail: '缺权限范围——空白名单是「未声明」，不等于无限制' })
  }
  const sampling = identity.auditRequirement?.sampling
  if (!identity.auditRequirement || typeof sampling !== 'number' || !Number.isFinite(sampling) || sampling <= 0) {
    gaps.push({ field: 'audit-requirement', detail: '缺审计要求（抽样比例）——凭证可撤销不等于有审计' })
  }
  if (typeof identity.owner !== 'string' || !identity.owner.trim()) {
    gaps.push({ field: 'owner', detail: '缺负责人——没有人愿意为之负责的结果在组织里等于不存在' })
  }
  return gaps
}

export function rosterStatus(identity: Parameters<typeof rosterGaps>[0]): 'complete' | 'blocked' {
  return rosterGaps(identity).length === 0 ? 'complete' : 'blocked'
}

export interface RosterGapRow {
  id: string
  name: string
  kind: IdentityKind
  status: 'complete' | 'blocked'
  gaps: RosterGap[]
}

/** 全量户口体检（读侧）。只读，不改身份。 */
export function listRosterGaps(): { total: number; blocked: number; rows: RosterGapRow[] } {
  const identities = readStore().identities
  const rows: RosterGapRow[] = identities.map((i) => {
    const gaps = rosterGaps(i)
    return { id: i.id, name: i.name, kind: i.kind, status: gaps.length === 0 ? 'complete' : 'blocked', gaps }
  })
  return {
    total: rows.length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
    rows,
  }
}

export function registerIdentity(
  input: {
    name: string
    kind: IdentityKind
    owner: string
    toolAllowlist?: string[]
    capabilityBoundary?: CapabilityBoundary
    auditRequirement?: AuditRequirement
  },
  actor: string,
): { ok: true; identity: AgentIdentity } | { ok: false; problems: string[] } {
  const problems = validateIdentityInput(input)
  if (problems.length) return { ok: false, problems }
  const store = readStore()
  if (store.identities.some((i) => i.name === input.name.trim())) {
    return { ok: false, problems: [`同名身份已存在：${input.name.trim()}（身份名唯一，复用请走 update）`] }
  }
  const now = Date.now()
  const identity: AgentIdentity = {
    id: `aid-${String(store.nextSeq).padStart(3, '0')}`,
    name: input.name.trim(),
    kind: input.kind,
    owner: input.owner.trim(),
    toolAllowlist: input.toolAllowlist ?? [],
    ...(input.capabilityBoundary ? { capabilityBoundary: normalizeBoundary(input.capabilityBoundary) } : {}),
    ...(input.auditRequirement ? { auditRequirement: normalizeAudit(input.auditRequirement) } : {}),
    credentials: [],
    delegations: [],
    createdAt: now,
    updatedAt: now,
  }
  store.nextSeq += 1
  store.identities.push(identity)
  writeStore(store)
  const gaps = rosterGaps(identity)
  appendEvent({
    actor,
    action: 'register',
    targetId: identity.id,
    detail: `${identity.name}（${identity.kind}，owner=${identity.owner}）`
      + (gaps.length ? `｜户口不齐：${gaps.map((g) => g.field).join(',')}` : ''),
  })
  return { ok: true, identity }
}

/** 能力边界/审计要求的字段规范化（空白项剔除、比例夹取到 0..1）。 */
function normalizeBoundary(b: CapabilityBoundary): CapabilityBoundary {
  const clean = (xs: unknown): string[] => (Array.isArray(xs) ? xs.map(String).map((s) => s.trim()).filter(Boolean) : [])
  return { can: clean(b.can), cannot: clean(b.cannot) }
}

function normalizeAudit(a: AuditRequirement): AuditRequirement {
  const sampling = Number.isFinite(a.sampling) ? Math.min(1, Math.max(0, a.sampling)) : 0
  const retentionDays = Number.isFinite(a.retentionDays) && a.retentionDays > 0 ? Math.floor(a.retentionDays) : 0
  return { sampling, retentionDays, ...(a.note ? { note: a.note } : {}) }
}

export function updateIdentity(
  id: string,
  patch: {
    owner?: string
    toolAllowlist?: string[]
    kind?: IdentityKind
    capabilityBoundary?: CapabilityBoundary
    auditRequirement?: AuditRequirement
  },
  actor: string,
): { ok: true; identity: AgentIdentity } | { ok: false; problems: string[] } {
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: false, problems: [`身份不存在：${id}`] }
  if (patch.owner !== undefined) {
    if (typeof patch.owner !== 'string' || !patch.owner.trim()) return { ok: false, problems: ['owner 必填'] }
    identity.owner = patch.owner.trim()
  }
  if (patch.toolAllowlist !== undefined) {
    if (!Array.isArray(patch.toolAllowlist)) return { ok: false, problems: ['toolAllowlist 须为字符串数组'] }
    identity.toolAllowlist = patch.toolAllowlist.map(String)
  }
  if (patch.kind !== undefined) {
    if (!['human', 'agent', 'bot', 'service'].includes(patch.kind)) return { ok: false, problems: ['kind 非法'] }
    identity.kind = patch.kind
  }
  if (patch.capabilityBoundary !== undefined) {
    identity.capabilityBoundary = normalizeBoundary(patch.capabilityBoundary)
  }
  if (patch.auditRequirement !== undefined) {
    identity.auditRequirement = normalizeAudit(patch.auditRequirement)
  }
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'update', targetId: id, detail: JSON.stringify(patch) })
  return { ok: true, identity: { ...identity } }
}

export function addCredential(
  id: string,
  cred: { kind: CredentialKind; label: string; note?: string },
  actor: string,
): { ok: true; identity: AgentIdentity } | { ok: false; problems: string[] } {
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: false, problems: [`身份不存在：${id}`] }
  if (!cred.kind || !cred.label?.trim()) return { ok: false, problems: ['credential 须含 kind 与 label'] }
  if (identity.credentials.some((c) => c.label === cred.label.trim() && c.status === 'active')) {
    return { ok: false, problems: [`同名 active 凭证已存在：${cred.label.trim()}`] }
  }
  identity.credentials.push({ kind: cred.kind, label: cred.label.trim(), status: 'active', note: cred.note })
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'add-credential', targetId: id, detail: `${cred.kind}:${cred.label}` })
  return { ok: true, identity: { ...identity } }
}

export function revokeCredential(id: string, label: string, actor: string): { ok: true; identity: AgentIdentity } | { ok: false; problems: string[] } {
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: false, problems: [`身份不存在：${id}`] }
  const cred = identity.credentials.find((c) => c.label === label && c.status === 'active')
  if (!cred) return { ok: false, problems: [`active 凭证不存在：${label}`] }
  cred.status = 'revoked'
  cred.revokedAt = Date.now()
  cred.revokedBy = actor
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'revoke-credential', targetId: id, detail: label })
  return { ok: true, identity: { ...identity } }
}

export function delegate(
  id: string,
  input: { to: string; scope: string; expiresAt?: number; toolAllowlist?: string[] },
  actor: string,
): { ok: true; delegation: DelegationRecord } | { ok: false; problems: string[] } {
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: false, problems: [`委托来源身份不存在：${id}`] }
  if (!input.to?.trim() || !input.scope?.trim()) return { ok: false, problems: ['to 与 scope 必填'] }
  // 委托目标归一为稳定主键 id（UI 接受"身份名或 id"输入；链查询按 id 解析——
  // 存名字会让 byId 解析断链，委托"存在"却从不延伸路径，审计面静默缺数）
  const target = store.identities.find((i) => i.id === input.to || i.name === input.to)
  if (!target) {
    return { ok: false, problems: [`委托目标身份不存在：${input.to}（先登记再委托）`] }
  }
  if (input.toolAllowlist !== undefined && (!Array.isArray(input.toolAllowlist) || input.toolAllowlist.some((t) => typeof t !== 'string' || !t.trim()))) {
    return { ok: false, problems: ['toolAllowlist 须为非空字符串数组'] }
  }
  const delegation: DelegationRecord = {
    id: `did-${String(store.nextDelegationSeq).padStart(3, '0')}`,
    from: identity.id,
    to: target.id,
    scope: input.scope.trim(),
    ...(input.toolAllowlist?.length ? { toolAllowlist: input.toolAllowlist.map((t) => t.trim()) } : {}),
    grantedAt: Date.now(),
    grantedBy: actor,
    expiresAt: input.expiresAt,
  }
  store.nextDelegationSeq += 1
  identity.delegations.push(delegation)
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'delegate', targetId: id, detail: `${identity.id}→${target.id}（${target.name}）：${input.scope}` })
  return { ok: true, delegation }
}

export function revokeDelegation(id: string, delegationId: string, actor: string): { ok: true } | { ok: false; problems: string[] } {
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: false, problems: [`身份不存在：${id}`] }
  const d = identity.delegations.find((x) => x.id === delegationId && !x.revokedAt)
  if (!d) return { ok: false, problems: [`未撤销的委托不存在：${delegationId}`] }
  d.revokedAt = Date.now()
  d.revokedBy = actor
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'revoke-delegation', targetId: id, detail: delegationId })
  return { ok: true }
}

/**
 * 活跃委托的结构化工具白名单并集（2026-10-18）。执法时必须与身份自身
 * allowlist **同时**满足（交集语义）——委托只能收窄，不能扩大身份权限；
 * 身份自身 allowlist 为空时（未声明）只按委托范围校验。
 * 自然语言 scope 不参与机读裁决（无法可靠解析）。
 */
export function activeDelegationToolAllowlist(identity: AgentIdentity, now = Date.now()): string[] {
  const active = identity.delegations.filter(
    (d) => !d.revokedAt && (!d.expiresAt || d.expiresAt > now) && Array.isArray(d.toolAllowlist) && d.toolAllowlist.length > 0,
  )
  const set = new Set<string>()
  for (const d of active) for (const t of d.toolAllowlist ?? []) set.add(t)
  return [...set]
}

/** 委托链查询：身份 X 当前有效（未撤销未过期）的委托出边 + 可达路径（环检测）。 */
export function activeDelegationChain(id: string): { from: AgentIdentity; edges: DelegationRecord[]; paths: string[][] } {
  const store = readStore()
  const byId = new Map(store.identities.map((i) => [i.id, i]))
  // 兼容历史行：目标存了名字的委托也按名解析（新委托已在 delegate() 归一为 id）
  const byName = new Map(store.identities.map((i) => [i.name, i]))
  const resolve = (key: string): AgentIdentity | undefined => byId.get(key) ?? byName.get(key)
  const from = resolve(id) ?? null
  const now = Date.now()
  const edges: DelegationRecord[] = []
  if (from) {
    for (const d of from.delegations) {
      if (d.revokedAt) continue
      if (d.expiresAt && d.expiresAt < now) continue
      edges.push(d)
    }
  }
  // 全图 BFS 找从 id 出发的所有有效路径（防环：路径内不重复访问）
  const paths: string[][] = []
  const walk = (current: string, path: string[]): void => {
    const node = resolve(current)
    if (!node) return
    for (const d of node.delegations) {
      if (d.revokedAt || (d.expiresAt && d.expiresAt < now)) continue
      if (path.includes(d.to)) continue // 环截断
      const nextPath = [...path, d.to]
      paths.push(nextPath)
      walk(d.to, nextPath)
    }
  }
  walk(id, [id])
  return { from: from ? { ...from } : ({} as AgentIdentity), edges, paths }
}

export function listEvents(limit = 100): IdentityEvent[] {
  try {
    const lines = readFileSync(eventLogPath(), 'utf8').split('\n').filter(Boolean)
    return lines.slice(-limit).map((l) => JSON.parse(l) as IdentityEvent)
  } catch {
    return []
  }
}

/** 测试隔离：指向临时目录（每用例独立 cwd 语义）。 */
export function _useStoreDirForTests(dir: string): void {
  process.env.AGENT_IDENTITY_STORE = dir
  process.env.AGENT_IDENTITY_NO_EVENTS = '0'
}

// ── 责任卡与五阶段生命周期（2026-11-06 第一增量）──
// 写入路径只有两条：保存责任卡、迁移生命周期。两者都校验在岗自然人与阶段守卫；
// 存量身份不批量回填，缺口由 getCardView 报出。

export function updateResponsibilityCard(
  id: string,
  card: ResponsibilityCard,
  actor: string,
): { ok: boolean; problems: string[]; identity?: AgentIdentity } {
  const people = listPeople()
  const problems = validateCard(card, people)
  if (problems.length) return { ok: problems.length === 0, problems }
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: identity !== undefined, problems: [`身份不存在：${id}`] }
  const prevOwner = identity.responsibilityCard?.primaryOwner
  identity.responsibilityCard = card
  const lc = normalizeLifecycle(identity.lifecycle)
  // 主责任人变更不是静默改名：已准入/运行中的单元强制转入变更态，重启须两条证据
  if (prevOwner && prevOwner !== card.primaryOwner && lc.stage !== 'registered') {
    lc.history.push({
      from: lc.stage, to: 'changing', at: Date.now(), by: card.primaryOwner,
      reason: 'owner-change', evidenceRefs: [],
    })
    lc.stage = 'changing'
  }
  identity.lifecycle = lc
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'update', targetId: id, detail: 'responsibility-card' })
  return { ok: true, problems: [], identity: { ...identity } }
}

export function transitionIdentity(
  id: string,
  input: TransitionInput,
  actor: string,
): { ok: boolean; problems: string[]; identity?: AgentIdentity } {
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: identity !== undefined, problems: [`身份不存在：${id}`] }
  const verdict = canTransition(identity, input, listPeople())
  if (verdict.problems.length > 0) return { ok: verdict.problems.length === 0, problems: verdict.problems }
  const lc = normalizeLifecycle(identity.lifecycle)
  const from = lc.stage
  lc.history.push({
    from, to: input.to, at: Date.now(), by: input.by,
    reason: input.reason.trim(), evidenceRefs: input.evidenceRefs ?? [],
  })
  lc.stage = input.to
  if (input.to === 'retired') lc.exit = { ...input.exit!, confirmedAt: Date.now() }
  identity.lifecycle = lc
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'update', targetId: id, detail: `lifecycle:${from}->${input.to}` })
  return { ok: true, problems: [], identity: { ...identity } }
}

export function getCardView(id: string): {
  card: ResponsibilityCard | null
  lifecycle: Lifecycle
  stage: string
  gaps: ReturnType<typeof cardGaps>
} | null {
  const identity = getIdentity(id)
  if (!identity) return null
  const lc = normalizeLifecycle(identity.lifecycle)
  return {
    card: identity.responsibilityCard ?? null,
    lifecycle: lc,
    stage: stageOf(identity),
    gaps: cardGaps(identity.responsibilityCard, listPeople(), { forAdmission: lc.stage === 'registered' }),
  }
}
