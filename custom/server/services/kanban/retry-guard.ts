// custom/server/services/kanban/retry-guard.ts
// 防死循环熔断（方案步骤 16.7）：测试打回（review→ready reopen）计数，
// 阈值 = 3 触发 Leader 介入标记、5 拒绝继续自动流转。
// 上报通道：结构化日志留痕（LEADER_INTERVENTION 标记）；设置
// AIPAYDEV_LEADER_MATRIX_ID 后经 `hermes send --to matrix:<id>` 实弹送达
// （hermes 8d6548f 起 matrix CLI 补面；fire-and-forget，通知失败不阻断流转）。

import { spawn } from 'child_process'
import { RetryStore } from './retry-store'

export const RETRY_LEADER_THRESHOLD = 3
export const RETRY_MAX = 5

export interface RetryVerdict {
  count: number
  leaderIntervention: boolean
  maxExceeded: boolean
}

/**
 * Leader 实弹通知（可选，env 门控）：AIPAYDEV_LEADER_MATRIX_ID 为收件 Matrix id。
 * HERMES_BIN 覆盖 CLI 路径（缺省走 PATH 的 hermes）；单发即弃，不重试。
 */
export function notifyLeader(taskId: string, count: number): void {
  const target = process.env.AIPAYDEV_LEADER_MATRIX_ID?.trim()
  if (!target) return
  try {
    const bin = process.env.HERMES_BIN?.trim() || 'hermes'
    const child = spawn(
      bin,
      ['send', '--to', `matrix:${target}`, `[aipaydev] LEADER_INTERVENTION task=${taskId} 连续打回 ${count} 次（阈值 ${RETRY_LEADER_THRESHOLD}），请人工审查`],
      { stdio: 'ignore', detached: true },
    )
    child.on('error', () => { /* CLI 缺失/不可执行：留痕已够，静默 */ })
    child.unref()
  } catch { /* 通知失败不阻断流转 */ }
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
      notifyLeader(taskId, count)
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
