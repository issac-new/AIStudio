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
import { homedir } from 'os'
import { join } from 'path'

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
  grantedAt: number
  grantedBy: string
  expiresAt?: number
  revokedAt?: number
  revokedBy?: string
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
  return join(homedir(), '.hermes-web-ui', 'agent-identity')
}

function storePath(): string {
  return join(storeDir(), 'identities.json')
}

function eventLogPath(): string {
  return join(storeDir(), 'events.jsonl')
}

interface StoreShape { identities: AgentIdentity[]; nextSeq: number; nextDelegationSeq: number }

function readStore(): StoreShape {
  try {
    const raw = JSON.parse(readFileSync(storePath(), 'utf8')) as Partial<StoreShape>
    return {
      identities: Array.isArray(raw.identities) ? raw.identities : [],
      nextSeq: typeof raw.nextSeq === 'number' ? raw.nextSeq : 1,
      nextDelegationSeq: typeof raw.nextDelegationSeq === 'number' ? raw.nextDelegationSeq : 1,
    }
  } catch {
    return { identities: [], nextSeq: 1, nextDelegationSeq: 1 }
  }
}

function writeStore(store: StoreShape): void {
  mkdirSync(storeDir(), { recursive: true })
  const file = storePath()
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
  renameSync(tmp, file)
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

export function registerIdentity(
  input: { name: string; kind: IdentityKind; owner: string; toolAllowlist?: string[] },
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
    credentials: [],
    delegations: [],
    createdAt: now,
    updatedAt: now,
  }
  store.nextSeq += 1
  store.identities.push(identity)
  writeStore(store)
  appendEvent({ actor, action: 'register', targetId: identity.id, detail: `${identity.name}（${identity.kind}，owner=${identity.owner}）` })
  return { ok: true, identity }
}

export function updateIdentity(
  id: string,
  patch: { owner?: string; toolAllowlist?: string[]; kind?: IdentityKind },
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
  input: { to: string; scope: string; expiresAt?: number },
  actor: string,
): { ok: true; delegation: DelegationRecord } | { ok: false; problems: string[] } {
  const store = readStore()
  const identity = store.identities.find((i) => i.id === id)
  if (!identity) return { ok: false, problems: [`委托来源身份不存在：${id}`] }
  if (!input.to?.trim() || !input.scope?.trim()) return { ok: false, problems: ['to 与 scope 必填'] }
  if (!store.identities.some((i) => i.id === input.to || i.name === input.to)) {
    return { ok: false, problems: [`委托目标身份不存在：${input.to}（先登记再委托）`] }
  }
  const delegation: DelegationRecord = {
    id: `did-${String(store.nextDelegationSeq).padStart(3, '0')}`,
    from: identity.id,
    to: input.to.trim(),
    scope: input.scope.trim(),
    grantedAt: Date.now(),
    grantedBy: actor,
    expiresAt: input.expiresAt,
  }
  store.nextDelegationSeq += 1
  identity.delegations.push(delegation)
  identity.updatedAt = Date.now()
  writeStore(store)
  appendEvent({ actor, action: 'delegate', targetId: id, detail: `${identity.id}→${input.to}：${input.scope}` })
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

/** 委托链查询：身份 X 当前有效（未撤销未过期）的委托出边 + 可达路径（环检测）。 */
export function activeDelegationChain(id: string): { from: AgentIdentity; edges: DelegationRecord[]; paths: string[][] } {
  const store = readStore()
  const byId = new Map(store.identities.map((i) => [i.id, i]))
  const from = byId.get(id) ?? null
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
    const node = byId.get(current)
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
