// overlay/outbox 域：待发消息队列（Always-on Agents 吸收 P2，2026-11-16）。
//
// 语义来源（Anthropic《Building always-on agents》发件箱）：常驻 agent 工作在后台，
// 一次 Run 结束先写发件箱标 pending，由 Dispatcher 决定何时、以何形式推送；支持限流、
// 失败重试、多条合并。与收件箱（inbox 注意力队列）对称：inbox 是「用户看到什么」，
// outbox 是「系统承诺要发什么」。
//
// 边界：本域只管队列与状态机；限流/合并/发送在 outbox-dispatcher.ts（纯编排，可注入
// fetch 与时钟）；HTTP 面在 outbox-controller.ts。
//
// 存储：单文件原子写（先例 inbox-store atomicWriteJson），坏档隔离，环形上限 500 条。
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { atomicWriteJson } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

export const OUTBOX_CHANNELS = ['inbox', 'matrix'] as const
export type OutboxChannel = (typeof OUTBOX_CHANNELS)[number]

export const OUTBOX_PRIORITIES = ['critical', 'high', 'normal'] as const
export type OutboxPriority = (typeof OUTBOX_PRIORITIES)[number]

export const OUTBOX_STATUSES = ['pending', 'delivering', 'delivered', 'failed', 'suppressed'] as const
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number]

export interface OutboxRecipient {
  kind: 'member' | 'agent'
  name: string
}

export interface OutboxMessage {
  id: string
  recipient: OutboxRecipient
  channel: OutboxChannel
  body: string
  priority: OutboxPriority
  source: string
  runId?: string
  /** 去重键：同键在 TTL 内已存在（pending/delivering/delivered）则不再入队。 */
  dedupeKey?: string
  /** 合并键：同键的 normal 消息在派发时合成一条 digest。 */
  mergeKey?: string
  /** 不允许早于此时刻派发（defer 到期重投）。 */
  notBefore?: number
  status: OutboxStatus
  attempts: number
  lastError?: string
  createdAt: number
  deliveredAt?: number
  /** 合并进哪条消息（被并者仍标 delivered，但不再单独发送）。 */
  mergedInto?: string
}

const MAX_MESSAGES = 500
const MAX_BODY_CHARS = 4000
const MAX_ATTEMPTS = 3
const DEDUPE_TTL_MS = 6 * 3_600_000
export const RETRY_BACKOFF_MS = [30_000, 120_000] as const

export function outboxPath(): string {
  const env = process.env.OUTBOX_PATH?.trim()
  if (env) return resolve(env)
  return underWebUi('outbox/outbox.json')
}

export function isOutboxChannel(v: unknown): v is OutboxChannel {
  return typeof v === 'string' && (OUTBOX_CHANNELS as readonly string[]).includes(v)
}
export function isOutboxPriority(v: unknown): v is OutboxPriority {
  return typeof v === 'string' && (OUTBOX_PRIORITIES as readonly string[]).includes(v)
}
export function isOutboxStatus(v: unknown): v is OutboxStatus {
  return typeof v === 'string' && (OUTBOX_STATUSES as readonly string[]).includes(v)
}

function quarantine(file: string, err: unknown): void {
  const archive = `${file}.corrupt.${Date.now()}`
  try { renameSync(file, archive) } catch { /* 留档失败不阻断 */ }
  console.warn(`[outbox-store] 队列文件解析失败，已留档 ${archive}：${err instanceof Error ? err.message : String(err)}`)
}

export function loadOutbox(): OutboxMessage[] {
  const file = outboxPath()
  if (!existsSync(file)) return []
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    quarantine(file, err)
    return []
  }
  if (!Array.isArray(raw)) {
    quarantine(file, new Error('队列结构非法（非数组）'))
    return []
  }
  return raw.filter((m): m is OutboxMessage => {
    return !!m && typeof m === 'object'
      && typeof (m as OutboxMessage).id === 'string'
      && isOutboxStatus((m as OutboxMessage).status)
  })
}

function saveOutbox(messages: OutboxMessage[]): void {
  mkdirSync(dirname(outboxPath()), { recursive: true })
  atomicWriteJson(outboxPath(), messages, { mode: 0o600 })
}

export interface EnqueueInput {
  recipient: OutboxRecipient
  body: string
  channel?: OutboxChannel
  priority?: OutboxPriority
  source: string
  runId?: string
  dedupeKey?: string
  mergeKey?: string
  notBefore?: number
  at?: number
}

export interface EnqueueResult {
  enqueued: boolean
  reason?: 'duplicate' | 'invalid'
  problems?: string[]
  message?: OutboxMessage
  duplicateOf?: string
}

