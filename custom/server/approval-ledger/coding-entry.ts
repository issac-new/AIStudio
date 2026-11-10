// overlay/approval-ledger 域（P0b-2，2026-11-10 执行内核统一批 Task 2）：
// IDE／群聊编码任务的启动免审记录合成入参。单一合成点=vendor
// coding-agents/services/index.ts startCodingAgentRunInternal 成功返回处
// （先例=补丁 736 execution-records；spec §8「合成点必须唯一」）。
// 本文件只做纯映射，不做 IO；账本写入由接线补丁调 synthesizeExempted。
import type { ModeId } from '../executioncontract/index'

export type CodingSessionSource = 'coding_agent' | 'group_chat' | 'workflow' | 'global_agent'

/** 编码任务入口名：群聊与工作流各自可对账，其余（IDE 直用）归 ide。 */
export function codingLaunchEntryPoint(sessionSource: string): 'ide-coding-agent' | 'group-chat-coding-agent' | 'workflow-coding-agent' {
  if (sessionSource === 'group_chat') return 'group-chat-coding-agent'
  if (sessionSource === 'workflow' || sessionSource === 'global_agent') return 'workflow-coding-agent'
  return 'ide-coding-agent'
}

/** 当前档位语义如实入账：本批 ZCode/DSH 仍是 approvalRequired 二值（plan|yolo），
 *  缺省 yolo=现状行为；P1 Task 4 换 permissionMode 四挡后此函数改读四挡。 */
export function codingLaunchMode(approvalRequired: boolean | undefined): ModeId {
  return approvalRequired ? 'plan' : 'yolo'
}

export interface CodingLaunchApprovalInput {
  codingAgentId: string
  sessionSource: string
  approvalRequired?: boolean
  sessionId: string
  agentSessionId: string
}

/** 启动成功即放行（用户裁决口径）的免审记录入参；不在此处写盘。 */
export function codingLaunchApprovalRecord(input: CodingLaunchApprovalInput): {
  tool: string
  mode: ModeId
  sessionId: string
  profile: string
  entryPoint: string
  decided: 'auto'
  detail: { codingAgentId: string; agentSessionId: string; source: string }
} {
  return {
    tool: `coding_agent_launch:${input.codingAgentId}`,
    mode: codingLaunchMode(input.approvalRequired),
    sessionId: input.sessionId,
    profile: '',
    entryPoint: codingLaunchEntryPoint(input.sessionSource),
    decided: 'auto',
    detail: {
      codingAgentId: input.codingAgentId,
      agentSessionId: input.agentSessionId,
      source: input.sessionSource,
    },
  }
}
