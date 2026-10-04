// overlay/custom/server/harness/gov-metrics.ts
// 五治理指标采集（P6b，2026-10-04 九源轮）。口径单一事实源=eval-layers 的
// GOVERNANCE_METRIC_DEFINITIONS；本模块负责"从既有账本能算的算出来"。
//
// 可算（instrumented）：
//   - routeViolationRate  代理口径：edge.guard-exceeded + node.error-routed / (node.completed + 上述)
//     （事件日志无"总边选择"计数，用 node.completed 作分母代理——每次节点完成隐含其后边选择）
//   - recoverySuccessRate 代理口径：含 interrupt.raised 的 run 中，终态为 run.completed 的占比
//     （"恢复"= 有中断经历的 run；终态取该 run 最后一个 run.completed/run.failed）
//   - humanTakeoverRate   代理口径：审批台账 human 决策 / (human + auto_pass)（窗口内）
//     （源文口径分母是"进入不可判定或高风险状态的运行数"，审批台账不含该分母——代理如实标注）
// 仍 gap（采集点不存在，不造数）：
//   - duplicateSideEffectRate：append 端 eid 去重不落"拒绝账"（graph_events 无 rejected 记录）
//   - budgetStopAccuracy：BudgetGuard 停止未发图事件（handleBudgetExceed 无 eventLog 写入）
import { existsSync } from 'fs'
import { homedir } from 'os'
import { delimiter as pathDelimiter, join } from 'path'
import { queryApprovalLog } from '../approvals/approval-log'
import { resolveLoopBaseDir } from '../loop/paths'

// node:sqlite 与 run-undo/change-governance-store 等同款惰性加载：守门环境无该
// 内建时按库降级（单库跳过），而非模块链顶层 import 直接炸掉 harness 路由装配
// （本模块经 eval-layers → harness-controller → bootstrap routes 静态可达）。
type DatabaseSyncCtor = new (path: string, options?: { open?: boolean; readOnly?: boolean }) => {
  prepare: (sql: string) => { all: () => unknown[] }
  close: () => void
}
let sqliteCtor: DatabaseSyncCtor | null | undefined
function loadSqlite(): DatabaseSyncCtor | null {
  if (sqliteCtor !== undefined) return sqliteCtor
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('node:sqlite') as { DatabaseSync: DatabaseSyncCtor }
    sqliteCtor = mod.DatabaseSync
  } catch {
    sqliteCtor = null
  }
  return sqliteCtor
}

export interface GovMetricValue {
  value: number | null
  numerator: number
  denominator: number
  note: string
}

export interface GovernanceMetrics {
  routeViolationRate: GovMetricValue
  recoverySuccessRate: GovMetricValue
  humanTakeoverRate: GovMetricValue
  duplicateSideEffectRate: { gapReason: string }
  budgetStopAccuracy: { gapReason: string }
  meta: { sources: string[] }
}

/** 事件账最小形状（graph_events 行投影）。 */
export interface EventRow { runId: string; kind: string; ts?: number }

/** 审批台账条目最小形状。 */
export interface ApprovalRow { ts: number; actor: string; decision: string }

