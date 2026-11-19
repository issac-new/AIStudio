// custom/server/outcome/kanban-resolution.ts
// 看板↔outcome 反查读层与派发结果门（spec 2026-11-19-ai-native-operating-model-design.md
// §3.3.2「column.dispatch 由 taskId 在服务端反查 outcome、合同版本和身份，生成批一
// 最小决策快照」＋§4.4；AI 原生组织运行模型批一 Task 10）。
//
// 职责三件：
//   1) 读层：outcomeOfTask（tasks.outcome_id→getContract 绑定快道＋findByRootTask
//      台账兜底）、tasksByOutcome（同 outcome 全部关联任务）、rootTaskSummary——
//      只读连接（kanban-task-fast 同款 readOnly 打开），跨板枚举走 kanban-layout
//      单一事实源（kanban-bind 同口径 skipUnderscored，业务枚举跳 `_` 归档目录）。
//   2) 控制器注入面真实现：tasksTerminalOf / verifyRootTask（Task 7 预留注入点的正身，
//      取代 outcome-controller 缺省的 fail-closed 桩）。
//   3) 派发门 resolveDispatchOutcome：cancelled/settled 拒（REST 422
//      outcome_not_active）；active/draft/observing 生成最小快照并幂等补绑定
//      （关键源失败 422 outcome_context_unavailable，spec §4.4「关键源失败禁止派单」）。
//
// 边界纪律：
// - 读侧 fail-soft：库不可开/表缺失/坏行→null/[]＋console.warn 原因可查（不猜数）；
// - 门侧 fail-closed：终态合同拒派、快照关键源（合同/任务/身份/政策）缺失或落账
//   失败拒派——快照是派单授权语境正身，落不了账即语境不可用；
// - 绑定兜底（防御「合同激活后未绑定」窗口）：outcomeOfTask 绑定快道落空（未绑定/
//   绑定指向失联合同）时按 rootTaskId 扫台账反查，命中即守卫生效并由派发门幂等
//   补绑定（bindOutcomeToTask 三态契约：同值幂等零写入）——守卫不因绑定缺口失明。
import { createRequire } from 'node:module'
import { hermesHome } from '../lib/paths'
import { allBoardDbsOf } from '../services/hermes/kanban-layout'
import { bindOutcomeToTask } from './kanban-bind'
import { findByRootTask, getContract, appendSnapshot } from './outcome-store'
import { DEFAULT_DECISION_POLICY_VERSION, buildMinimalSnapshot } from './snapshot'
import type { SnapshotPersonRow, SnapshotTaskSummary } from './snapshot'
import { listPeople } from '../agentidentity/people'
import type { OutcomeContract } from './types'

// 双运行时取 node:sqlite：服务端 ts-node（CJS）与 vitest（ESM）都走 createRequire
// 解内置模块（kanban-bind/kanban-task-fast 同款）；解不出=读通道关闭（fail-soft）。
const nodeRequire: NodeRequire | null = (() => {
  try { return createRequire('/index.js') } catch { return null }
})()

type Stmt = { get: (...p: unknown[]) => unknown; all: (...p: unknown[]) => unknown[] }
type Db = { prepare: (sql: string) => Stmt; close: () => void }

/** 只读连接（kanban-task-fast 同款）：guardrail 武装板的写闸对只读面无感。 */
function openReadonly(dbPath: string): Db | null {
  if (!nodeRequire) return null
  try {
    const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string, o: { readOnly: boolean }) => Db }
    return new DatabaseSync(dbPath, { readOnly: true })
  } catch {
    return null
  }
}

const describeErr = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

export interface KanbanResolutionOptions {
  /** 覆写 hermes home（测试注入；缺省 lib/paths hermesHome，含 HERMES_HOME env）。 */
  home?: string
}

const homeOf = (opts: KanbanResolutionOptions): string => opts.home ?? hermesHome()

