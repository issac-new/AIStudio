// overlay/custom/client/matrix-teams/task-card.ts
// M-D 消息任务联动：消息→任务构造、看板态投影、卡片操作→事件（纯函数）。
// 写路径纪律（spec v1.2 §5）：一切状态变化 = 发事件，UI 只投影。
// assign 事件即任务创建/指派/转派（同 taskId 再发即转派）；receipt 事件承载
// 完成/阻塞/重开（done/failed/running）。权限硬约束在 Matrix PL（assign=50）。
import type { AssignContent, ReceiptContent, ReceiptStatus } from './protocol'

/** 消息转任务的构造入参。 */
export interface MessageToTaskInput {
  text: string
  sourceEventId?: string
  target: { account: string; agentTeam?: string; profile?: string }
  capability?: string[]
  phase?: string
  dueAt?: number
  parentId?: string
  issuedBy: string
}

/**
 * 聊天消息 → 任务 assign 事件。标题取首行 ≤80 字；正文携带原文与来源锚点
 * （sourceEventId 供追溯互跳，spec §9 追溯链的消息端）。
 */
export function buildTaskFromMessage(input: MessageToTaskInput, idGen: () => string = () => crypto.randomUUID()): AssignContent {
  const firstLine = input.text.trim().split('\n')[0] ?? ''
  const title = firstLine.slice(0, 80) || '（空消息转任务）'
  const body = [
    input.sourceEventId ? `> source: ${input.sourceEventId}` : null,
    input.text.trim(),
  ].filter(Boolean).join('\n')
  return {
    taskId: idGen(),
    title,
    body,
    priority: undefined,
    dueAt: input.dueAt,
    parentId: input.parentId,
    capability: input.capability,
    phase: input.phase,
    dependsOn: undefined,
    target: { ...input.target },
    issuedBy: input.issuedBy,
    issuedAt: Date.now(),
  }
}

/** 看板态（任务对人的状态，spec v1.2 §5.3 看板轴）。 */
export type CardStatus = 'pending' | 'assigned' | 'running' | 'review' | 'done' | 'blocked'

/** 看板态投影：assign（最新）+ receipt（最新）→ 卡片态。 */
export function cardStatus(assign: AssignContent, receipt: ReceiptContent | null): CardStatus {
  if (!receipt) return 'pending'
  switch (receipt.status) {
    case 'created': return 'assigned'
    case 'running': return 'running'
    case 'waiting-human': return 'review'
    case 'done': return 'done'
    case 'failed': return 'blocked'
  }
}

/** 卡片操作 → 回执事件（写路径=发事件；reportedBy=操作者）。 */
export type CardOp = 'complete' | 'block' | 'reopen'

const OP_STATUS: Record<CardOp, ReceiptStatus> = {
  complete: 'done',
  block: 'failed',
  reopen: 'running',
}

export function buildOpReceipt(op: CardOp, taskId: string, localTaskId: string | undefined, actor: string): ReceiptContent {
  return {
    taskId,
    status: OP_STATUS[op],
    localTaskId,
    reason: op === 'block' ? 'blocked-by-operator' : undefined,
    reportedBy: actor,
    reportedAt: Date.now(),
  }
}

/** 转派 = 同 taskId 重发 assign（新 target；PL=50 由 Matrix 层硬约束）。 */
export function buildReassign(taskId: string, from: AssignContent, newTarget: { account: string; agentTeam?: string; profile?: string }, actor: string): AssignContent {
  return {
    ...from,
    target: { ...newTarget },
    issuedBy: actor,
    issuedAt: Date.now(),
  }
}
