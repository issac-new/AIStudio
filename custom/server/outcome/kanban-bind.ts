// custom/server/outcome/kanban-bind.ts
// 看板 tasks.outcome_id 绑定写入口（spec 2026-11-19-ai-native-operating-model-design.md
// §「看板挂靠」；AI 原生组织运行模型批一 Task 9）。合同激活时由调用方把根任务
// outcome_id 写入（custom/server/outcome 域唯一 Studio 侧落库面）。
//
// 通道：node:sqlite 直写各板 kanban.db——路径解析单一事实源=kanban-layout
// （boardDbPathOf/allBoardDbsOf，与 kanban-task-fast/collectors 同源）；写入口
// 照 custom 树可写先例（qgate persistence / governance store）。
//
// 三态规则（服务端只许「空→值」或同值；改挂须结果责任人显式迁移事件，批一未实现）：
//   - 空（NULL 或 ''）→ 值：成功，落 outcome_bound 审计事件（task_events）；
//   - 已值且相同：幂等成功（unchanged=true，零写入零事件）；
//   - 已值且不同：拒 {ok:false, code:'outcome_rebind_forbidden'}，库面零改动。
//
// 写闸兼容：宿主武装 sanctioned-writer guardrail（kanban_db.py
// install_guardrail_triggers，HERMES_KANBAN_WRITE_GUARDRAIL=1）的板，裸连接在
// prepare 期即被 "no such function: kanban_write_sanctioned" 拒绝。本写入口在
// 连接上注册同名 UDF（恒 1）——与 Python register_write_sanction_udf 同语义：
// Studio 服务端进程是宿主侧写者、非 delegate_task 委派子进程，属该闸的授权面；
// 其余裸 sqlite 客户端仍被 fail-closed 拦截（闸的初衷不变）。
//
// 版本闸：tasks 行 UPDATE 由内核触发器 trg_tasks_version_bump 自动 version+1
// （批二机制），本入口不自行维护版本号；同值幂等路径不产生 UPDATE，版本不动。
//
// 契约：全程 fail-soft 不抛——所有失败以 {ok:false, code} 返回（outcome 域
// controller 消费惯例）；taskId 跨板定位（未指定 board 时枚举各板，先见先得，
// 与 governance/collectors 枚举口径一致，`_` 归档目录跳过）。
import { createRequire } from 'node:module'
import { hermesHome } from '../lib/paths'
import { allBoardDbsOf, boardDbPathOf } from '../services/hermes/kanban-layout'

// 双运行时取 node:sqlite：服务端 ts-node（CJS）与 vitest（ESM）都走 createRequire
// 解内置模块（kanban-task-fast 同款）；解不出=绑定通道关闭（db_unavailable）。
const nodeRequire: NodeRequire | null = (() => {
  try { return createRequire('/index.js') } catch { return null }
})()

type Stmt = { get: (...p: unknown[]) => unknown; run: (...p: unknown[]) => unknown }
type Db = {
  exec: (sql: string) => void
  prepare: (sql: string) => Stmt
  function?: (name: string, fn: (...args: unknown[]) => unknown) => void
  close: () => void
}

export type BindOutcomeCode =
  | 'invalid_outcome_id'
  | 'db_unavailable'
  | 'task_not_found'
  | 'outcome_rebind_forbidden'
  | 'write_failed'

export interface BindOutcomeResult {
  ok: boolean
  code?: BindOutcomeCode
  /** 成功时的落库值（同值幂等时=既有值）。 */
  outcomeId?: string
  /** 绑定前的值（空→值时为 null）。 */
  previousOutcomeId?: string | null
  /** 同值重放标记（true=本次零写入）。 */
  unchanged?: boolean
  board?: string
  dbPath?: string
  error?: string
}

export interface BindOutcomeOptions {
  /** 覆写 hermes home（测试注入；缺省 lib/paths hermesHome）。 */
  home?: string
  /** 指定板 slug（default=主库）；缺省跨板定位 taskId。 */
  board?: string
  now?: () => number
}

