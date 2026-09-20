// overlay/custom/client/ia2/composables/useDecisionRows.ts
// v12.3 待决策行单一聚合（2026-09-20 用户裁定：铃铛徽章 = 待决策未读数）。
// 来源两路：buildWaiting 三源（review 任务/中断运行/fleet 审批）+ 评审中心
// pendingReviews（delivery R/G 门）。行形状与已读判定（notify-read kv）在此
// 唯一定义，消费方：页头铃铛徽章（IaShellHeader）与通知下拉（NotifyDropdownPanel）。
import { computed } from 'vue'
import { useReviewCenterStore } from '@/custom/matrix-teams/stores/review-center'
import { useNotifyReadStore } from '../store/notify-read'
import { useSitCounts } from './useSitCounts'
import type { WaitItem } from '../adapters/waiting'

/** 待决策行统一形状（waiting 三源 + 评审门） */
export interface DecisionRow {
  id: string
  kind: WaitItem['kind'] | 'gate-review'
  title: string
  subKey: string
  ts: number
  taskId?: string
  runId?: string
  sessionId?: string
  approvalId?: string
}

export function useDecisionRows() {
  const reviewCenter = useReviewCenterStore()
  const read = useNotifyReadStore()
  const { waitItems } = useSitCounts()

  /** 评审门条目（去重 id：gate:caseId:gate） */
  const gateRows = computed(() => reviewCenter.pendingReviews.map(g => ({
    id: `gate:${g.caseId}:${g.gate}`,
    caseId: g.caseId,
    gate: g.gate,
    title: `${g.caseId} · ${g.gate}`,
    ts: Math.max(...g.signoffs.map(s => s.at), g.at ?? 0, 0),
  })))

  const decisionRows = computed<DecisionRow[]>(() => {
    const rows: DecisionRow[] = waitItems.value.map(w => ({
      id: w.id, kind: w.kind, title: w.title, subKey: w.subKey, ts: w.ts,
      taskId: w.taskId, runId: w.runId, sessionId: w.sessionId, approvalId: w.approvalId,
    }))
    for (const g of gateRows.value) {
      rows.push({ id: g.id, kind: 'gate-review', title: g.title, subKey: 'ia2.notify.subGate', ts: g.ts })
    }
    return rows.sort((a, b) => b.ts - a.ts)
  })

  const decisionIds = computed(() => decisionRows.value.map(r => r.id))
  const decisionUnread = computed(() => read.unreadCount(decisionIds.value))

  return { decisionRows, decisionIds, decisionUnread, gateRows }
}
