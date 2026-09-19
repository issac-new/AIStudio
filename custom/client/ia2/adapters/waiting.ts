// overlay/custom/client/ia2/adapters/waiting.ts
// v12 等我队列纯聚合（2026-09-19 统一视图）：三源——review 任务（验收/打回）、
// awaiting-input 运行（确认恢复）、fleet 审批（确认/拒绝）。右栏「等我」与壳层
// 注意力条同源（单一聚合，两处消费）。排序：task-review > run-approval >
// fleet-approval，同权按时间倒序。
import type { RunSummary } from '@/custom/loop/runcenter/types'
import type { FleetSession } from '@/custom/cockpit/adapters/fleet-adapter'

export type WaitKind = 'task-review' | 'run-approval' | 'fleet-approval'

export interface WaitItem {
  kind: WaitKind
  /** 去重 id：task:<id> / run:<runId> / fleet:<sessionId>:<approvalId> */
  id: string
  /** 主标题（数据，非 i18n：任务标题/运行号/会话标题） */
  title: string
  /** 副文 i18n key（视图渲染） */
  subKey: string
  ts: number
  taskId?: string
  runId?: string
  interruptId?: string
  sessionId?: string
  approvalId?: string
}

export interface WaitTaskSource {
  id: string
  title: string
  status: string
  assignee: string | null
  createdAt: number
}

const KIND_WEIGHT: Record<WaitKind, number> = {
  'task-review': 0,
  'run-approval': 1,
  'fleet-approval': 2,
}

/** lastActivityAt 可能是 ISO 串或已 ms 数（store 侧两种来源都有），归一为 ms */
function tsMs(ts: string | number | null): number {
  if (ts == null) return 0
  if (typeof ts === 'number') return ts
  const parsed = Date.parse(ts)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function buildWaiting(
  tasks: readonly WaitTaskSource[],
  runs: readonly RunSummary[],
  fleetSessions: readonly FleetSession[],
  _now: number,
): WaitItem[] {
  const out: WaitItem[] = []
  for (const t of tasks) {
    if (t.status !== 'review') continue
    out.push({
      kind: 'task-review',
      id: `task:${t.id}`,
      title: t.title,
      subKey: 'ia2.wait.subReview',
      ts: t.createdAt,
      taskId: t.id,
    })
  }
  for (const r of runs) {
    if (r.status !== 'awaiting-input' || !r.pendingInterruptId) continue
    out.push({
      kind: 'run-approval',
      id: `run:${r.runId}`,
      title: r.runId,
      subKey: 'ia2.wait.subRun',
      ts: tsMs(r.lastActivityAt),
      runId: r.runId,
      interruptId: r.pendingInterruptId,
    })
  }
  for (const s of fleetSessions) {
    for (const ap of s.approvals ?? []) {
      out.push({
        kind: 'fleet-approval',
        id: `fleet:${s.id}:${ap.approval_id}`,
        title: s.title,
        subKey: 'ia2.wait.subFleet',
        ts: s.lastActiveAt,
        sessionId: s.id,
        approvalId: ap.approval_id,
      })
    }
  }
  return out.sort((a, b) => KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind] || b.ts - a.ts)
}
