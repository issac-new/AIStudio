// custom/server/services/kanban/retry-guard.ts
// 防死循环熔断（方案步骤 16.7）：测试打回（review→ready reopen）计数，
// 阈值 = 3 触发 Leader 介入标记、5 拒绝继续自动流转。
// 上报通道：本轮以结构化日志留痕（LEADER_INTERVENTION 标记），Matrix
// Leader 实弹通知待 hermes matrix send CLI 补面后接入（问题记录 #4）。

import { RetryStore } from './retry-store'

export const RETRY_LEADER_THRESHOLD = 3
export const RETRY_MAX = 5

export interface RetryVerdict {
  count: number
  leaderIntervention: boolean
  maxExceeded: boolean
}

export class RetryGuardService {
  /** 测试打回后调用：计数 +1 并给出熔断判定 */
  static async onTestReject(taskId: string): Promise<RetryVerdict> {
    const count = await RetryStore.increment(taskId)
    const leaderIntervention = count >= RETRY_LEADER_THRESHOLD
    const maxExceeded = count >= RETRY_MAX
    if (leaderIntervention) {
      console.warn(
        `[aipaydev] LEADER_INTERVENTION task=${taskId} retry=${count}/${RETRY_MAX}`
        + '（连续打回达阈值，升级 Leader/人工审查；maxExceeded=' + String(maxExceeded) + '）',
      )
    }
    return { count, leaderIntervention, maxExceeded }
  }

  static async countOf(taskId: string): Promise<number> {
    return RetryStore.get(taskId)
  }

  static async reset(taskId: string): Promise<void> {
    return RetryStore.reset(taskId)
  }
}