/** 读出面把 '' 归一为 null（历史写入可能存空串；空串语义=未挂靠）。 */
function normalize(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

/** 打开可写连接并注册 sanction UDF（guardrail 武装板可写、未武装板无感）。 */
function openWritable(dbPath: string): Db | null {
  if (!nodeRequire) return null
  try {
    const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => Db }
    const db = new DatabaseSync(dbPath)
    // 见文件头「写闸兼容」——恒 1 即本进程（Studio 服务端）的自我授权声明。
    db.function?.('kanban_write_sanctioned', () => 1)
    return db
  } catch {
    return null
  }
}

/**
 * 把 outcomeId 绑到看板任务（三态规则见文件头）。
 * 同步接口：sqlite 操作全同步（outcome 域 outcome-store 同款），不引入回调面。
 */
export function bindOutcomeToTask(
  taskId: string,
  outcomeId: string,
  opts: BindOutcomeOptions = {},
): BindOutcomeResult {
  if (typeof outcomeId !== 'string' || !outcomeId.trim()) {
    return { ok: false, code: 'invalid_outcome_id', error: 'outcomeId 为空（空值不是可写绑定）' }
  }
  const home = opts.home ?? hermesHome()
  const boardDb = opts.board ? boardDbPathOf(opts.board, home) : null
  const candidates = opts.board
    ? boardDb
      ? [{ slug: opts.board, dbPath: boardDb }]
      : []
    : allBoardDbsOf(home, { skipUnderscored: true })
  if (candidates.length === 0) {
    return { ok: false, code: 'db_unavailable', error: 'hermes home 下无看板库' }
  }

  for (const { slug, dbPath } of candidates) {
    let db: Db | null = null
    try {
      db = openWritable(dbPath)
      if (!db) return { ok: false, code: 'db_unavailable', error: 'node:sqlite 不可用或库无法打开' }
      const row = db.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get(taskId) as
        | { outcome_id: unknown }
        | undefined
      if (!row) continue // 该板无此卡：fail-soft 试下一板
      const current = normalize(row.outcome_id)
      if (current === outcomeId) {
        return { ok: true, outcomeId, previousOutcomeId: current, unchanged: true, board: slug, dbPath }
      }
      if (current !== null) {
        // 改挂=显式迁移事件面，批一只实现拒绝（spec 关键约束）。
        return {
          ok: false,
          code: 'outcome_rebind_forbidden',
          previousOutcomeId: current,
          board: slug,
          dbPath,
          error: `任务已挂靠 ${current}；改挂须显式迁移事件（批一未实现）`,
        }
      }
      // 空→值：UPDATE + 审计事件同事务落账（失败整体回滚，不留半写）。
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('UPDATE tasks SET outcome_id = ? WHERE id = ?').run(outcomeId, taskId)
        db.prepare(
          'INSERT INTO task_events (task_id, kind, payload, created_at) VALUES (?, ?, ?, ?)',
        ).run(
          taskId,
          'outcome_bound',
          JSON.stringify({ outcomeId, from: null, by: 'studio:outcome-bind' }),
          Math.floor((opts.now ?? Date.now)() / 1000),
        )
        db.exec('COMMIT')
      } catch (err) {
        try { db.exec('ROLLBACK') } catch { /* 自动回滚兜底 */ }
        return {
          ok: false,
          code: 'write_failed',
          board: slug,
          dbPath,
          error: err instanceof Error ? err.message : String(err),
        }
      }
      return { ok: true, outcomeId, previousOutcomeId: null, board: slug, dbPath }
    } catch {
      // 单板异常（表缺失/库损坏等）fail-soft 试下一板；全空=task_not_found。
      continue
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }
  return { ok: false, code: 'task_not_found', error: `任务 ${taskId} 在各看板库中不存在` }
}
