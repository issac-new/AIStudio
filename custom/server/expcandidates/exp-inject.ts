// overlay[expcandidates] 受控注入面（2026-10-14 阿里调研轮 B2，方案正本纪律 49）。
//
// 默认关闭：EXPERIENCE_INJECT=1 才注入；三前提（审核过/版本化带出处/注入留痕）
// 由 B1 store 与本层共同兑现。凭据形态改写：注入文本只以「历史经验」形态呈现，
// 不携带可被当作本轮实测凭据的哈希/卡号/event_id。fail-soft：任何错误返回空行
// 不阻断派发（与约束卡同纪律）。
//
// Few-shot 记忆通道（2026-10-25 数据飞轮 round 2 挂账 1）：FLYWHEEL_FEWSHOT_INJECT=1
// 选通且调用方带 query（当前任务语境）时，按词面相似度召回飞轮台账教训附加一行。
// 无 query 不召回（Prompt 保持干净——源文纪律）；当前 column-dispatch 层无任务
// 文本可传，通道就绪待语境接线（不造无效召回）。
import { listCandidates, recordInjection } from './exp-store'
import type { ExpCandidate } from './exp-types'
import type { DispatchTarget } from '../constraints/constraint-types'
import { fewshotInjectLine, recallFewshot } from '../eval/fewshot'
import { listLedger } from '../eval/flywheel'

/** 注入上限：经验行比约束卡更少（3 条），防简报膨胀。 */
export const MAX_EXP_INJECT = 3

export function injectionEnabled(): boolean {
  return process.env.EXPERIENCE_INJECT?.trim() === '1'
}

/** Few-shot 记忆通道选通（数据飞轮 round 2；独立于 EXPERIENCE_INJECT）。 */
export function fewshotInjectionEnabled(): boolean {
  return process.env.FLYWHEEL_FEWSHOT_INJECT?.trim() === '1'
}

/** 注入轮次标签（留痕用）：EXPERIENCE_INJECT_RUN 显式指定，缺省按日期。 */
export function injectionRunLabel(): string {
  return process.env.EXPERIENCE_INJECT_RUN?.trim() || `adhoc-${new Date().toISOString().slice(0, 10)}`
}

/** 可注入候选：approved 态；v1 不按 target 过滤（经验陈述自含适用面），封顶 3。 */
export function selectableExperiences(candidates: ExpCandidate[]): ExpCandidate[] {
  return [...candidates]
    .filter((c) => c.status === 'approved')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
    .slice(0, MAX_EXP_INJECT)
}

/** 注入行：凭据形态改写——陈述原样（提取时已不含哈希），出处只以「历史经验」形态。 */
export function experienceBriefLine(candidates: ExpCandidate[]): string | null {
  const items = candidates.map((c, i) => `${i + 1}. [${c.id}] ${c.statement}`)
  if (!items.length) return null
  return `历史经验（已审核，历史经验出处·非本轮实测凭据）：${items.join('；')}`
}

/** 派单侧读取面（column-dispatch 消费）：默认关/无 approved/存储异常→空行。
 * query（可选）=当前任务语境；提供且 fewshot 通道选通时按相似度追加飞轮教训行。 */
export function experienceLinesForDispatch(_target: DispatchTarget, query?: string): string[] {
  const lines: string[] = []
  try {
    if (injectionEnabled()) {
      const selected = selectableExperiences(listCandidates())
      if (selected.length) {
        recordInjection(selected.map((c) => c.id), injectionRunLabel())
        const line = experienceBriefLine(selected)
        if (line) lines.push(line)
      }
    }
  } catch { /* fail-soft：经验通道异常不影响派发 */ }
  try {
    if (fewshotInjectionEnabled() && query?.trim()) {
      const line = fewshotInjectLine(recallFewshot(query, listLedger().distills))
      if (line) lines.push(line)
    }
  } catch { /* fail-soft：fewshot 通道异常不影响派发 */ }
  return lines
}
