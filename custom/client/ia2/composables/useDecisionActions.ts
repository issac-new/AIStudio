// overlay/custom/client/ia2/composables/useDecisionActions.ts
// v12.3 决策动作单一实现（自 WorkbenchView.vue 抽出，四处消费：工作台右栏/
// 态势面板/通知下拉/会话工作台）。纪律与原实现一致：
//   - 板定位用任务自身 boardSlug（跨板聚合行来源板），不走看板页 selectedBoard
//   - review 态打回＝reopen-review 回 ready（CLI 无 review→blocked 转移）
//   - 动作成功后刷新跨板聚合（workspace.refreshAllBoards(true)）
import { useI18n } from 'vue-i18n'
import * as kanbanApi from '@/api/hermes/kanban'
import { useWorkspaceStore } from '../store/workspace'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import type { WaitItem } from '../adapters/waiting'

export function useDecisionActions() {
  const { t } = useI18n()
  const workspace = useWorkspaceStore()
  const runsStore = useRunCenterStore()
  const cockpit = useCockpitStore()

  function boardOf(taskId: string): string | undefined {
    return workspace.tasks.find(x => x.id === taskId)?.boardSlug || undefined
  }

  /** 验收：review → done */
  function approveTask(taskId: string): void {
    void kanbanApi.completeTasks([taskId], undefined, { board: boardOf(taskId) }).then(() => {
      void workspace.refreshAllBoards(true)
    })
  }

  /** 打回：review → ready 重做；其余开放态 → blocked */
  function rejectTask(taskId: string): void {
    const task = workspace.tasks.find(x => x.id === taskId)
    if (task?.status === 'review') {
      void kanbanApi.reopenReview([taskId], t('ia2.tdp.rejectReason'), { board: boardOf(taskId) }).then(() => {
        void workspace.refreshAllBoards(true)
      })
      return
    }
    void kanbanApi.blockTask(taskId, t('ia2.tdp.rejectReason'), { board: boardOf(taskId) }).then(() => {
      void workspace.refreshAllBoards(true)
    })
  }

  /** 恢复中断运行（awaiting-input → 继续）；v12.4 起接受 DecisionRow（结构子集） */
  function approveRun(item: Pick<WaitItem, 'runId'>): void {
    if (item.runId) void runsStore.resumeRun(item.runId, true)
  }

  /** R6 补充：拒绝中断运行（awaiting-input → 打回）。
   *  resume value=false 经 graph-rest 归一为 { decision:'rejected' }（与
   *  approve 的 true→approved 同款闭环），非仅「继续/确认」单按钮。 */
  function rejectRun(item: Pick<WaitItem, 'runId'>): void {
    if (item.runId) void runsStore.resumeRun(item.runId, false)
  }

  /** fleet 审批（跨 profile 会话的就地批准）；v12.4 起接受 DecisionRow（结构子集） */
  function approveFleet(item: Pick<WaitItem, 'sessionId' | 'approvalId'>): void {
    if (item.sessionId && item.approvalId) {
      void cockpit.respondFleetApproval(item.sessionId, item.approvalId, 'once')
    }
  }

  /** R6 补充：fleet 审批拒绝（deny 档位，非仅批准） */
  function rejectFleet(item: Pick<WaitItem, 'sessionId' | 'approvalId'>): void {
    if (item.sessionId && item.approvalId) {
      void cockpit.respondFleetApproval(item.sessionId, item.approvalId, 'deny')
    }
  }

  return { boardOf, approveTask, rejectTask, approveRun, rejectRun, approveFleet, rejectFleet }
}
