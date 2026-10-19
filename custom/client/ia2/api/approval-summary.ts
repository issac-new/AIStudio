// overlay/custom/client/ia2/api/approval-summary.ts
// 审批域统一计数契约（spec 2026-10-19-studio-p2 §2.3）：approvals 计数面来自
// 服务端单端点 /api/approvals/pending-summary；orgloop 介入点/清偿计数在客户端
// 并入同一类型——所有计数面（概览、④审批、收件箱）从此一处取数，口径不再漂移。
import { fetchPendingSummary, type PendingSummary } from '@/custom/cockpit/api/approvals'
import { fetchInterventionsPending, fetchClearanceLedger } from './gatekeeper'

export interface ApprovalSummary {
  /** approvals 域（命令+评审+执法门） */
  approvals: PendingSummary | null
  /** orgloop：等人决定的介入点数（源缺席记 null，不猜） */
  interventions: number | null
  /** orgloop：清偿门未清项数（源缺席记 null） */
  clearance: number | null
  /** 供展示的合计：仅 approvals.total + 两域已知值（缺席域不计入也不冒充 0 参与合算） */
  knownTotal: number | null
}

export async function fetchApprovalSummary(): Promise<ApprovalSummary> {
  const [approvalsRes, interventionsRes, clearanceRes] = await Promise.allSettled([
    fetchPendingSummary(),
    fetchInterventionsPending(),
    fetchClearanceLedger(),
  ])
  const approvals = approvalsRes.status === 'fulfilled' ? approvalsRes.value : null
  const interventions = interventionsRes.status === 'fulfilled'
    ? interventionsRes.value.points.filter(p => p.pending === true).length
    : null
  const clearance = clearanceRes.status === 'fulfilled' ? (clearanceRes.value.open ?? 0) : null
  const parts = [approvals?.total ?? null, interventions, clearance]
  const knownTotal = parts.every(p => p === null)
    ? null
    : parts.reduce<number>((acc, p) => acc + (p ?? 0), 0)
  return { approvals, interventions, clearance, knownTotal }
}
