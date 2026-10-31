// custom/server/orchestrator/store.ts
// 编排域 SQLite 存储（2026-10-31 A+B 批 spec §4.1）。
// 单写者约束（spec D3）：本进程是唯一写者；Python 运行时与其它进程通过 REST 读写。
// 库文件与 HumanGate 同根（$HERMES_HOME/orchestrator/orchestrator.sqlite），便于备份与迁移。
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { hermesHome } from '../lib/paths'
import type {
  Assignment, AssignmentStage, Decision, Mandate, Subscription, Thread, Trigger, TriggerStatus,
} from './types'

type SqliteDb = {
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: unknown[]): unknown
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
  close(): void
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trigger (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  actor TEXT,
  addressed INTEGER NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(source_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_trigger_thread ON trigger(thread_key, received_at);
CREATE INDEX IF NOT EXISTS idx_trigger_status ON trigger(status, received_at);

CREATE TABLE IF NOT EXISTS thread (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  UNIQUE(source_id, thread_key)
);

CREATE TABLE IF NOT EXISTS subscription (
  thread_id TEXT NOT NULL,
  subscriber TEXT NOT NULL,
  mode TEXT NOT NULL,
  cursor TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, subscriber)
);

CREATE TABLE IF NOT EXISTS decision (
  id TEXT PRIMARY KEY,
  trigger_id TEXT NOT NULL,
  thread_id TEXT,
  verdict TEXT NOT NULL,
  strength TEXT NOT NULL,
  rule_ids TEXT,
  policy_version INTEGER NOT NULL,
  decided_by TEXT NOT NULL,
  decided_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_decision_trigger ON decision(trigger_id);

CREATE TABLE IF NOT EXISTS mandate (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  strength TEXT NOT NULL,
  rule_ids TEXT,
  policy_version INTEGER NOT NULL,
  issuer TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_mandate_ticket ON mandate(ticket_id, issued_at);

CREATE TABLE IF NOT EXISTS assignment (
  ticket_id TEXT NOT NULL,
  executor TEXT NOT NULL,
  session_id TEXT,
  pid INTEGER,
  stage TEXT NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  PRIMARY KEY (ticket_id, executor, started_at)
);
CREATE INDEX IF NOT EXISTS idx_assignment_stage ON assignment(stage);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`

let db: SqliteDb | null = null
let dbFile: string | null = null

export function orchestratorDbFile(): string {
  const override = process.env.ORCHESTRATOR_DB?.trim()
  if (override) return resolve(override)
  return resolve(hermesHome(), 'orchestrator', 'orchestrator.sqlite')
}

/** 进程内单例连接；测试通过 ORCHESTRATOR_DB 指向 tmpdir 并调用 resetOrchestratorForTests。 */
export function orchestratorDb(): SqliteDb {
  const file = orchestratorDbFile()
  if (db && dbFile === file) return db
  if (db) { try { db.close() } catch { /* 旧连接关闭失败不掩盖新连接 */ } }
  mkdirSync(dirname(file), { recursive: true })
  // 动态 import：node:sqlite 在 Node 22+ 可用；延迟到首次使用，避免纯函数测试拉起原生模块。
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string) => SqliteDb }
  const created = new DatabaseSync(file)
  created.exec('PRAGMA journal_mode = WAL')
  created.exec('PRAGMA busy_timeout = 5000')
  created.exec(SCHEMA)
  db = created
  dbFile = file
  return db
}

/** 仅测试：关闭连接并清空缓存（下一个调用按 env 重开）。 */
export function resetOrchestratorForTests(): void {
  if (db) { try { db.close() } catch { /* 已关闭 */ } }
  db = null
  dbFile = null
}

function newId(prefix: string): string {
  // 不引第三方 ulid：时间前缀 + 随机后缀，同毫秒内碰撞概率可忽略。
  const t = Date.now().toString(36).padStart(9, '0')
  const r = Math.random().toString(36).slice(2, 10).padStart(8, '0')
  return `${prefix}_${t}${r}`
}

function toTrigger(row: Record<string, unknown>): Trigger {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    sourceKind: String(row.source_kind) as Trigger['sourceKind'],
    externalId: String(row.external_id),
    threadKey: String(row.thread_key),
    actor: row.actor === null || row.actor === undefined ? null : String(row.actor),
    addressed: Number(row.addressed) === 1,
    payload: JSON.parse(String(row.payload)),
    status: String(row.status) as TriggerStatus,
    receivedAt: Number(row.received_at),
  }
}

/** 幂等写入：同 (source_id, external_id) 返回既有行，duplicated=true。 */
export function insertTrigger(
  input: Omit<Trigger, 'id' | 'status'> & { status?: TriggerStatus },
): { trigger: Trigger; duplicated: boolean } {
  const d = orchestratorDb()
  const existing = d.prepare(
    'SELECT * FROM trigger WHERE source_id = ? AND external_id = ?',
  ).get(input.sourceId, input.externalId) as Record<string, unknown> | undefined
  if (existing) return { trigger: toTrigger(existing), duplicated: true }
  const id = newId('trg')
  d.prepare(
    `INSERT INTO trigger (id, source_id, source_kind, external_id, thread_key, actor, addressed, payload, status, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, input.sourceId, input.sourceKind, input.externalId, input.threadKey,
    input.actor ?? null, input.addressed ? 1 : 0, JSON.stringify(input.payload),
    input.status ?? 'pending', input.receivedAt ?? Date.now(),
  )
  const row = d.prepare('SELECT * FROM trigger WHERE id = ?').get(id) as Record<string, unknown>
  return { trigger: toTrigger(row), duplicated: false }
}

export function setTriggerStatus(id: string, status: TriggerStatus): void {
  orchestratorDb().prepare('UPDATE trigger SET status = ? WHERE id = ?').run(status, id)
}

export function getTrigger(id: string): Trigger | null {
  const row = orchestratorDb().prepare('SELECT * FROM trigger WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? toTrigger(row) : null
}

export function listTriggers(limit = 50, status?: TriggerStatus): Trigger[] {
  const d = orchestratorDb()
  const rows = status
    ? d.prepare('SELECT * FROM trigger WHERE status = ? ORDER BY received_at DESC LIMIT ?').all(status, limit)
    : d.prepare('SELECT * FROM trigger ORDER BY received_at DESC LIMIT ?').all(limit)
  return (rows as Record<string, unknown>[]).map(toTrigger)
}

/** 归线程：同 (source_id, thread_key) 复用一行并推进 last_event_at。 */
export function upsertThread(sourceId: string, threadKey: string, at: number): Thread {
  const d = orchestratorDb()
  const existing = d.prepare(
    'SELECT * FROM thread WHERE source_id = ? AND thread_key = ?',
  ).get(sourceId, threadKey) as Record<string, unknown> | undefined
  if (existing) {
    d.prepare('UPDATE thread SET last_event_at = ? WHERE id = ?').run(at, String(existing.id))
    return {
      id: String(existing.id), sourceId: String(existing.source_id),
      threadKey: String(existing.thread_key),
      createdAt: Number(existing.created_at), lastEventAt: at,
    }
  }
  const id = newId('thr')
  d.prepare(
    'INSERT INTO thread (id, source_id, thread_key, created_at, last_event_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, sourceId, threadKey, at, at)
  return { id, sourceId, threadKey, createdAt: at, lastEventAt: at }
}

export function getThread(id: string): Thread | null {
  const row = orchestratorDb().prepare('SELECT * FROM thread WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: String(row.id), sourceId: String(row.source_id), threadKey: String(row.thread_key),
    createdAt: Number(row.created_at), lastEventAt: Number(row.last_event_at),
  }
}

export function listThreads(limit = 50): Thread[] {
  const rows = orchestratorDb().prepare(
    'SELECT * FROM thread ORDER BY last_event_at DESC LIMIT ?',
  ).all(limit) as Record<string, unknown>[]
  return rows.map(r => ({
    id: String(r.id), sourceId: String(r.source_id), threadKey: String(r.thread_key),
    createdAt: Number(r.created_at), lastEventAt: Number(r.last_event_at),
  }))
}

export function upsertSubscription(input: {
  threadId: string; subscriber: string; mode: Subscription['mode']; cursor?: string | null
}): Subscription {
  const d = orchestratorDb()
  const existing = d.prepare(
    'SELECT * FROM subscription WHERE thread_id = ? AND subscriber = ?',
  ).get(input.threadId, input.subscriber) as Record<string, unknown> | undefined
  if (existing) {
    d.prepare('UPDATE subscription SET mode = ? WHERE thread_id = ? AND subscriber = ?')
      .run(input.mode, input.threadId, input.subscriber)
    return {
      threadId: input.threadId, subscriber: input.subscriber, mode: input.mode,
      cursor: existing.cursor === null || existing.cursor === undefined ? null : String(existing.cursor),
      createdAt: Number(existing.created_at),
    }
  }
  const at = Date.now()
  d.prepare(
    'INSERT INTO subscription (thread_id, subscriber, mode, cursor, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(input.threadId, input.subscriber, input.mode, input.cursor ?? null, at)
  return { threadId: input.threadId, subscriber: input.subscriber, mode: input.mode, cursor: input.cursor ?? null, createdAt: at }
}

export function advanceCursor(threadId: string, subscriber: string, cursor: string): boolean {
  const info = orchestratorDb().prepare(
    'UPDATE subscription SET cursor = ? WHERE thread_id = ? AND subscriber = ?',
  ).run(cursor, threadId, subscriber) as { changes?: number }
  return Number(info?.changes ?? 0) > 0
}

export function listSubscriptions(threadId: string): Subscription[] {
  const rows = orchestratorDb().prepare(
    'SELECT * FROM subscription WHERE thread_id = ?',
  ).all(threadId) as Record<string, unknown>[]
  return rows.map(r => ({
    threadId: String(r.thread_id), subscriber: String(r.subscriber), mode: String(r.mode) as Subscription['mode'],
    cursor: r.cursor === null || r.cursor === undefined ? null : String(r.cursor),
    createdAt: Number(r.created_at),
  }))
}

export function insertDecision(decision: Decision): void {
  orchestratorDb().prepare(
    `INSERT INTO decision (id, trigger_id, thread_id, verdict, strength, rule_ids, policy_version, decided_by, decided_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    decision.id, decision.triggerId, decision.threadId, decision.verdict, decision.strength,
    JSON.stringify(decision.ruleIds), decision.policyVersion, decision.decidedBy, decision.decidedAt,
  )
}

export function getDecision(id: string): Decision | null {
  const row = orchestratorDb().prepare('SELECT * FROM decision WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? toDecision(row) : null
}

export function listDecisions(limit = 50): Decision[] {
  const rows = orchestratorDb().prepare(
    'SELECT * FROM decision ORDER BY decided_at DESC LIMIT ?',
  ).all(limit) as Record<string, unknown>[]
  return rows.map(toDecision)
}

function toDecision(row: Record<string, unknown>): Decision {
  return {
    id: String(row.id), triggerId: String(row.trigger_id),
    threadId: row.thread_id === null || row.thread_id === undefined ? null : String(row.thread_id),
    verdict: String(row.verdict) as Decision['verdict'],
    strength: String(row.strength) as Decision['strength'],
    ruleIds: JSON.parse(String(row.rule_ids ?? '[]')) as string[],
    policyVersion: Number(row.policy_version),
    decidedBy: String(row.decided_by), decidedAt: Number(row.decided_at),
  }
}

export function insertMandate(mandate: Mandate): void {
  orchestratorDb().prepare(
    `INSERT INTO mandate (id, decision_id, ticket_id, scope, strength, rule_ids, policy_version, issuer, issued_at, expires_at, revoked_at, revoked_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    mandate.id, mandate.decisionId, mandate.ticketId, JSON.stringify(mandate.scope), mandate.strength,
    JSON.stringify(mandate.ruleIds), mandate.policyVersion, mandate.issuer, mandate.issuedAt,
    mandate.expiresAt, mandate.revokedAt, mandate.revokedReason,
  )
}

export function getMandate(id: string): Mandate | null {
  const row = orchestratorDb().prepare('SELECT * FROM mandate WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? toMandate(row) : null
}

export function listMandates(ticketId?: string, limit = 50): Mandate[] {
  const d = orchestratorDb()
  const rows = ticketId
    ? d.prepare('SELECT * FROM mandate WHERE ticket_id = ? ORDER BY issued_at DESC LIMIT ?').all(ticketId, limit)
    : d.prepare('SELECT * FROM mandate ORDER BY issued_at DESC LIMIT ?').all(limit)
  return (rows as Record<string, unknown>[]).map(toMandate)
}

function toMandate(row: Record<string, unknown>): Mandate {
  const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
  return {
    id: String(row.id), decisionId: String(row.decision_id), ticketId: String(row.ticket_id),
    scope: JSON.parse(String(row.scope)) as Record<string, unknown>,
    strength: String(row.strength) as Mandate['strength'],
    ruleIds: JSON.parse(String(row.rule_ids ?? '[]')) as string[],
    policyVersion: Number(row.policy_version), issuer: String(row.issuer),
    issuedAt: Number(row.issued_at), expiresAt: num(row.expires_at),
    revokedAt: num(row.revoked_at),
    revokedReason: row.revoked_reason === null || row.revoked_reason === undefined ? null : String(row.revoked_reason),
  }
}

export function revokeMandate(id: string, reason: string, at = Date.now()): boolean {
  const info = orchestratorDb().prepare(
    'UPDATE mandate SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL',
  ).run(at, reason, id) as { changes?: number }
  return Number(info?.changes ?? 0) > 0
}

export function upsertAssignment(input: {
  ticketId: string; executor: string; sessionId?: string | null; pid?: number | null
  stage: AssignmentStage; startedAt?: number
}): Assignment {
  const d = orchestratorDb()
  const startedAt = input.startedAt ?? Date.now()
  const existing = d.prepare(
    'SELECT * FROM assignment WHERE ticket_id = ? AND executor = ? AND started_at = ?',
  ).get(input.ticketId, input.executor, startedAt) as Record<string, unknown> | undefined
  if (existing) {
    d.prepare('UPDATE assignment SET stage = ?, session_id = COALESCE(?, session_id), pid = COALESCE(?, pid) WHERE ticket_id = ? AND executor = ? AND started_at = ?')
      .run(input.stage, input.sessionId ?? null, input.pid ?? null, input.ticketId, input.executor, startedAt)
    return toAssignment({ ...existing, stage: input.stage })
  }
  d.prepare(
    'INSERT INTO assignment (ticket_id, executor, session_id, pid, stage, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
  ).run(input.ticketId, input.executor, input.sessionId ?? null, input.pid ?? null, input.stage, startedAt)
  return {
    ticketId: input.ticketId, executor: input.executor, sessionId: input.sessionId ?? null,
    pid: input.pid ?? null, stage: input.stage, startedAt, endedAt: null,
  }
}

export function endAssignment(ticketId: string, executor: string, at = Date.now()): boolean {
  const info = orchestratorDb().prepare(
    'UPDATE assignment SET stage = ?, ended_at = ? WHERE ticket_id = ? AND executor = ? AND stage <> ?',
  ).run('ended', at, ticketId, executor, 'ended') as { changes?: number }
  return Number(info?.changes ?? 0) > 0
}

export function listAssignments(ticketId: string): Assignment[] {
  const rows = orchestratorDb().prepare(
    'SELECT * FROM assignment WHERE ticket_id = ? ORDER BY started_at DESC',
  ).all(ticketId) as Record<string, unknown>[]
  return rows.map(toAssignment)
}

function toAssignment(row: Record<string, unknown>): Assignment {
  return {
    ticketId: String(row.ticket_id), executor: String(row.executor),
    sessionId: row.session_id === null || row.session_id === undefined ? null : String(row.session_id),
    pid: row.pid === null || row.pid === undefined ? null : Number(row.pid),
    stage: String(row.stage) as AssignmentStage,
    startedAt: row.started_at === null || row.started_at === undefined ? null : Number(row.started_at),
    endedAt: row.ended_at === null || row.ended_at === undefined ? null : Number(row.ended_at),
  }
}

export function kvGet(key: string): string | null {
  const row = orchestratorDb().prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value?: unknown } | undefined
  return row?.value === undefined ? null : String(row.value)
}

export function kvSet(key: string, value: string, at = Date.now()): void {
  orchestratorDb().prepare(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, at)
}
