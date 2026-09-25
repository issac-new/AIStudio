// overlay/kanban 域：列编排执行半环（routa §七#2 COLUMN_TRANSITION→编排派发，矩阵 §3.6 P0 收尾件）。
//
// 语义：列流转（from,to）→ 匹配器（column-automation.ts）→ 每 step 一条派单
// （复用 P3 MentionDispatchService 单 pending 槽+围栏+outcome 词表）。step 的
// specialist/role 组装成派单文本（简报式：列编排语义+step 职责）。
// 事件自动触发（kanban 399 column_transition 事件→本执行链）依赖 loop/kanban
// 跨进程通道列后续；本层给手动/REST 触发面（运维可预演/补触发），执行语义与
// 自动面同源（同一 dispatchColumnTransition 入口）。
import { matchColumnTransition, type ColumnTransitionTrigger } from './column-automation'
import { MentionDispatchService, type MentionOutcome, type DispatchEnginePort } from '../zcode/mention-dispatch'

export interface ColumnDispatchResult {
  triggers: ColumnTransitionTrigger[]
  outcomes: MentionOutcome[]
}

function stepBrief(trigger: ColumnTransitionTrigger, stepId: string): string {
  return `[kanban:${trigger.column}] 列编排步骤 ${stepId}（时机 ${trigger.matchedTiming}${trigger.autoAdvanceOnSuccess ? '，成功后自动进列' : ''}）`
}

/**
 * 执行列流转编排：每 step 一条派单到 provider agent（zcode 引擎）。幂等由
 * step 派单的 pending 槽兜底（同 step 同列活跃期间重复触发走 coalesced）。
 */
export async function dispatchColumnTransition(
  engine: DispatchEnginePort,
  clientId: string,
  params: { from: string | null; to: string; workspacePath: string },
): Promise<ColumnDispatchResult> {
  const triggers = matchColumnTransition(params.from, params.to)
  const svc = new MentionDispatchService({ engine, clientId })
  const outcomes: MentionOutcome[] = []
  for (const trigger of triggers) {
    for (const step of trigger.steps) {
      // step→agent 派单：step.specialist/role 信息入简报文本；provider 只有 zcode
      // 引擎族（单机形态），派单目标=zcode（knownAgents 集只含 zcode 防误派）。
      const text = `${stepBrief(trigger, step.id)}\n职责角色：${step.role}${step.specialist ? ` / ${step.specialist}` : ''}\n请按职责处理列 ${trigger.column} 的当前任务。`
      const [outcome] = await svc.dispatch({ workspacePath: params.workspacePath, text: `@${step.provider} ${text}` })
      if (outcome) outcomes.push(outcome)
    }
  }
  return { triggers, outcomes }
}
