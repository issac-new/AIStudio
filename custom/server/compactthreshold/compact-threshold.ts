// overlay/compactthreshold 域：compact 阈值策略校准（minimax 90% 线/reserve 公式吸收，矩阵 §3.2 minimax P2）。
//
// minimax 语义（compact 阈值校准——90% 线/reserve 公式对齐）：
// - **reserve 公式**：reserve = 输出预算 + 上限 5% 安全余量（给输出/工具回执留位）；
// - **90% 线**：可用容量（limit - reserve）的 90% 即触发 compact 建议；
// - **建议分级**：under（未到线）/ soon（到线）/ now（到 limit-reserve 全额）。
// 衔接 400 compact 六段与 token-budget（codex 吸收件）：本层=阈值判定纯函数。
export interface ThresholdInput {
  usedTokens: number
  limitTokens: number
  /** 输出预算（预留给模型输出的 token 数）。 */
  outputBudget: number
}

export type ThresholdLevel = 'under' | 'soon' | 'now'

export interface ThresholdDecision {
  /** reserve = outputBudget + limitTokens*5%。 */
  reserveTokens: number
  /** 触发线 = (limitTokens - reserveTokens) * 0.9。 */
  triggerTokens: number
  level: ThresholdLevel
  /** 距触发线余量（负值=已过线）。 */
  headroom: number
}

/** reserve 公式（minimax：输出预算+5% 安全余量）。 */
export function reserveTokens(limitTokens: number, outputBudget: number): number {
  return Math.ceil(outputBudget + limitTokens * 0.05)
}

/** compact 阈值判定（minimax 90% 线语义）。 */
export function compactThreshold(input: ThresholdInput): ThresholdDecision {
  const reserve = reserveTokens(input.limitTokens, input.outputBudget)
  const capacity = Math.max(0, input.limitTokens - reserve)
  const trigger = Math.floor(capacity * 0.9)
  const headroom = trigger - input.usedTokens
  const level: ThresholdLevel =
    input.usedTokens >= capacity ? 'now' : headroom <= 0 ? 'soon' : 'under'
  return { reserveTokens: reserve, triggerTokens: trigger, level, headroom }
}
