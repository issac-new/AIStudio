// overlay/custom/client/matrix-teams/test-execution.ts
// M-F 测试执行链（studio 侧编排面）：测试任务失败 → 缺陷任务自动建（parentId 挂原任务）；
// 缺陷全闭合 → 回归重测请求。零协议变更：缺陷=新 assign 事件，回归=原测试任务 reopen。
// 完整测试报告走 git 制品（artifactRef 纪律），事件只带结论与指针。
import type { AssignContent, ReceiptContent } from './protocol'
import { cardStatus, type CardStatus } from './task-card'

/** 测试能力标签（裁决 B：测试 Agent 集群声明该标签承接测试任务）。 */
export const TEST_CAPABILITY = 'test'

/** 缺陷任务构造：失败回执（测试类任务）→ 一张缺陷 assign。 */
export function buildDefectFromFailure(
  original: AssignContent,
  failure: ReceiptContent,
  idGen: () => string = () => crypto.randomUUID(),
): AssignContent {
  const reason = (failure.reason ?? 'test-failed').slice(0, 60)
  return {
    taskId: idGen(),
    title: `[缺陷] ${original.title} — ${reason}`,
    body: `来自测试任务 ${original.taskId} 的失败：${reason}`,
    priority: '1',
    dueAt: original.dueAt,
    parentId: original.taskId,
    capability: original.capability?.filter(c => c !== TEST_CAPABILITY),
    phase: 'P4',
    dependsOn: undefined,
    target: { ...original.target },
    issuedBy: failure.reportedBy,
    issuedAt: Date.now(),
  }
}

/** 是否应自动建缺陷：测试类任务 + failed 回执（最新）。 */
export function shouldAutoDefect(original: AssignContent, latestReceipt: ReceiptContent | null): boolean {
  if (!latestReceipt || latestReceipt.status !== 'failed') return false
  return (original.capability ?? []).includes(TEST_CAPABILITY)
}

/** 回归重测请求：缺陷子任务全部闭合（done/failed 终态）→ 重开原测试任务。 */
export function regressionReady(
  original: AssignContent,
  defectCards: readonly { assign: AssignContent; receipt: ReceiptContent | null }[],
): boolean {
  const defects = defectCards.filter(c => c.assign.parentId === original.taskId)
  if (defects.length === 0) return false
  return defects.every(c => {
    const s: CardStatus = cardStatus(c.assign, c.receipt)
    return s === 'done' || s === 'blocked'
  })
}