/** 读出面把 '' 归一为 null（kanban-bind 同口径：空串语义=未挂靠）。 */
function normalize(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

// ---------- 读层 ----------

/** 跨板只读查 tasks.outcome_id：任务行命中返回其绑定（'' 归一 null）；
 *  任务不在该板继续试下一板；库/读失败 warn 后继续（fail-soft）。 */
function readOutcomeBinding(taskId: string, home: string): string | null {
  for (const { slug, dbPath } of allBoardDbsOf(home, { skipUnderscored: true })) {
    let db: Db | null = null
    try {
      db = openReadonly(dbPath)
      if (!db) return null // node:sqlite 不可用：读通道整体关闭
      const row = db.prepare('SELECT outcome_id FROM tasks WHERE id = ?').get(taskId) as
        | { outcome_id?: unknown }
        | undefined
      if (row) return normalize(row.outcome_id)
    } catch (err) {
      console.warn(`[kanban-resolution] 读板 ${slug} 失败（fail-soft 试下一板）：${describeErr(err)}`)
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }
  return null
}

/**
 * 按 taskId 反查生效合同：绑定快道（tasks.outcome_id→getContract）优先；
 * 落空（未绑定/绑定指向失联合同）时按 rootTaskId 扫台账兜底——「合同激活后
 * 未绑定」窗口内守卫不失明（派发门命中后会幂等补绑定）。无合同返回 null。
 */
export function outcomeOfTask(taskId: string, opts: KanbanResolutionOptions = {}): OutcomeContract | null {
  if (!nonEmpty(taskId)) return null
  const id = taskId.trim()
  const bound = readOutcomeBinding(id, homeOf(opts))
  if (bound) {
    const c = getContract(bound)
    if (c) return c
    console.warn(`[kanban-resolution] 任务 ${id} 绑定 ${bound} 但合同不可读（坏档已隔离/失联），转台账兜底`)
  }
  const byRoot = findByRootTask(id)
  if (byRoot) {
    if (byRoot.outcomeId !== bound) {
      console.warn(
        `[kanban-resolution] 任务 ${id} 绑定面（${bound ?? '空'}）与台账根合同 ${byRoot.outcomeId} 不一致——按台账守卫生效，派发门将幂等补绑定`,
      )
    }
    return byRoot
  }
  return null
}

/** 同 outcome 的全部关联看板任务（跨板聚合、id 排序确定性）；未知 outcome/无库 → []。 */
export interface TaskOutcomeRef {
  id: string
  status: string
}

export function tasksByOutcome(outcomeId: string, opts: KanbanResolutionOptions = {}): TaskOutcomeRef[] {
  if (!nonEmpty(outcomeId)) return []
  const rows: TaskOutcomeRef[] = []
  for (const { slug, dbPath } of allBoardDbsOf(homeOf(opts), { skipUnderscored: true })) {
    let db: Db | null = null
    try {
      db = openReadonly(dbPath)
      if (!db) break // node:sqlite 不可用：读通道整体关闭
      const found = db.prepare('SELECT id, status FROM tasks WHERE outcome_id = ?').all(outcomeId) as Array<{
        id?: unknown
        status?: unknown
      }>
      for (const r of found) {
        if (nonEmpty(r.id)) {
          rows.push({ id: r.id, status: typeof r.status === 'string' ? r.status : '' })
        }
      }
    } catch (err) {
      console.warn(`[kanban-resolution] 读板 ${slug} 失败（fail-soft 试下一板）：${describeErr(err)}`)
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }
  return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** 根任务摘要（snapshot resolve.task 契约面）：id/title/status 只读投影；查无 null。 */
export function rootTaskSummary(taskId: string, opts: KanbanResolutionOptions = {}): SnapshotTaskSummary | null {
  if (!nonEmpty(taskId)) return null
  const id = taskId.trim()
  for (const { slug, dbPath } of allBoardDbsOf(homeOf(opts), { skipUnderscored: true })) {
    let db: Db | null = null
    try {
      db = openReadonly(dbPath)
      if (!db) return null
      const row = db.prepare('SELECT id, title, status FROM tasks WHERE id = ?').get(id) as
        | { id?: unknown; title?: unknown; status?: unknown }
        | undefined
      if (row) {
        return {
          id: String(row.id ?? id),
          title: typeof row.title === 'string' ? row.title : '',
          status: typeof row.status === 'string' ? row.status : '',
        }
      }
    } catch (err) {
      console.warn(`[kanban-resolution] 读板 ${slug} 失败（fail-soft 试下一板）：${describeErr(err)}`)
    } finally {
      try { db?.close() } catch { /* noop */ }
    }
  }
  return null
}

// ---------- 控制器注入面正身（Task 7 注入点接真实现） ----------

/** 任务终态词表：done/archived 为 kernel DEFAULT_STATUSES 终列，cancelled 承接
 *  任务简报逐字（子卡被取消形态）；集合外状态（running/blocked/review/…）一律
 *  非终态。 */
const TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set(['done', 'archived', 'cancelled'])

/**
 * observing 迁移守卫正身（spec §3.2）：根任务及全部同 outcome 子任务全部终态才 true。
 * 空集 fail-closed false——零关联任务=绑定面不可证明（激活应至少绑定根卡），
 * 不借空集放行 observing（transitionGuards 缺省 fail-closed 同哲学）。
 */
export function tasksTerminalOf(outcomeId: string, opts: KanbanResolutionOptions = {}): boolean {
  const tasks = tasksByOutcome(outcomeId, opts)
  if (tasks.length === 0) return false
  return tasks.every((t) => TERMINAL_TASK_STATUSES.has(t.status))
}

/**
 * 根任务归属证明（spec §4.6）：存在→{ok:true}；板库可枚举但查无→{ok:false}
 * （可证明不属于当前部署，控制器永不放行）；无任何板库→null（不可证明，
 * 控制器默认 422 ownership_unavailable、env 显式放行试点）。
 */
export function verifyRootTask(rootTaskId: string, opts: KanbanResolutionOptions = {}): { ok: boolean } | null {
  if (!nonEmpty(rootTaskId)) return { ok: false }
  const boards = allBoardDbsOf(homeOf(opts), { skipUnderscored: true })
  if (boards.length === 0) return null
  return rootTaskSummary(rootTaskId, opts) !== null ? { ok: true } : { ok: false }
}

/** 身份册快照行（snapshot resolve.people 契约）：裁掉 emails 等非快照面。
 *  名册损坏上抛由 buildMinimalSnapshot 的解析吞包转 ok:false（身份关键源失败）。 */
export function snapshotPeopleRows(ids: string[]): SnapshotPersonRow[] {
  const want = new Set(ids)
  return listPeople().filter((p) => want.has(p.id)).map((p) => ({ id: p.id, name: p.name, active: p.active }))
}

// ---------- 派发门（column.dispatch 接线面） ----------

/** 门错误码（REST 422）：outcome_not_active=终态合同拒派；
 *  outcome_context_unavailable=快照关键源失败/落账失败拒派。 */
export type OutcomeDispatchErrorCode = 'outcome_not_active' | 'outcome_context_unavailable'

/** 结果解析门载体（DispatchReadinessError 同形态：REST 侧按 name+code 映射 422）。 */
export class OutcomeDispatchError extends Error {
  constructor(
    public readonly code: OutcomeDispatchErrorCode,
    message: string,
    public readonly problems: string[] = [],
  ) {
    super(message)
    this.name = 'OutcomeDispatchError'
  }
}

/** 派发结果三元组（ColumnDispatchResult.outcome 透出面）。 */
export interface DispatchOutcomeContext {
  outcomeId: string
  contractVersion: number
  snapshotId: string
}

/** 快照落账 actor（服务端通道标识；pending-controller actorOf 同命名空间惯例）。 */
export const DISPATCH_OUTCOME_ACTOR = 'studio:column-dispatch'

/**
 * 派发结果门（任务简报逐字）：taskId 反查 outcome——
 *   无合同 → null（dispatch 原行为）；
 *   cancelled/settled → 抛 OutcomeDispatchError('outcome_not_active')；
 *   active/draft/observing → 生成最小快照（Task 6；people 经 agentidentity 名册、
 *     任务摘要经同库只读、政策版本=决策矩阵内容摘要常量）＋appendSnapshot 落账
 *     ＋bindOutcomeToTask 幂等补绑定（防御激活后未绑定窗口），返回三元组。
 * 快照构建关键源失败或落账失败 → 抛 OutcomeDispatchError('outcome_context_unavailable')；
 * 补绑定失败 fail-soft warn 不阻断派发——守卫经 findByRootTask 兜底不失明，
 * 绑定可由下次派发/激活侧重试修复。
 */
export function resolveDispatchOutcome(
  taskId: string,
  opts: KanbanResolutionOptions = {},
): DispatchOutcomeContext | null {
  const contract = outcomeOfTask(taskId, opts)
  if (!contract) return null
  if (contract.status === 'cancelled' || contract.status === 'settled') {
    throw new OutcomeDispatchError(
      'outcome_not_active',
      `任务 ${taskId} 挂靠的结果合同 ${contract.outcomeId} 已${contract.status === 'cancelled' ? '取消' : '结算'}（终态），不得派单`,
      [`outcome ${contract.outcomeId} status=${contract.status}（终态合同禁派，spec §3.3.2）`],
    )
  }
  const summary = rootTaskSummary(taskId, opts)
  const built = buildMinimalSnapshot({
    contract,
    decisionPolicyVersion: DEFAULT_DECISION_POLICY_VERSION,
    resolve: {
      task: () => (summary ? { ok: true, task: summary } : { ok: false }),
      people: (ids: string[]) => ({ ok: true, people: snapshotPeopleRows(ids) }),
    },
  })
  if (!built.ok) {
    throw new OutcomeDispatchError(
      'outcome_context_unavailable',
      `任务 ${taskId} 的派单上下文关键源失败（合同 ${contract.outcomeId}），禁止派单`,
      built.problems,
    )
  }
  const appended = appendSnapshot(built.snapshot, DISPATCH_OUTCOME_ACTOR)
  if (!appended.ok || !appended.snapshot) {
    throw new OutcomeDispatchError(
      'outcome_context_unavailable',
      `任务 ${taskId} 的派单快照落账失败（合同 ${contract.outcomeId}）：${appended.code ?? 'write_failed'}`,
      [`appendSnapshot code=${appended.code ?? 'write_failed'}（快照是派单授权语境正身，落不了账=语境不可用）`],
    )
  }
  const bound = bindOutcomeToTask(taskId.trim(), contract.outcomeId, opts.home ? { home: opts.home } : {})
  if (!bound.ok) {
    console.warn(
      `[kanban-resolution] 补绑定失败（不阻断派发，守卫经台账兜底不失明）：${bound.code ?? ''} ${bound.error ?? ''}`,
    )
  }
  return {
    outcomeId: contract.outcomeId,
    contractVersion: contract.version,
    snapshotId: appended.snapshot.snapshotId,
  }
}
