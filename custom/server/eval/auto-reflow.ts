// overlay[eval] run 完成自动回流（JoyAI 挂账清偿批 B4，2026-10-26）。
//
// 范式来源：数据飞轮「错误转化率」——失败样本自动回流入回归库（资产化），
// 与 auto-reflow-on-close（处置单关闭自动回流，store.ts 先例、默认开）同一治理
// 形态在 run 完成路径的补全。底层复用 reflowTaskToSet（re- id 幂等，重复触发
// 安全；密封源集/自指回流结构性自拒）。env EVAL_AUTO_REFLOW_ON_RUN=0 可关。
// distill 提炼维持人工 dryRun 卡点（spec D4：自动化提案无人看等于没有）。
import { reflowTaskToSet } from './store'
import { attemptPassed } from './aggregate'
import type { EvalSet, EvalRun } from './types'

export interface AutoReflowSummary {
  enabled: boolean
  /** 已回流样本数（含幂等命中 created:false 的重复触发）。 */
  reflowed: number
  /** 结构性拒绝/异常跳过数（密封源集等——如实计数不中断）。 */
  skipped: number
  /** 触发跳过的原因样本（首条，供 run note 透出）。 */
  firstSkipReason?: string
}

export function autoReflowEnabled(): boolean {
  return process.env.EVAL_AUTO_REFLOW_ON_RUN?.trim() !== '0'
}

/** run 完成后对失败样本自动回流回归库（幂等；任何单样本异常不中断其余）。 */
export function autoReflowFailedSamples(set: EvalSet, run: EvalRun): AutoReflowSummary {
  if (!autoReflowEnabled()) return { enabled: false, reflowed: 0, skipped: 0 }
  const summary: AutoReflowSummary = { enabled: true, reflowed: 0, skipped: 0 }
  const byId = new Map(set.tasks.map((t) => [t.id, t]))
  for (const attempt of run.attempts) {
    const task = byId.get(attempt.taskId)
    if (!task) continue
    if (attemptPassed(task, attempt)) continue // 只回流失败样本
    try {
      const r = reflowTaskToSet({
        runId: run.id,
        taskId: attempt.taskId,
        sampleIdx: attempt.sampleIdx,
        actor: 'auto-reflow-on-run',
      })
      if (r.ok) summary.reflowed += 1
      else {
        summary.skipped += 1
        summary.firstSkipReason ??= (r as { problems: string[] }).problems.join('；')
      }
    } catch (e) {
      summary.skipped += 1
      summary.firstSkipReason ??= `回流异常：${e instanceof Error ? e.message : String(e)}`
    }
  }
  return summary
}
