// overlay/custom/client/ia2/composables/useSideNavBadges.ts
// 侧栏待办徽标单一装配（2026-10-22 用户需求：侧边栏每项挂「审批收件箱」同款
// 待办数字，提醒用户）。口径全部复用既有聚合，零新 API、零新轮询：
//   journey   流程总览  = 需关注∪待决策（attentionRows 已含 waitItems 等我，
//                          评审门 gateRows 不在注意力面，相加即无重不漏的并集）
//   workbench 工作台    = attentionRows（阻塞任务+阻塞循环+等我+失败会话）
//   board     看板      = 受阻任务数（workspace.tasks status=blocked，与注意力条同源同口径）
//   inbox     审批收件箱= decisionRows（既有铃铛口径，自 IaSideNav 内联式迁移至此）
//   stage3    阶段③     = stageBoardStatuses(3) 命中任务数（triage/todo/scheduled/ready）
//   stage4    阶段④     = stageBoardStatuses(4) 命中任务数（running/blocked/review）
// 无待办概念的项（检索）、无看板态映射的阶段（①②⑤⑥，保留状态点）与专题四岛
// （各域待办面需逐岛接 API，本轮不做，见 spec 决策记录）不挂徽标——徽标只在
// 有真实待办语义的项上出现，0 一律不渲染，不造噪音数字。
import { computed } from 'vue'
import { useWorkspaceStore } from '../store/workspace'
import { useAttentionRows } from './useAttentionRows'
import { useDecisionRows } from './useDecisionRows'
import { stageTaskCount, blockedTaskCount } from '../badge-count'

export function useSideNavBadges() {
  const workspace = useWorkspaceStore()
  const { attentionRows } = useAttentionRows()
  const { decisionRows, gateRows } = useDecisionRows()

  const blockedCount = computed(() => blockedTaskCount(workspace.tasks))
  const stage3Count = computed(() => stageTaskCount(workspace.tasks, 3))
  const stage4Count = computed(() => stageTaskCount(workspace.tasks, 4))
  /** 总览=需关注∪待决策：decisionRows 里的 waitItems 三源已全在 attentionRows，
   * 唯一不在注意力面的是评审门（gateRows），相加即并集。 */
  const journeyCount = computed(() => attentionRows.value.length + gateRows.value.length)

  /** key→待办数；消费方按 key 取值，0 渲染为无徽标 */
  const badges = computed<Record<string, number>>(() => ({
    journey: journeyCount.value,
    workbench: attentionRows.value.length,
    board: blockedCount.value,
    inbox: decisionRows.value.length,
    stage3: stage3Count.value,
    stage4: stage4Count.value,
  }))

  return { badges, blockedCount, stage3Count, stage4Count, journeyCount }
}
