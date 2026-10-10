// overlay/custom/server/governance/capacity-analytics.ts
// 容量分析（2026-10-10 麦肯锡概念三轮「容量而非人数」）：按执行者聚合人日视图——
// 估算人日（estimate_days，任务拆解链路写入）/实际人日（started→completed 时长）/
// Agent 承接比例/估算覆盖率。口径诚实项：
//   - 估算仅 decompose 链路写入——覆盖率如实输出，未估算不折算不外推；
//   - 人/Agent 判定用 -agent 后缀约定（与服务端其余面同口径，非权威 roster）；
//   - 实际人日 = 卡在 started→completed 之间的墙上时长（含等待，是上界口径，如实标注）。
// 数据面与 collectAssigneeStats 同源同法：node:sqlite 只读、root+boards 全库、单库失败跳过。
import { kanbanDbFiles, openReadonly } from './governance-analytics'

export type CapacityExecutor = 'human' | 'agent' | 'unassigned'

export interface CapacityRow {
  assignee: string
  executor: CapacityExecutor
  total: number
  /** 窗口内估算人日合计（未估算卡不计） */
  estimateDays: number
  /** 已完成卡（done/archived）的估算人日 */
  deliveredDays: number
  /** 已完成卡的实际人日（墙上时长，上界口径） */
  actualDays: number
  doneCount: number
  inFlightCount: number
}

export interface CapacityOverview {
  windowDays: number
  rows: CapacityRow[]
  summary: {
    totalCards: number
    withEstimate: number
    /** 估算覆盖率 = withEstimate / totalCards（诚实口径：仅任务拆解建的卡有估算） */
    coverage: number
    humanEstimateDays: number
    agentEstimateDays: number
    /** Agent 承接人日 = 已完成卡的 agent 估算人日合计（AI 释放的容量信号） */
    agentDeliveredDays: number
    actualDaysTotal: number
  }
  note: string
}

function executorOf(assignee: string | null): CapacityExecutor {
  if (!assignee) return 'unassigned'
  return assignee.endsWith('-agent') ? 'agent' : 'human'
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

interface CapTaskRow {
  assignee: string | null
  status: string
  created_at: number
  started_at: number | null
  completed_at: number | null
  estimate_days: number | null
}

export async function capacityOverview(windowDays = 30, homeDir?: string): Promise<CapacityOverview> {
  const cutoffS = Math.floor(Date.now() / 1000) - windowDays * 86400
  const byAssignee = new Map<string, CapacityRow>()
  let totalCards = 0
  let withEstimate = 0

  for (const file of kanbanDbFiles(homeDir)) {
    let db: Awaited<ReturnType<typeof openReadonly>> | null = null
    try {
      db = await openReadonly(file)
      const rows = db.prepare(
        'SELECT assignee, status, created_at, started_at, completed_at, estimate_days FROM tasks',
      ).all() as unknown as CapTaskRow[]
      for (const r of rows) {
        // 时间窗：创建或完成任一落在窗内即纳入（在途老卡也算当前容量占用）
        const inWindow = r.created_at >= cutoffS || (r.completed_at != null && r.completed_at >= cutoffS)
        if (!inWindow) continue
        const key = r.assignee?.trim() || '(未指派)'
        const row = byAssignee.get(key) ?? {
          assignee: key, executor: executorOf(r.assignee?.trim() || null),
          total: 0, estimateDays: 0, deliveredDays: 0, actualDays: 0, doneCount: 0, inFlightCount: 0,
        }
        row.total += 1
        totalCards += 1
        const est = typeof r.estimate_days === 'number' && r.estimate_days > 0 ? r.estimate_days : null
        if (est != null) { row.estimateDays += est; withEstimate += 1 }
        const finished = r.status === 'done' || r.status === 'archived'
        if (finished) {
          row.doneCount += 1
          if (est != null) row.deliveredDays += est
          if (r.started_at != null && r.completed_at != null && r.completed_at >= r.started_at) {
            row.actualDays += (r.completed_at - r.started_at) / 86400
          }
        } else {
          row.inFlightCount += 1
        }
        byAssignee.set(key, row)
      }
    } catch { /* 单库读失败跳过（诚实降级，其余库照常） */ }
    finally { try { db?.close() } catch { /* 已关 */ } }
  }

  const rows = [...byAssignee.values()]
    .map(r => ({
      ...r,
      estimateDays: round1(r.estimateDays),
      deliveredDays: round1(r.deliveredDays),
      actualDays: round1(r.actualDays),
    }))
    .sort((a, b) => b.estimateDays + b.actualDays - (a.estimateDays + a.actualDays))

  const humanEstimateDays = round1(rows.filter(r => r.executor === 'human').reduce((s, r) => s + r.estimateDays, 0))
  const agentEstimateDays = round1(rows.filter(r => r.executor === 'agent').reduce((s, r) => s + r.estimateDays, 0))
  return {
    windowDays,
    rows,
    summary: {
      totalCards,
      withEstimate,
      coverage: totalCards === 0 ? 0 : round1((withEstimate / totalCards) * 100) / 100,
      humanEstimateDays,
      agentEstimateDays,
      agentDeliveredDays: round1(rows.filter(r => r.executor === 'agent').reduce((s, r) => s + r.deliveredDays, 0)),
      actualDaysTotal: round1(rows.reduce((s, r) => s + r.actualDays, 0)),
    },
    note: '估算人日来自任务拆解（decompose）建的卡；人/Agent 按 -agent 后缀约定判定；实际人日为 started→completed 墙上时长（含等待，上界口径）。',
  }
}
