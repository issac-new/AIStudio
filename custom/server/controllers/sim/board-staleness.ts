// overlay/custom/server/controllers/sim/board-staleness.ts
// 看板停滞看门狗端点（run23 实锤根治：卡依赖图锁死无人告警）——
// docs/superpowers/specs/2026-10-29-kanban-deps-and-session-rotation.md 案一。
//
// run23 实录形态：缺陷卡（叶子工作）建卡时挂到一张 blocked 26 小时的父卡下，
// 叶子修复合入后结卡被依赖守卫正确拒绝（vendor/hermes-agent/hermes_cli/kanban_db.py
// complete 守卫：父卡未 done/archived 则子卡不得完成）——结构上锁死，守卫是对的、
// 错在无人看见。本端点只做检测面：找出「blocked 超过 2 小时且仍有在途子卡」的父卡，
// 供 cron/监控（scripts/board-staleness-watchdog.mjs）消费告警；不改守卫本身。
//
// 判据（对 vendor schema 的直读，node:sqlite）：
//   - 父卡 tasks.status='blocked'；
//   - blocked 时长 = 最新一对 blocked/unblocked 事件中 blocked 侧的 created_at
//     （epoch 秒，同 vendor _has_sticky_block 的取法）；无事件或最新是 unblocked
//     （直改库/漂移态）→ 无法断定时长，如实跳过，不猜数；
//   - 在途子卡 = task_links 关联且 status NOT IN ('blocked','done','archived')
//     （任务口径「非 blocked 子卡」收窄掉终态：done 子卡挂阻塞父是已完成历史，
//     不是锁死，计入会淹没告警——spec 决策记录 D1-3）。
//
// fail-soft（读模型，N1/K19）：env 缺席 / 板库不存在 / 库里无 tasks 表 →
// 200 { ok:true, available:false, note }，不报错不猜数。挂载：patch 706。
import Router from '@koa/router'
import type { Context } from 'koa'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ok, unavailable } from '../../lib/http'

/** 停滞阈值（小时）：blocked 超过该时长且仍有在途子卡 → 停滞父卡（run23 T06 实录 26h）。 */
export const DEFAULT_STALE_HOURS = 2

/** 在途子卡口径：排除 blocked 与终态（done/archived）——见文件头判据说明。 */
const OPEN_CHILD_EXCLUDE = "('blocked', 'done', 'archived')"

export interface StaleChild {
  id: string
  title: string
  status: string
}

export interface StaleParent {
  id: string
  title: string
  /** blocked 已持续小时数（按最新 blocked 事件起算，一位小数）。 */
  blockedHours: number
  /** 最新 blocked 事件的 epoch 秒——告警行可回溯定锚。 */
  blockedSinceSec: number
  /** tasks.block_kind（typed block reason，缺省 null 如实透传）。 */
  blockKind: string | null
  children: StaleChild[]
}

export type BoardStalenessBody =
  | { available: true; board: string; staleHours: number; scannedAt: number; staleParents: StaleParent[] }
  | { available: false; board?: string; note: string }

/** 板库路径解析（fail-soft 门）：
 *  1) HERMES_KANBAN_DB 显式钉住 db 文件绝对路径（与 vendor kanban_db_path 同名同义）；
 *  2) 否则推演根（OBS_SIM_ROOT 优先、SIM_ROOT 回落，同 fleet-utilization 口径——
 *     只认显式 env 不做盘位启发）下 hermes home：<root>/hermes/kanban.db（default 板）
 *     或 <root>/hermes/kanban/boards/<slug>/kanban.db（命名板）。
 *  缺席/不存在返回 null，调用方走 unavailable。 */
export function boardDbPathOrNull(board: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const pin = (env.HERMES_KANBAN_DB ?? '').trim()
  if (pin) return existsSync(pin) ? pin : null
  const root = (env.OBS_SIM_ROOT ?? env.SIM_ROOT ?? '').trim()
  if (!root) return null
  const slug = board && board !== 'default' ? board : ''
  const db = slug
    ? join(root, 'hermes', 'kanban', 'boards', slug, 'kanban.db')
    : join(root, 'hermes', 'kanban.db')
  return existsSync(db) ? db : null
}

