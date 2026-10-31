// custom/server/orchestrator/kanban-bridge.ts
// 看板事件 → Trigger 桥（2026-10-31 A+B 批 A 部分，spec D4）。
// 只读上游 SQLite（task_events 是 append-only），用 kv 游标增量取数；
// 不改造 vendor 基线的任何写入点，因此不需要 B 类补丁。
//
// 口径：
// - 事件是系统事实（claimed/completed/blocked/...），不是人类发言，因此 actor 记为
//   `kanban:<kind>`，addressed 记 true（系统明确指向编排层）。
// - 默认准入表 allowedSenders 为空 → 全部落到 unlisted，按缺省 ignore；
//   启用方在 admissions.json 为源配置 allowedSenders 与 mode=auto 后才真正接单。
// - task_events.created_at 是秒级时间戳，转 ms（历史坑：秒/毫秒混用致时序错乱）。
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { hermesHome } from '../lib/paths'
import { ingestTrigger, type IngestResult } from './ingest'
import { kvGet, kvSet } from './store'
import type { TriggerInput } from './types'

type ReadOnlyDb = {
  prepare(sql: string): { all(...params: unknown[]): unknown[] }
  close(): void
}

interface EventRow {
  id: number
  task_id: string
  run_id: number | null
  kind: string
  payload: string | null
  created_at: number
}

/** 桥接的看板库列表：显式 env > HERMES_KANBAN_DB > 家目录 default 板。 */
export function kanbanDbPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  const explicit = (env.ORCHESTRATOR_KANBAN_DBS ?? '').trim()
  if (explicit) return explicit.split(',').map(s => resolve(s.trim())).filter(Boolean)
  const pinned = (env.HERMES_KANBAN_DB ?? '').trim()
  if (pinned) return [resolve(pinned)]
  return [resolve(hermesHome(env), 'kanban.db')]
}

function boardNameOf(dbPath: string): string {
  // 上游布局（kanban_db.py:620-625）：default 板 DB 在 <root>/kanban.db；
  // 其它板在 <root>/kanban/boards/<slug>/kanban.db。只有命中 boards 段才认板名，
  // 否则一律 default——临时目录里的 kanban.db 是测试库，不是新板。
  const parts = dbPath.replace(/\\/g, '/').split('/').filter(Boolean)
  const file = parts[parts.length - 1] ?? 'kanban.db'
  if (file === 'kanban.db') {
    const boardsIdx = parts.lastIndexOf('boards')
    const slug = boardsIdx >= 0 ? parts[boardsIdx + 1] : ''
    if (slug && slug !== 'kanban.db') return slug
    return 'default'
  }
  return file.replace(/\.db$/, '')
}

function cursorKey(dbPath: string): string {
  return `kanban-bridge:cursor:${dbPath}`
}

/**
 * 拉取一个库的新事件并映射为 Trigger。
 * 返回每条摄入结果；库不存在时返回空数组（fail-soft，不抛）。
 */
export function bridgeOnce(dbPath: string, opts: { limit?: number; decidedBy?: string } = {}): IngestResult[] {
  if (!existsSync(dbPath)) return []
  const lastId = Number(kvGet(cursorKey(dbPath)) ?? '0')
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string, o?: unknown) => ReadOnlyDb }
  // readOnly：上游库只由 hermes 侧写，桥接绝不写。
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let rows: EventRow[]
  try {
    rows = db.prepare(
      'SELECT id, task_id, run_id, kind, payload, created_at FROM task_events WHERE id > ? ORDER BY id ASC LIMIT ?',
    ).all(lastId, opts.limit ?? 200) as EventRow[]
  } finally {
    db.close()
  }
  if (!rows.length) return []
  const board = boardNameOf(dbPath)
  const out: IngestResult[] = []
  for (const row of rows) {
    const input: TriggerInput = {
      sourceId: `kanban:${board}`,
      sourceKind: 'kanban',
      externalId: `${board}:${row.id}`,
      threadKey: `task:${board}:${row.task_id}`,
      actor: `kanban:${row.kind}`,
      addressed: true,
      payload: {
        board, eventId: row.id, taskId: row.task_id, runId: row.run_id, kind: row.kind,
        detail: row.payload === null ? null : safeJson(row.payload),
      },
      // 秒 → 毫秒：上游 int(time.time())。
      receivedAt: Number(row.created_at) * 1000,
    }
    out.push(ingestTrigger(input, { decidedBy: opts.decidedBy ?? 'orchestrator:kanban-bridge' }))
  }
  const maxId = rows[rows.length - 1]!.id
  kvSet(cursorKey(dbPath), String(maxId))
  return out
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return text }
}

/** 遍历所有配置库各桥一次。 */
export function bridgeAll(opts: { limit?: number } = {}): IngestResult[] {
  const out: IngestResult[] = []
  for (const dbPath of kanbanDbPaths()) {
    out.push(...bridgeOnce(dbPath, opts))
  }
  return out
}
