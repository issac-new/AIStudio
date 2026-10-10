// overlay/custom/server/governance/board-status.ts
// 跨账号板状态分布（缺失功能实施方案 G3，2026-10-10）：步 22 工作台账的产品面——
// 一屏可见全部账号板的 todo/doing/review/blocked/done 计数与 WIP（进行中口径）。
//
// 数据源=看板 sqlite 快道同款（与 kanban-overview/CLI 同一存储同一 rows）：
//   主库 <home>/kanban.db（default 板）+ 分板 <home>/kanban/boards/<slug>/kanban.db
//   （旧布局 <home>/boards 兜底）。只读打开、用完即关。
// 语义与 overview 快道的差别：**逐板 fail-soft**——单板读不了标记 available:false
// 如实呈现（分布视图部分可用优于整体回落）；零板=空数组（前端空态）。
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface BoardStatusEntry {
  slug: string
  name: string
  available: boolean
  total: number
  statuses: Record<string, number>
  /** 进行中口径=doing+review+blocked（WIP 治理观察位） */
  wip: number
  updatedAt?: number
}

export interface BoardStatusResult {
  boards: BoardStatusEntry[]
  fetchedAt: number
}

function queryDb(dbPath: string, fn: (db: any) => unknown): unknown {
  let db: any = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    db = new DatabaseSync(dbPath, { readOnly: true })
    return fn(db)
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

function mainDb(home: string): string | null {
  const p1 = join(home, 'kanban.db')
  if (existsSync(p1)) return p1
  const p2 = join(home, 'kanban', 'kanban.db')
  return existsSync(p2) ? p2 : null
}

function boardsDir(home: string): string | null {
  const p1 = join(home, 'kanban', 'boards')
  if (existsSync(p1)) return p1
  const p2 = join(home, 'boards')
  return existsSync(p2) ? p2 : null
}

function entryOf(slug: string, name: string, dbPath: string | null): BoardStatusEntry {
  if (!dbPath || !existsSync(dbPath)) {
    return { slug, name, available: false, total: 0, statuses: {}, wip: 0 }
  }
  const rows = queryDb(dbPath, db => db.prepare('select status, count(*) n from tasks group by status').all()) as Array<{ status: string; n: number }> | null
  if (!rows) {
    return { slug, name, available: false, total: 0, statuses: {}, wip: 0 }
  }
  const statuses: Record<string, number> = {}
  let total = 0
  for (const r of rows) {
    const s = String(r.status || 'unknown')
    statuses[s] = (statuses[s] ?? 0) + Number(r.n || 0)
    total += Number(r.n || 0)
  }
  const wip = (statuses.doing ?? 0) + (statuses.review ?? 0) + (statuses.blocked ?? 0)
  let updatedAt: number | undefined
  try { updatedAt = Math.floor(statSync(dbPath).mtimeMs / 1000) } catch { /* 缺席如实 */ }
  return { slug, name, available: true, total, statuses, wip, updatedAt }
}

export function collectBoardStatus(homeDir = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')): BoardStatusResult {
  const boards: BoardStatusEntry[] = []
  const main = mainDb(homeDir)
  if (main) boards.push(entryOf('default', 'Default', main))
  const dir = boardsDir(homeDir)
  if (dir) {
    for (const slug of readdirSync(dir)) {
      // 与 kanban-overview 快道同判：下划线前缀=特殊/归档目录；default 残根跳过
      if (slug.startsWith('_') || slug === 'default') continue
      let name = slug
      try {
        const meta = JSON.parse(readFileSync(join(dir, slug, 'board.json'), 'utf8'))
        name = meta.name || slug
      } catch { /* board.json 缺席用 slug */ }
      boards.push(entryOf(slug, name, join(dir, slug, 'kanban.db')))
    }
  }
  boards.sort((a, b) => a.slug.localeCompare(b.slug))
  return { boards, fetchedAt: Math.floor(Date.now() / 1000) }
}