/** 停滞检测（纯读聚合，测试面）：单板库 → 停滞父卡清单。
 *  库损坏/无 tasks 表抛错（调用方 catch 转 unavailable）；不写任何东西。 */
export function detectStaleParents(
  dbPath: string,
  nowMs: number,
  staleHours: number = DEFAULT_STALE_HOURS,
): StaleParent[] {
  // 不传 readOnly：本仓 node 版本不接受该选项（clusterinspector 实锤，抛错→整面恒空）
  const db = new DatabaseSync(dbPath)
  try {
    // 在途子卡存在性前置过滤：只取「blocked 且确有在途子卡」的父卡，逐父卡再取详情
    const parents = db.prepare(
      `SELECT p.id, p.title, p.block_kind FROM tasks p
       WHERE p.status = 'blocked' AND EXISTS (
         SELECT 1 FROM task_links l JOIN tasks c ON c.id = l.child_id
         WHERE l.parent_id = p.id AND c.status NOT IN ${OPEN_CHILD_EXCLUDE})`,
    ).all() as unknown as Array<{ id: string; title: string; block_kind: string | null }>

    const out: StaleParent[] = []
    for (const p of parents) {
      // 最新一对 blocked/unblocked 事件：最新侧非 blocked（直改库漂移）→ 时长不可断定，跳过
      const evt = db.prepare(
        `SELECT kind, created_at FROM task_events
         WHERE task_id = ? AND kind IN ('blocked', 'unblocked')
         ORDER BY id DESC LIMIT 1`,
      ).get(p.id) as { kind: string; created_at: number } | undefined
      if (!evt || evt.kind !== 'blocked') continue
      const sinceSec = Number(evt.created_at)
      if (!Number.isFinite(sinceSec)) continue
      const blockedHours = (nowMs / 1000 - sinceSec) / 3600
      if (blockedHours <= staleHours) continue
      const children = db.prepare(
        `SELECT c.id, c.title, c.status FROM task_links l
         JOIN tasks c ON c.id = l.child_id
         WHERE l.parent_id = ? AND c.status NOT IN ${OPEN_CHILD_EXCLUDE}
         ORDER BY c.id`,
      ).all(p.id) as unknown as StaleChild[]
      out.push({
        id: p.id,
        title: p.title,
        blockedHours: Math.round(blockedHours * 10) / 10,
        blockedSinceSec: sinceSec,
        blockKind: p.block_kind ?? null,
        children,
      })
    }
    return out
  } finally {
    try { db.close() } catch { /* 已关 */ }
  }
}

export function createBoardStalenessRouter(): Router {
  const router = new Router()
  router.get('/api/sim/board-staleness', (ctx: Context) => {
    const board = String(ctx.query.board ?? 'default').trim() || 'default'
    // staleHours 可调（cron 想收紧/放宽），夹在 [0.1, 168] 防误传负数/天文数字
    const raw = Number(ctx.query.staleHours)
    const staleHours = Number.isFinite(raw) && raw > 0 ? Math.min(Math.max(raw, 0.1), 168) : DEFAULT_STALE_HOURS

    const db = boardDbPathOrNull(board)
    if (!db) {
      // K19：读模型降级走 lib/http 统一出口（200 + ok:true + available:false + note）
      unavailable(ctx, `板库缺席：board=${board}（HERMES_KANBAN_DB / OBS_SIM_ROOT / SIM_ROOT 未配或路径不存在）`)
      return
    }
    try {
      const staleParents = detectStaleParents(db, Date.now(), staleHours)
      ok(ctx, { available: true, board, staleHours, scannedAt: Date.now(), staleParents })
    } catch (err) {
      // fail-soft：库损坏/无 tasks 表如实缺席（note 截断 ≤200 字符，不外泄整段堆栈）
      const msg = err instanceof Error ? err.message : String(err)
      unavailable(ctx, `板库读取失败：board=${board} ${msg.slice(0, 200)}`)
    }
  })
  return router
}

export default createBoardStalenessRouter()