/** 入队（校验 + dedupeKey 幂等 + 环形）。fail-soft：非法输入返回 problems 不抛。 */
export function enqueueOutbox(input: EnqueueInput): EnqueueResult {
  const problems: string[] = []
  if (!input || typeof input !== 'object') return { enqueued: false, reason: 'invalid', problems: ['入参必须是对象'] }
  const recipient = input.recipient
  if (!recipient || (recipient.kind !== 'member' && recipient.kind !== 'agent') || typeof recipient.name !== 'string' || !recipient.name.trim()) {
    problems.push('recipient 须为 { kind: member|agent, name }')
  }
  if (typeof input.body !== 'string' || !input.body.trim()) problems.push('body 必填')
  if (input.body && [...input.body].length > MAX_BODY_CHARS) problems.push(`body 超长（>${MAX_BODY_CHARS} 字符）`)
  if (input.channel !== undefined && !isOutboxChannel(input.channel)) problems.push(`channel 须为 ${OUTBOX_CHANNELS.join('|')}`)
  if (input.priority !== undefined && !isOutboxPriority(input.priority)) problems.push(`priority 须为 ${OUTBOX_PRIORITIES.join('|')}`)
  if (typeof input.source !== 'string' || !input.source.trim()) problems.push('source 必填')
  if (input.notBefore !== undefined && (typeof input.notBefore !== 'number' || !Number.isFinite(input.notBefore))) problems.push('notBefore 须为时间戳')
  if (problems.length) return { enqueued: false, reason: 'invalid', problems }

  const now = typeof input.at === 'number' && Number.isFinite(input.at) ? input.at : Date.now()
  const messages = loadOutbox()
  if (input.dedupeKey) {
    const dup = messages.find((m) => m.dedupeKey === input.dedupeKey
      && (m.status === 'pending' || m.status === 'delivering' || m.status === 'delivered')
      && now - m.createdAt <= DEDUPE_TTL_MS)
    if (dup) return { enqueued: false, reason: 'duplicate', duplicateOf: dup.id }
  }
  const message: OutboxMessage = {
    id: `ob-${now.toString(36)}-${randomBytes(4).toString('hex')}`,
    recipient: { kind: recipient.kind, name: recipient.name.trim() },
    channel: input.channel ?? 'inbox',
    body: input.body!.trim(),
    priority: input.priority ?? 'normal',
    source: input.source.trim(),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(input.mergeKey ? { mergeKey: input.mergeKey } : {}),
    ...(input.notBefore !== undefined ? { notBefore: input.notBefore } : {}),
    status: 'pending',
    attempts: 0,
    createdAt: now,
  }
  messages.push(message)
  while (messages.length > MAX_MESSAGES) messages.shift()
  saveOutbox(messages)
  return { enqueued: true, message }
}

export interface OutboxFilter {
  status?: OutboxStatus
  channel?: OutboxChannel
  source?: string
  recipient?: string
  limit?: number
}

export function listOutbox(filter: OutboxFilter = {}): OutboxMessage[] {
  let messages = loadOutbox()
  if (filter.status) messages = messages.filter((m) => m.status === filter.status)
  if (filter.channel) messages = messages.filter((m) => m.channel === filter.channel)
  if (filter.source) messages = messages.filter((m) => m.source === filter.source)
  if (filter.recipient) messages = messages.filter((m) => m.recipient.name === filter.recipient)
  const limit = typeof filter.limit === 'number' && Number.isFinite(filter.limit)
    ? Math.max(1, Math.min(Math.floor(filter.limit), MAX_MESSAGES))
    : 50
  return messages.slice(-limit)
}

/** 更新一条消息（内部用；不存在返回 null）。 */
export function updateOutbox(id: string, patch: Partial<OutboxMessage>): OutboxMessage | null {
  const messages = loadOutbox()
  const idx = messages.findIndex((m) => m.id === id)
  if (idx < 0) return null
  messages[idx] = { ...messages[idx], ...patch }
  saveOutbox(messages)
  return messages[idx]
}

/** 到期候选：pending 且 notBefore<=now；排序 critical→high→normal，再按入队先后。 */
export function pendingDue(now = Date.now(), limit = 50): OutboxMessage[] {
  const rank: Record<OutboxPriority, number> = { critical: 0, high: 1, normal: 2 }
  return loadOutbox()
    .filter((m) => m.status === 'pending' && (m.notBefore ?? 0) <= now)
    .sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt - b.createdAt)
    .slice(0, Math.max(1, Math.min(limit, MAX_MESSAGES)))
}

export interface OutboxStats {
  total: number
  byStatus: Record<string, number>
  byChannel: Record<string, number>
  byPriority: Record<string, number>
  pendingOldestAgeMs: number | null
}

export function outboxStats(now = Date.now()): OutboxStats {
  const messages = loadOutbox()
  const byStatus: Record<string, number> = {}
  const byChannel: Record<string, number> = {}
  const byPriority: Record<string, number> = {}
  let oldestPending: number | null = null
  for (const m of messages) {
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1
    byChannel[m.channel] = (byChannel[m.channel] ?? 0) + 1
    byPriority[m.priority] = (byPriority[m.priority] ?? 0) + 1
    if (m.status === 'pending') oldestPending = oldestPending === null ? m.createdAt : Math.min(oldestPending, m.createdAt)
  }
  return {
    total: messages.length,
    byStatus,
    byChannel,
    byPriority,
    pendingOldestAgeMs: oldestPending === null ? null : Math.max(0, now - oldestPending),
  }
}

/** 失败重试退避（30s/120s；第 3 次失败转 failed 死信）。纯函数供 dispatcher 与测试共用。 */
export function nextAttemptState(message: OutboxMessage, now: number, error: string): OutboxMessage {
  const attempts = message.attempts + 1
  if (attempts >= MAX_ATTEMPTS) {
    return { ...message, attempts, lastError: error.slice(0, 300), status: 'failed' }
  }
  const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]
  return {
    ...message, attempts, lastError: error.slice(0, 300),
    status: 'pending', notBefore: now + backoff,
  }
}

export const OUTBOX_LIMITS = { maxMessages: MAX_MESSAGES, maxBodyChars: MAX_BODY_CHARS, maxAttempts: MAX_ATTEMPTS } as const
