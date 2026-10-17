// overlay/custom/server/middleware/cli-fast-gates.ts
// CLI 快 404 闸（2026-10-14 全量回归轮 D4/D5 根治）：一类端点的首字节延迟完全
// 耗在 hermes CLI 子进程上——对「资源不存在」的请求也要付全额 spawn 成本后才能
// 得到 404（回归实测：不存在的看板任务 9-11s、不存在的 profile runtime-status
// 12s+ 超时）。两道闸在进入 CLI 前用本地事实源做存在性预检，查无即秒回 404：
//   · kanbanTaskFast404：GET /api/hermes/kanban/:id（含 /log、/attachments 子路
//     径）——经 sqlite 直读任务库（与 agent CLI 同根同库，根解析对齐 kanban_db.py
//     的 kanban_home()：HERMES_KANBAN_HOME → HERMES_HOME → ~/.hermes）。
//   · profileFast404：GET /api/hermes/profiles/:name（含 /runtime-status）——经
//     磁盘 profile 目录清单（listProfileNamesFromDisk，读 <home>/profiles/*）。
// 语义红线：预检**只能把「确认不存在」变快**，不能把「存在」变慢、也不能在事实
// 源不可读时武断 404——库文件/目录读不到（null）一律放行交 CLI 裁决，保证不比
// 修复前更坏；保留字路径（boards/stats/overview 等真实子路由）不经闸，避免与
// 路由表抢答。
import type { Context, Next } from 'koa'
import { existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'node:os'

/** agent CLI 的 kanban 根（kanban_db.py kanban_home() 同序）：与
 *  kanban-overview 快道 / routes.ts resolveKanbanDir 同一根解析族。 */
export function defaultKanbanCliRoot(): string {
  const kanbanOverride = process.env.HERMES_KANBAN_HOME?.trim()
  if (kanbanOverride) return resolve(kanbanOverride)
  const hermesOverride = process.env.HERMES_HOME?.trim()
  if (hermesOverride) return resolve(hermesOverride)
  return join(homedir(), '.hermes')
}

/** 主库/分板库布局探测（kanban-overview fastMainDb/fastBoardsDir 同款）。 */
function boardDbPath(root: string, board: string): string | null {
  if (board === 'default') {
    const p1 = join(root, 'kanban.db')
    if (existsSync(p1)) return p1
    const p2 = join(root, 'kanban', 'kanban.db')
    return existsSync(p2) ? p2 : null
  }
  const p1 = join(root, 'kanban', 'boards', board, 'kanban.db')
  if (existsSync(p1)) return p1
  const p2 = join(root, 'boards', board, 'kanban.db')
  return existsSync(p2) ? p2 : null
}

/** 任务存在性：true/false；库缺失或读失败 → null（不可判，放行）。 */
function taskExistsInBoard(root: string, board: string, taskId: string): boolean | null {
  const dbPath = boardDbPath(root, board)
  if (!dbPath) return null
  let db: any = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    db = new DatabaseSync(dbPath, { readOnly: true })
    const row = db.prepare('SELECT 1 FROM tasks WHERE id = ? LIMIT 1').get(taskId)
    return Boolean(row)
  } catch {
    return null
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

/** 全板存在性（跨板解析兜底）：任务 ID 全局唯一，本板查无时再扫全板。
 *  true=存在（放行给控制器跨板解析）；false=全板确认不存在（可快 404）；
 *  null=库全不可读（不可判，放行）。 */
function taskExistsAnywhere(root: string, taskId: string): boolean | null {
  const boards = new Set<string>(['default'])
  for (const dir of [join(root, 'kanban', 'boards'), join(root, 'boards')]) {
    try {
      for (const slug of readdirSync(dir)) {
        if (!slug.startsWith('_') && slug !== 'default') boards.add(slug)
      }
    } catch { /* 目录不存在/不可读：跳过 */ }
  }
  let readable = false
  for (const board of boards) {
    const exists = taskExistsInBoard(root, board, taskId)
    if (exists === true) return true
    if (exists !== null) readable = true
  }
  return readable ? false : null
}

/** GET /api/hermes/kanban/:id 家族的保留首段（上游 routes/kanban.ts + fleet 路由
 *  的静态子路由全集；命中保留字的路径不经闸——它们有真实 handler）。 */
const KANBAN_RESERVED_SEGMENTS = new Set([
  'dashboard-url', 'boards', 'capabilities', 'stats', 'assignees', 'diagnostics',
  'orchestration', 'artifact', 'workspace-files', 'timeline', 'search-sessions',
  'links', 'tasks', 'home-channels', 'debug-home-channels', 'estimate', 'projects',
  'dispatch', 'complete', 'unblock', 'reopen-review', 'attachments', 'overview',
])

const KANBAN_PREFIX = '/api/hermes/kanban/'
const BOARD_SLUG_RE = /^[A-Za-z0-9_-]+$/

export interface KanbanFastGateDeps {
  cliRoot?: () => string
}

export function createKanbanTaskFast404(deps: KanbanFastGateDeps = {}) {
  const cliRoot = deps.cliRoot ?? defaultKanbanCliRoot
  return async function kanbanTaskFast404(ctx: Context, next: Next): Promise<void> {
    if (ctx.method === 'GET' && ctx.path.startsWith(KANBAN_PREFIX)) {
      const rest = ctx.path.slice(KANBAN_PREFIX.length).replace(/\/+$/, '')
      const segs = rest ? rest.split('/') : []
      // 仅拦会落到 /:id 家族的形态：/:id、/:id/log、/:id/attachments、/:id/attachments/:att
      const shapeIsTaskRoute =
        segs.length === 1 ||
        (segs.length === 2 && (segs[1] === 'log' || segs[1] === 'attachments')) ||
        (segs.length === 3 && segs[1] === 'attachments')
      const head = segs[0] ?? ''
      if (shapeIsTaskRoute && head && !KANBAN_RESERVED_SEGMENTS.has(head)) {
        const boardQuery = ctx.query.board
        const board = typeof boardQuery === 'string' && BOARD_SLUG_RE.test(boardQuery) ? boardQuery : 'default'
        const exists = taskExistsInBoard(cliRoot(), board, head)
        if (exists === false) {
          // 本板查无 ≠ 全仓无：任务可能在他板（控制器 492 跨板解析负责重试）。
          // 全板扫描确认不存在才快 404；任一库不可读时 anywhere=null → 放行。
          const anywhere = taskExistsAnywhere(cliRoot(), head)
          if (anywhere === false) {
            ctx.status = 404
            ctx.body = { error: 'task not found' }
            return
          }
        }
      }
    }
    return next()
  }
}

export const kanbanTaskFast404 = createKanbanTaskFast404()

const PROFILE_PREFIX = '/api/hermes/profiles/'
/** GET 侧保留段：runtime-statuses（列表）/active（PUT，防御性保留）/import（POST）。 */
const PROFILE_RESERVED_SEGMENTS = new Set(['runtime-statuses', 'active', 'import'])

export interface ProfileFastGateDeps {
  /** 磁盘 profile 清单（由 routes.ts 注入上游 listProfileNamesFromDisk——custom
   *  不 import upstream 是本仓既定边界；缺省 fail-open 闸不生效）。 */
  listProfileNames?: () => string[] | null
}

export function createProfileFast404(deps: ProfileFastGateDeps = {}) {
  const listProfileNames = deps.listProfileNames ?? (() => null)
  return async function profileFast404(ctx: Context, next: Next): Promise<void> {
    if (ctx.method === 'GET' && ctx.path.startsWith(PROFILE_PREFIX)) {
      const rest = ctx.path.slice(PROFILE_PREFIX.length).replace(/\/+$/, '')
      const segs = rest ? rest.split('/') : []
      const shapeIsProfileRoute = segs.length === 1 || (segs.length === 2 && segs[1] === 'runtime-status')
      const name = segs[0] ?? ''
      if (shapeIsProfileRoute && name && !PROFILE_RESERVED_SEGMENTS.has(name)) {
        const names = listProfileNames()
        if (names && !names.includes(name)) {
          ctx.status = 404
          ctx.body = { error: 'profile not found' }
          return
        }
      }
    }
    return next()
  }
}

export const profileFast404 = createProfileFast404()
