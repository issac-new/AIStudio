// overlay/custom/client/matrix-teams/stats.ts
// M-F 统计与催办投影：全部从事件流计算，不落第二份聚合状态（spec v1.2 §10 纪律）。
// 口径对照表：docs/superpowers/specs/2026-09-20-stats-metrics.md（每指标一行：定义+事件源+计算式）。
import type { AssignContent, ReceiptContent, AgentDescriptor } from './protocol'
import { cardStatus } from './task-card'
import { isLoadOccupying } from './agent-router'

export interface TaskCardView {
  assign: AssignContent
  receipt: ReceiptContent | null
}

/** 卡片视图装配：assign/receipt 各按 taskId 取最新（时间最大，同刻取后到）。 */
export function assembleCards(assigns: readonly AssignContent[], receipts: readonly ReceiptContent[]): TaskCardView[] {
  const latestAssign = new Map<string, AssignContent>()
  for (const a of assigns) {
    const prev = latestAssign.get(a.taskId)
    if (!prev || a.issuedAt >= prev.issuedAt) latestAssign.set(a.taskId, a)
  }
  const latestReceipt = new Map<string, ReceiptContent>()
  for (const r of receipts) {
    const prev = latestReceipt.get(r.taskId)
    if (!prev || r.reportedAt >= prev.reportedAt) latestReceipt.set(r.taskId, r)
  }
  return [...latestAssign.values()].map(assign => ({ assign, receipt: latestReceipt.get(assign.taskId) ?? null }))
}

export interface StatsProjection {
  /** 总览 */
  total: number
  byStatus: Record<string, number>
  blocked: number
  overdue: ReminderItem[]
  /** 按项目（assign 无 projectId 字段——按 parentId 前缀归属案例，案例属项目由 case 事件定；v1 以「案例」为项目代理口径） */
  byCase: Array<{ caseId: string; total: number; done: number }>
  /** 按阶段（phase P1..P6，未声明归 '—'） */
  byPhase: Array<{ phase: string; total: number; done: number }>
  /** 按负责人（target.account） */
  byAssignee: Array<{ account: string; open: number; blocked: number; done: number }>
  /** 按 Agent（capability 命中的执行体；负载=在途占用，口径同 agent-router） */
  byAgent: Array<{ agentId: string; running: number; capabilities: string[] }>
}

export interface ReminderItem {
  taskId: string
  title: string
  dueAt: number
  assignee: string
  status: string
}

/** 逾期催办清单（正例=未完成且 dueAt<now；负例=已 done 或未到期）。 */
export function dueReminders(cards: readonly TaskCardView[], now: number = Date.now()): ReminderItem[] {
  return cards
    .filter(c => {
      if (!c.assign.dueAt) return false
      if (c.assign.dueAt >= now) return false
      return cardStatus(c.assign, c.receipt) !== 'done'
    })
    .map(c => ({
      taskId: c.assign.taskId,
      title: c.assign.title,
      dueAt: c.assign.dueAt!,
      assignee: c.assign.target.account,
      status: cardStatus(c.assign, c.receipt),
    }))
    .sort((a, b) => a.dueAt - b.dueAt)
}

export function projectStats(
  cards: readonly TaskCardView[],
  agents: readonly AgentDescriptor[] = [],
  now: number = Date.now(),
): StatsProjection {
  const byStatus: Record<string, number> = {}
  const caseMap = new Map<string, { total: number; done: number }>()
  const phaseMap = new Map<string, { total: number; done: number }>()
  const assigneeMap = new Map<string, { open: number; blocked: number; done: number }>()
  for (const c of cards) {
    const s = cardStatus(c.assign, c.receipt)
    byStatus[s] = (byStatus[s] ?? 0) + 1
    const caseId = c.assign.parentId ?? '（独立）'
    const cs = caseMap.get(caseId) ?? { total: 0, done: 0 }
    cs.total++; if (s === 'done') cs.done++
    caseMap.set(caseId, cs)
    const phase = c.assign.phase ?? '—'
    const ps = phaseMap.get(phase) ?? { total: 0, done: 0 }
    ps.total++; if (s === 'done') ps.done++
    phaseMap.set(phase, ps)
    const acct = c.assign.target.account
    const as = assigneeMap.get(acct) ?? { open: 0, blocked: 0, done: 0 }
    if (s === 'done') as.done++
    else if (s === 'blocked') { as.blocked++; as.open++ }
    else as.open++
    assigneeMap.set(acct, as)
  }
  // Agent 负载：capability 标签反查（标签命中多 agent 时按注册序均摊不可考——口径表注明：以标签聚合，标签即团队粒度）
  const capCount = new Map<string, number>()
  for (const c of cards) {
    if (!c.receipt || !isLoadOccupying(c.receipt.status)) continue
    for (const cap of c.assign.capability ?? []) capCount.set(cap, (capCount.get(cap) ?? 0) + 1)
  }
  const byAgent = agents.map(a => ({
    agentId: a.agentId,
    running: a.capabilities.reduce((n, cap) => n + (capCount.get(cap) ?? 0), 0),
    capabilities: [...a.capabilities],
  }))
  return {
    total: cards.length,
    byStatus,
    blocked: byStatus.blocked ?? 0,
    overdue: dueReminders(cards, now),
    byCase: [...caseMap.entries()].map(([caseId, v]) => ({ caseId, ...v })).sort((x, y) => y.total - x.total),
    byPhase: [...phaseMap.entries()].map(([phase, v]) => ({ phase, ...v })).sort((x, y) => x.phase.localeCompare(y.phase)),
    byAssignee: [...assigneeMap.entries()].map(([account, v]) => ({ account, ...v })).sort((x, y) => y.open - x.open),
    byAgent,
  }
}
