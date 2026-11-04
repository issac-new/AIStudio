// custom/server/projectworkflow/project-tasks.ts
// kanban 库只读查询（2026-11-04 项目工作流域）：完成守卫的事实源。
//
// 只读纪律：DatabaseSync 一律 readOnly 打开（同 cli-fast-gates / kanban-bridge），
// 任务库唯一写者是 hermes CLI；本域绝不写库。跨板扫描 fail-soft：单板缺失/读失败
// 跳过，不放大成整域 500（守卫依据「确认在途」的卡，读不到的板不构成阻断证据，
// 也不构成放行证据——因此 default 板缺席时守卫按「无在途证据」处理，由调用方
// 在响应里如实呈现统计面）。
//
// 布局锚点（kanban_db.py:620-625 / kanban-bridge boardNameOf / collectors boards 枚举）：
//   default 板：<root>/kanban.db 或 <root>/kanban/kanban.db（两布局探测）
//   其它板：<root>/kanban/boards/<slug>/kanban.db
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { kanbanRootOf } from './state-store'

type ReadOnlyDb = {
  prepare(sql: string): { all(...params: unknown[]): unknown[] }
  close(): void
}

export interface BoardDb {
  board: string
  path: string
}

export interface ProjectTask {
  id: string
  status: string
  title: string
  board: string
}

export interface ProjectTaskStats {
  /** 按 status 聚合的全板任务计数（无任务的项目为空对象）。 */
  byStatus: Record<string, number>
  total: number
}

/** 板名推导（kanban-bridge boardNameOf 同款）：路径含 boards/<slug> 段才认板名，
 *  否则 default——临时目录里的裸 kanban.db 是测试库，不是新板。 */
export function boardNameOf(dbPath: string): string {
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

/** 全部板库清单：default（两布局探测）+ kanban/boards/<slug> 全枚举。
 *  boards 目录不存在 → 仅返回 default 可见集（目录缺失不是错误）。 */
export function listBoardDbs(root: string = kanbanRootOf()): BoardDb[] {
  const out: BoardDb[] = []
  // default：优先 <root>/kanban.db，退 <root>/kanban/kanban.db（boardDbPath 同序）。
  for (const p of [join(root, 'kanban.db'), join(root, 'kanban', 'kanban.db')]) {
    if (existsSync(p)) {
      out.push({ board: 'default', path: p })
      break
    }
  }
  const boardsDir = join(root, 'kanban', 'boards')
  try {
    for (const d of readdirSync(boardsDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('_')) continue // 收敛锚点：collectors.ts boards 枚举
      const p = join(boardsDir, d.name, 'kanban.db')
      if (existsSync(p)) out.push({ board: boardNameOf(p), path: p })
    }
  } catch { /* boards 目录不存在/不可读：只剩 default 可见集 */ }
  return out
}

/** 单板只读查询（fail-soft：库缺失/读失败/表缺席 → null，不抛）。 */
function queryBoard<T>(dbPath: string, sql: string, ...params: unknown[]): T[] | null {
  let db: ReadOnlyDb | null = null
  try {
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (p: string, o?: unknown) => ReadOnlyDb }
    db = new DatabaseSync(dbPath, { readOnly: true })
    return db.prepare(sql).all(...params) as T[]
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

interface TaskRow {
  id: unknown
  status: unknown
  title: unknown
}

/** 项目的未终结任务（跨全板）：status NOT IN ('done','archived')。
 *  done/archived 是任务库的终态集（kanban_db.py VALID_STATUSES 口径）。 */
export function unfinishedProjectTasks(projectId: string, root: string = kanbanRootOf()): ProjectTask[] {
  const out: ProjectTask[] = []
  for (const { board, path } of listBoardDbs(root)) {
    const rows = queryBoard<TaskRow>(
      path,
      "SELECT id, status, title FROM tasks WHERE project_id = ? AND status NOT IN ('done','archived')",
      projectId,
    )
    if (!rows) continue
    for (const r of rows) {
      out.push({ id: String(r.id), status: String(r.status), title: String(r.title ?? ''), board })
    }
  }
  return out
}

/** 项目任务统计（跨全板按 status 聚合 + 总数）。 */
export function projectTaskStats(projectId: string, root: string = kanbanRootOf()): ProjectTaskStats {
  const byStatus: Record<string, number> = {}
  let total = 0
  for (const { path } of listBoardDbs(root)) {
    const rows = queryBoard<{ status: unknown; n: unknown }>(
      path,
      'SELECT status, COUNT(*) AS n FROM tasks WHERE project_id = ? GROUP BY status',
      projectId,
    )
    if (!rows) continue
    for (const r of rows) {
      const n = Number(r.n) || 0
      byStatus[String(r.status)] = (byStatus[String(r.status)] ?? 0) + n
      total += n
    }
  }
  return { byStatus, total }
}

/** 全库 distinct project_id（/projects 列表的发现面：有任务但无状态行的项目也是项目）。 */
export function listProjectIds(root: string = kanbanRootOf()): string[] {
  const ids = new Set<string>()
  for (const { path } of listBoardDbs(root)) {
    const rows = queryBoard<{ project_id: unknown }>(
      path,
      'SELECT DISTINCT project_id FROM tasks WHERE project_id IS NOT NULL AND project_id != ?',
      '',
    )
    if (!rows) continue
    for (const r of rows) {
      const id = String(r.project_id ?? '').trim()
      if (id) ids.add(id)
    }
  }
  return [...ids].sort()
}
