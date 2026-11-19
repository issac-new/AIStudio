// overlay[delivery]: 看板库 lean 只读器（2026-10-23 天猫数字员工两文吸收轮）。
// 与 governance/board-status.ts 同款形态：主库 <home>/kanban.db（default 板）+
// 分板 <home>/kanban/boards/<slug>/kanban.db（旧布局 <home>/boards 兜底）；
// 只读打开、用完即关、逐板 fail-soft（单板读失败 available:false 不拖垮聚合）。
// 供给 delivery 域 digest/matrix：任务轻量行 + 生命周期事件（commented 计介入）。

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TaskLite } from './matrix'
import type { EventLite } from './digest'
// 布局解析收口（批二）：分板枚举走单一事实源（双布局全枚举，收敛前只认单个目录）。
import { namedBoardDbsOf, mainDbOf } from '../services/hermes/kanban-layout'

export interface BoardRead {
  slug: string
  available: boolean
  tasks: TaskLite[]
  events: EventLite[]
  error?: string
}

/** tasks 表时间戳容错：epoch 秒（<1e12 视作秒原样）；空/非法 null（detectors 约定） */
function secOf(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return n < 1e12 ? n : Math.floor(n / 1000)
}

/** 单形态返回（loose 模式下联合收窄不可靠）：error 非空=读失败 */
function queryDb(dbPath: string, fn: (db: { prepare: (sql: string) => { all: () => unknown[] } }) => unknown): { value: unknown; error: string | null } {
  let db: { close: () => void } | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    db = new DatabaseSync(dbPath, { readOnly: true })
    return { value: fn(db as never), error: null }
  } catch (e) {
    return { value: null, error: String((e as Error).message || e).slice(0, 160) }
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

/** 分板目录列表（slug 与库路径；目录缺席空数组）。双布局全枚举（批二收口：
 *  旧布局板此前只在 delivery 单板解析可见，枚举面看不见）。 */
export function boardDbPaths(home: string): Array<{ slug: string; dbPath: string }> {
  return namedBoardDbsOf(home)
}

function taskOfRow(slug: string, r: Record<string, unknown>): TaskLite {
  return {
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    status: String(r.status ?? 'unknown'),
    board: slug,
    assignee: r.assignee == null ? null : String(r.assignee),
    createdAt: secOf(r.created_at),
    startedAt: secOf(r.started_at),
    completedAt: secOf(r.completed_at),
    lastHeartbeatAt: secOf(r.last_heartbeat_at),
    result: r.result == null ? null : String(r.result),
    estimateDays: r.estimate_days == null ? null : Number(r.estimate_days),
    childCount: 0,
    commentCount: 0,
  }
}

/** 单板读取：tasks 全列轻量化 + task_events 生命周期事件（全量，板级量小） */
export function readBoard(slug: string, dbPath: string): BoardRead {
  const res = queryDb(dbPath, db => {
    const taskRows = db.prepare(
      'select id, title, status, assignee, created_by, created_at, started_at, completed_at, last_heartbeat_at, result, estimate_days from tasks',
    ).all() as Array<Record<string, unknown>>
    const eventRows = db.prepare(
      'select id, task_id, kind, payload, created_at from task_events order by created_at, id',
    ).all() as Array<Record<string, unknown>>
    return { taskRows, eventRows }
  })
  if (res.error != null) return { slug, available: false, tasks: [], events: [], error: res.error }
  const { taskRows, eventRows } = res.value as { taskRows: Array<Record<string, unknown>>; eventRows: Array<Record<string, unknown>> }
  const tasks = taskRows.map(r => taskOfRow(slug, r))
  const events: EventLite[] = []
  for (const r of eventRows) {
    const at = secOf(r.created_at)
    if (at == null) continue
    let author: string | undefined
    try {
      const payload = r.payload ? (JSON.parse(String(r.payload)) as Record<string, unknown>) : null
      if (payload && typeof payload.author === 'string') author = payload.author
    } catch { /* payload 非对象如实略过 author */ }
    events.push({ taskId: String(r.task_id ?? ''), kind: String(r.kind ?? ''), at, seq: Number(r.id ?? 0) || 0, author })
  }
  const byId = new Map(tasks.map(t => [t.id, t]))
  for (const e of events) {
    const t = byId.get(e.taskId)
    if (t && e.kind === 'commented') t.commentCount += 1
  }
  return { slug, available: true, tasks, events }
}

/** 主库（default 板）读取；主库缺席返回 available:false */
export function readMainBoard(home: string): BoardRead {
  const dbPath = mainDbOf(home)
  if (!dbPath) return { slug: 'default', available: false, tasks: [], events: [], error: '主库缺席' }
  return readBoard('default', dbPath)
}

/** 全板聚合（主库 + 分板；逐板 fail-soft） */
export function readAllBoards(home: string): BoardRead[] {
  const out = [readMainBoard(home)]
  for (const { slug, dbPath } of boardDbPaths(home)) out.push(readBoard(slug, dbPath))
  return out
}
