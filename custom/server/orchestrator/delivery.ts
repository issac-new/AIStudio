// custom/server/orchestrator/delivery.ts
// 汇总投递（2026-10-31 投递批）。
// 数据流：digest（已生成未投递）→ thread（拿 thread_key）→ 看板库 kanban_notify_subs
//         反查原信道（platform/chat_id/thread_id）→ Matrix client-server send。
//
// 设计取舍：
// - 用 matrixSend（chat-bridge）而非 raci 域的直发包装：后者在 REST 白名单守门
//   （custom/server/matrix/__tests__/raci-rest-guard.test.ts）内，新增调用点会红。
// - 只投 platform='matrix' 的订阅：其它平台需要 hermes send，本批不做。
// - 订阅表可能为空（CLI/cron 建的任务不自动订阅）→ 计 skipped，不算失败。
// - 明文发送：E2EE 房会显示不可解密，这是已知限制（见 spec §6）。
import { matrixSend } from '../matrix/chat-bridge'
import { resolveMatrixDispatchEnv } from '../matrix/raci-matrix'
import { kanbanDbPaths } from './kanban-bridge'
import { getThread, listDigests, markDigestDelivered, recordDigestAttempt } from './store'

export interface NotifyTarget {
  platform: string
  chatId: string
  threadId: string | null
}

export interface DeliveryOutcome {
  digestId: string
  status: 'delivered' | 'skipped' | 'failed'
  reason: string
  /** 实际投递的房间（多目标时逐个列）。 */
  rooms: string[]
}

export interface DeliveryResult {
  scanned: number
  delivered: number
  skipped: number
  failed: number
  outcomes: DeliveryOutcome[]
}

/** 从 thread_key（`task:<board>:<taskId>`）解析任务坐标；非 kanban 线程返回 null。 */
export function parseKanbanThreadKey(threadKey: string): { board: string; taskId: string } | null {
  if (!threadKey.startsWith('task:')) return null
  const rest = threadKey.slice('task:'.length)
  const idx = rest.indexOf(':')
  if (idx <= 0 || idx === rest.length - 1) return null
  return { board: rest.slice(0, idx), taskId: rest.slice(idx + 1) }
}

/** 只读看板库，取该任务的通知订阅（只用 platform/chat_id/thread_id 三列）。 */
export function notifyTargetsFor(dbPath: string, taskId: string): NotifyTarget[] {
  const { existsSync } = require('node:fs') as typeof import('node:fs')
  if (!existsSync(dbPath)) return []
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string, o?: unknown) => {
      prepare(sql: string): { all(...a: unknown[]): unknown[] }
      close(): void
    }
  }
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db.prepare(
      'SELECT platform, chat_id, thread_id FROM kanban_notify_subs WHERE task_id = ?',
    ).all(taskId) as Array<{ platform?: unknown; chat_id?: unknown; thread_id?: unknown }>
    return rows
      .map(r => ({
        platform: String(r.platform ?? '').trim(),
        chatId: String(r.chat_id ?? '').trim(),
        threadId: r.thread_id === null || r.thread_id === undefined ? null : String(r.thread_id),
      }))
      .filter(t => t.platform && t.chatId)
  } catch {
    // 表不存在或库不可读：当作无订阅，不阻断其它 digest。
    return []
  } finally {
    db.close()
  }
}

/** 按线程坐标在所有配置的看板库里找订阅（default 板与命名板都可能命中）。 */
export function findTargets(taskId: string, dbPaths: string[] = kanbanDbPaths()): NotifyTarget[] {
  const seen = new Set<string>()
  const out: NotifyTarget[] = []
  for (const dbPath of dbPaths) {
    for (const t of notifyTargetsFor(dbPath, taskId)) {
      const key = `${t.platform}|${t.chatId}|${t.threadId ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
  }
  return out
}

/** 组装 m.room.message 事件体；带 thread_id 时挂 Matrix 线程关系。 */
export function messageContent(body: string, threadId: string | null): Record<string, unknown> {
  const content: Record<string, unknown> = { msgtype: 'm.text', body }
  if (threadId) {
    content['m.relates_to'] = { rel_type: 'm.thread', event_id: threadId, is_falling_back: true }
  }
  return content
}

/**
 * 投递未发送的 digest。
 * 失败不抛：逐条记 attempts/last_error，由下一轮重试。
 */
export async function deliverPendingDigests(opts: {
  limit?: number
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  dbPaths?: string[]
} = {}): Promise<DeliveryResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200)
  const env = opts.env ?? process.env
  const doFetch = opts.fetchImpl ?? fetch
  const matrixEnv = resolveMatrixDispatchEnv(env)
  const pending = listDigests(undefined, limit).filter(d => !d.delivered)
  const result: DeliveryResult = {
    scanned: pending.length, delivered: 0, skipped: 0, failed: 0, outcomes: [],
  }

  for (const digest of pending) {
    if (!matrixEnv) {
      result.skipped++
      result.outcomes.push({ digestId: digest.id, status: 'skipped', reason: 'matrix_not_configured', rooms: [] })
      continue
    }
    const thread = getThread(digest.threadId)
    if (!thread) {
      result.skipped++
      result.outcomes.push({ digestId: digest.id, status: 'skipped', reason: 'thread_missing', rooms: [] })
      continue
    }
    const coords = parseKanbanThreadKey(thread.threadKey)
    if (!coords) {
      result.skipped++
      result.outcomes.push({ digestId: digest.id, status: 'skipped', reason: 'not_kanban_thread', rooms: [] })
      continue
    }
    const targets = findTargets(coords.taskId, opts.dbPaths)
      .filter(t => t.platform === 'matrix')
    if (!targets.length) {
      result.skipped++
      recordDigestAttempt(digest.id, 'no_matrix_subscription')
      result.outcomes.push({ digestId: digest.id, status: 'skipped', reason: 'no_matrix_subscription', rooms: [] })
      continue
    }

    const rooms: string[] = []
    let error: string | null = null
    for (const target of targets) {
      try {
        await matrixSend(
          matrixEnv, target.chatId, 'm.room.message',
          messageContent(digest.body, target.threadId), doFetch, digest.id,
        )
        rooms.push(target.chatId)
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
        break
      }
    }
    if (error) {
      result.failed++
      recordDigestAttempt(digest.id, error.slice(0, 300))
      result.outcomes.push({ digestId: digest.id, status: 'failed', reason: error.slice(0, 120), rooms })
      continue
    }
    markDigestDelivered(digest.id)
    result.delivered++
    result.outcomes.push({ digestId: digest.id, status: 'delivered', reason: 'ok', rooms })
  }
  return result
}

/** 投递定时器（env 开）：0 或缺省=关闭，避免默认刷屏。 */
export function deliverIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.ORCHESTRATOR_DELIVER_INTERVAL_MS ?? '')
  return Number.isFinite(raw) && raw >= 5000 ? Math.min(Math.floor(raw), 600_000) : 0
}
