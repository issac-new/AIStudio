// overlay/custom/server/harness/workbench/experience-freshness.ts
// 经验库保鲜派生（2026-10-23 HarnessPro×Harness 十一坑吸收轮 HP-7）。
//
// 来源（腾讯文误区三）：记忆没有「保鲜」机制，三个月前的决策被当成今天的真理；
// 记忆没有「置信度」标签，用户确认与模型猜测混在一起。本仓既有 Experience 有
// 三档 confidence（词面），但无时间衰减——本轮补数值化置信 × 半衰期衰减的派生面。
//
// 纪律（与 RSI evolution 段同模式）：
//   - 纯派生、不落盘：freshness/confidenceScore 由 lastValidatedAt（缺席=createdAt）
//     与 confidence 现算；Experience 状态机（candidate/adopted/retired）不动。
//   - 采纳=再验证：晋级时引用经验的 lastValidatedAt 刷新（service 层编排）；
//     回滚精确撤销该次刷新（时间戳精确匹配，不误伤后续验证）。

/** confidence 三档的数值基数（词面档 → [0,1] 分）。 */
export const CONFIDENCE_BASE: Record<'low' | 'medium' | 'high', number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.9,
}

/** 半衰期（天）：一次再验证后，数值置信每过 90 天衰减一半。 */
export const HALF_LIFE_DAYS = 90

/** 保鲜分档：fresh <30 天 / aging <90 天 / stale ≥90 天（自最近验证/创建起算）。 */
export const FRESH_FRESH_DAYS = 30
export const FRESH_AGING_DAYS = 90

export type FreshnessBand = 'fresh' | 'aging' | 'stale'

export interface ExperienceFreshness {
  /** 数值置信 = 档位基数 × 2^(−距最近验证天数/半衰期)，保留三位。 */
  confidenceScore: number
  /** 距最近验证（或创建）天数。 */
  ageDays: number
  band: FreshnessBand
  /** 计龄锚点：lastValidatedAt 存在则用之，否则退 createdAt（如实反映「从未被再验证」）。 */
  anchor: 'lastValidatedAt' | 'createdAt'
  anchoredAt: string
}

/** 半衰期衰减（纯函数）：base × 2^(−ageDays/halfLife)。 */
export function decayedConfidence(base: number, ageDays: number, halfLifeDays: number = HALF_LIFE_DAYS): number {
  const factor = Math.pow(2, -Math.max(0, ageDays) / halfLifeDays)
  return Number((base * factor).toFixed(3))
}

/** 经验保鲜派生（视图现算；无副作用）。 */
export function experienceFreshness(
  exp: { confidence: 'low' | 'medium' | 'high'; createdAt: string; lastValidatedAt?: string },
  now: Date = new Date(),
): ExperienceFreshness {
  const anchoredAt = exp.lastValidatedAt ?? exp.createdAt
  const anchor: ExperienceFreshness['anchor'] = exp.lastValidatedAt ? 'lastValidatedAt' : 'createdAt'
  const ageMs = now.getTime() - new Date(anchoredAt).getTime()
  const ageDays = Number.isFinite(ageMs) ? Math.max(0, ageMs / 86_400_000) : 0
  const confidenceScore = decayedConfidence(CONFIDENCE_BASE[exp.confidence] ?? CONFIDENCE_BASE.low, ageDays)
  const band: FreshnessBand = ageDays < FRESH_FRESH_DAYS ? 'fresh' : ageDays < FRESH_AGING_DAYS ? 'aging' : 'stale'
  return { confidenceScore, ageDays: Number(ageDays.toFixed(1)), band, anchor, anchoredAt }
}
