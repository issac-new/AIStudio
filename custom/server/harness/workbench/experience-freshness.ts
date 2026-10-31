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

// ---- D11（2026-10-31 RSI P2 批）：记忆压缩/遗忘策略 ----
// 来源：上下文工程综述（arXiv 2507.13334）「记忆只增不减→长期噪声源」与
// memory-as-action 思想——保留哪条记忆应由证据（再验证/采纳回流）决定，
// 而非自然堆积。本仓的经验库即 harness 记忆面：三档状态机已有
// （candidate/adopted/retired），缺的是「何时该再验证、何时该遗忘」的
// 策略层。本层纯派生不落盘；执行走既有 setExperienceStatus（人裁决）。

/** 孤儿候选退役线（天）：candidate 从未采纳且超过此龄 → 建议退役。 */
export const ORPHAN_CANDIDATE_DAYS = 14

export interface MemoryPolicyItem {
  id: string
  statement: string
  ageDays: number
  /** stale 采纳=需再验证；orphan 候选=建议退役。 */
  action: 'revalidate' | 'retire'
}

export interface MemoryConsolidationPolicy {
  staleAdopted: MemoryPolicyItem[]
  orphanCandidates: MemoryPolicyItem[]
  counts: { adopted: number; candidate: number; retired: number }
  hint: string
}

/**
 * 记忆压缩/遗忘策略（纯函数，视图现算）：
 * - staleAdopted＝status=adopted 且保鲜档 stale（≥90 天无再验证）→ 再验证建议
 *   （晋级引用经验即刷新 lastValidatedAt，HP-7 既有通道）；
 * - orphanCandidates＝status=candidate 且龄超 ORPHAN_CANDIDATE_DAYS → 退役建议
 *   （「可能有用」不是保留依据——无证据的记忆按遗忘处理）。
 */
export function memoryConsolidationPolicy(
  experiences: Array<{
    id: string
    statement: string
    status: 'candidate' | 'adopted' | 'retired'
    confidence: 'low' | 'medium' | 'high'
    createdAt: string
    lastValidatedAt?: string
  }>,
  now: Date = new Date(),
): MemoryConsolidationPolicy {
  const staleAdopted: MemoryPolicyItem[] = []
  const orphanCandidates: MemoryPolicyItem[] = []
  const counts = { adopted: 0, candidate: 0, retired: 0 }
  for (const e of experiences) {
    if (e.status === 'adopted') counts.adopted += 1
    else if (e.status === 'candidate') counts.candidate += 1
    else counts.retired += 1
    const fresh = experienceFreshness(e, now)
    if (e.status === 'adopted' && fresh.band === 'stale') {
      staleAdopted.push({ id: e.id, statement: e.statement, ageDays: fresh.ageDays, action: 'revalidate' })
    } else if (e.status === 'candidate' && fresh.ageDays >= ORPHAN_CANDIDATE_DAYS) {
      orphanCandidates.push({ id: e.id, statement: e.statement, ageDays: fresh.ageDays, action: 'retire' })
    }
  }
  const parts: string[] = []
  if (staleAdopted.length) parts.push(`${staleAdopted.length} 条采纳经验超 90 天未再验证（stale）——建议在下个提案中引用以刷新，或人工复核后退役`)
  if (orphanCandidates.length) parts.push(`${orphanCandidates.length} 条候选经验超 ${ORPHAN_CANDIDATE_DAYS} 天未被采纳——「可能有用」不是保留依据，建议退役`)
  return {
    staleAdopted,
    orphanCandidates,
    counts,
    hint: parts.length ? parts.join('；') : '记忆面健康：无 stale 采纳、无孤儿候选',
  }
}