/** 纯计算（不 IO；采集与计算分离便于测试）。 */
export function computeGovernanceMetrics(events: EventRow[], approvals: ApprovalRow[], windowMs: number): GovernanceMetrics {
  const since = Date.now() - windowMs
  const ev = events.filter((e) => (e.ts ?? Infinity) >= since || e.ts === undefined)

  // 路由违约率（代理分母=node.completed）
  const guardExceeded = ev.filter((e) => e.kind === 'edge.guard-exceeded').length
  const errorRouted = ev.filter((e) => e.kind === 'node.error-routed').length
  const nodeCompleted = ev.filter((e) => e.kind === 'node.completed').length
  const violations = guardExceeded + errorRouted
  const routeDen = violations + nodeCompleted
  const routeViolationRate: GovMetricValue = {
    value: routeDen > 0 ? violations / routeDen : null,
    numerator: violations,
    denominator: routeDen,
    note: routeDen > 0
      ? `违约=${violations}（guard-exceeded ${guardExceeded} + error-routed ${errorRouted}）；分母代理=node.completed ${nodeCompleted}`
      : '窗口内无图运行事件（分母为 0，不造数）',
  }

  // 恢复成功率（含中断 run 的终态达成率）
  const runs = new Map<string, string>()
  for (const e of ev) {
    if (e.kind === 'run.completed' || e.kind === 'run.failed') runs.set(e.runId, e.kind)
  }
  const interruptedRunIds = new Set(ev.filter((e) => e.kind === 'interrupt.raised').map((e) => e.runId))
  let recovered = 0
  let terminal = 0
  for (const rid of interruptedRunIds) {
    const terminalKind = runs.get(rid)
    if (!terminalKind) continue // 中断后未到终态（在途），不计入分母
    terminal += 1
    if (terminalKind === 'run.completed') recovered += 1
  }
  const recoverySuccessRate: GovMetricValue = {
    value: terminal > 0 ? recovered / terminal : null,
    numerator: recovered,
    denominator: terminal,
    note: terminal > 0
      ? `含中断 run ${interruptedRunIds.size} 个，其中已达终态 ${terminal} 个、终态为 completed ${recovered} 个；在途 run 不计分母`
      : '窗口内无"中断后达终态"的 run（分母为 0，不造数）',
  }

  // 人工接管率（审批台账代理）
  const windowApprovals = approvals.filter((a) => a.ts >= since)
  const auto = windowApprovals.filter((a) => a.decision === 'auto_pass').length
  const human = windowApprovals.filter((a) => a.decision !== 'auto_pass').length
  const total = auto + human
  const humanTakeoverRate: GovMetricValue = {
    value: total > 0 ? human / total : null,
    numerator: human,
    denominator: total,
    note: total > 0
      ? `human 决策 ${human} / 全部放行面 ${total}（auto_pass ${auto}）；源文分母=「不可判定/高风险状态运行数」，台账无此口径——代理偏差如实标注`
      : '窗口内审批台账为空（分母为 0，不造数）',
  }

  return {
    routeViolationRate,
    recoverySuccessRate,
    humanTakeoverRate,
    duplicateSideEffectRate: { gapReason: 'append 端 eid 去重不落拒绝账（graph_events 无 rejected 记录）；需 loop 事件层加账后接入' },
    budgetStopAccuracy: { gapReason: 'BudgetGuard 停止未发图事件（handleBudgetExceed 无 eventLog 写入）；需补 budget.stop 事件后接入' },
    meta: {
      sources: [
        'loop/graph graph-events.db（主树 loopBase + GOV_METRICS_EXTRA_DBS）',
        'approvals/approval-log（human vs auto_pass）',
      ],
    },
  }
}

/** 采集（fail-soft）：主 loopBase + 环境变量补充库（sim 树等），逐库只读聚合。 */
export function collectGovernanceMetrics(days = 7): GovernanceMetrics {
  const windowMs = days * 86400000
  const dbs: string[] = [join(resolveLoopBaseDir(), 'graph-events.db')]
  // 跨平台（24h 审查补）：Windows 绝对路径含 ':'，按 ':' 切会把 C:\ 盘符切碎、
  // 补充库静默全灭——用 path.delimiter（POSIX ':' / Windows ';'，与 terminal-tools 同口径）
  const extra = process.env.GOV_METRICS_EXTRA_DBS?.split(pathDelimiter).map((s) => s.trim()).filter(Boolean) ?? []
  dbs.push(...extra)

  const Sqlite = loadSqlite()
  const events: EventRow[] = []
  for (const dbPath of dbs) {
    if (!Sqlite || !existsSync(dbPath)) continue
    let db: InstanceType<DatabaseSyncCtor> | null = null
    try {
      db = new Sqlite(dbPath, { open: true, readOnly: true })
      const rows = db.prepare('SELECT run_id, kind, ts FROM graph_events').all() as unknown as Array<{ run_id: string; kind: string; ts: number }>
      for (const r of rows) events.push({ runId: r.run_id, kind: r.kind, ts: r.ts })
    } catch { /* 单库失败跳过（诚实降级） */ }
    finally { try { db?.close() } catch { /* 已关 */ } }
  }

  let approvals: ApprovalRow[] = []
  try {
    approvals = queryApprovalLog(500).map((e) => ({ ts: e.ts, actor: e.actor, decision: e.decision }))
  } catch { /* 台账缺席按空处理 */ }

  return computeGovernanceMetrics(events, approvals, windowMs)
}
