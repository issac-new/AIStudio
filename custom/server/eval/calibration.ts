/**
 * Eval Studio 校准度分析（六文调研轮 G，元认知文章核心：判断对不对是一回事，
 * 判断自己有多可能对是另一回事）。
 *
 * 消费面：AttemptVerdict.p（S1 判定器留痕 P(yes)，types.ts 早已留口"供校准分析"）。
 * 正确性 = value === expect；confidence = p。产出：
 *   - 分桶（0.1 步进 10 桶）：count / 平均信心 / 实际命中率 / 信心−命中差
 *   - ECE（期望校准误差）= Σ |桶样本|/N × |桶命中 − 桶信心|
 *   - Brier = mean((p − correct)²)（兼收 0/1 极端与中间值）
 *   - 大白话结论：信心高估/低估多少个百分点（汇报纪律：先人话再术语）
 * p 缺席的判词如实计数不入校准（不插值不猜数）。
 */
import type { Attempt, AttemptVerdict, EvalSet, EvalTask } from './types'

export interface CalibrationBucket {
  /** 桶下界（0.0-0.9，步进 0.1；上界=下界+0.1）。 */
  lo: number
  count: number
  avgConfidence: number
  /** 实际命中率（value===expect 比例）。 */
  accuracy: number
  /** 信心 − 命中（正=高估）。 */
  gap: number
}

export interface CalibrationSummary {
  /** 入校准的判词数（有 p 且 value 非 unknown）。 */
  samples: number
  /** 有 p 但 value=unknown 的判词数（仲裁中，不入校准如实计）。 */
  excludedUnknown: number
  /** 无 p 留痕的判词数（S0/人工裁决无概率面）。 */
  missingP: number
  buckets: CalibrationBucket[]
  /** 期望校准误差（0 完美；>0.15 经验上需治理——阈值口径见 plainSummary）。 */
  ece: number | null
  brier: number | null
  /** 加权平均信心 − 加权平均命中（百分点级总信号；正=高估）。 */
  meanGap: number | null
  /** 大白话结论（人话先行）。 */
  plainSummary: string
}

interface Pair { p: number; correct: number }

/** 从 attempts 抽 (p, correct) 对——只取 rubric 内、有 p、value 非 unknown 的判词。 */
export function extractCalibrationPairs(set: EvalSet, attempts: Attempt[]): { pairs: Pair[]; excludedUnknown: number; missingP: number } {
  const taskById = new Map(set.tasks.map((t) => [t.id, t]))
  const pairs: Pair[] = []
  let excludedUnknown = 0
  let missingP = 0
  for (const attempt of attempts) {
    const task = taskById.get(attempt.taskId)
    if (!task) continue
    const assertionById = new Map(task.rubric.map((a) => [a.id, a]))
    for (const v of attempt.verdicts) {
      const assertion = assertionById.get(v.assertionId)
      if (!assertion) continue
      // 顺序语义：unknown 判词不是校准候选（仲裁中）先剔除；其余无 p 才算留痕缺口
      if (v.value === 'unknown') { excludedUnknown += 1; continue }
      if (typeof v.p !== 'number' || !Number.isFinite(v.p)) { missingP += 1; continue }
      pairs.push({ p: clamp01(v.p), correct: v.value === assertion.expect ? 1 : 0 })
    }
  }
  return { pairs, excludedUnknown, missingP }
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

export function calibrationReport(set: EvalSet, attempts: Attempt[]): CalibrationSummary {
  const { pairs, excludedUnknown, missingP } = extractCalibrationPairs(set, attempts)
  if (pairs.length === 0) {
    return {
      samples: 0, excludedUnknown, missingP, buckets: [],
      ece: null, brier: null, meanGap: null,
      plainSummary: '无概率留痕判词（p 字段缺席）——校准面不可用：S1 判定端在线并留痕 p 后自动生成',
    }
  }
  const buckets: CalibrationBucket[] = []
  let ece = 0
  for (let i = 0; i < 10; i++) {
    const lo = i / 10
    const inBucket = pairs.filter((x) => x.p >= lo && (x.p < lo + 0.1 || (i === 9 && x.p <= 1)))
    if (inBucket.length === 0) { buckets.push({ lo, count: 0, avgConfidence: 0, accuracy: 0, gap: 0 }); continue }
    const avgConfidence = inBucket.reduce((s, x) => s + x.p, 0) / inBucket.length
    const accuracy = inBucket.reduce((s, x) => s + x.correct, 0) / inBucket.length
    const gap = avgConfidence - accuracy
    ece += (inBucket.length / pairs.length) * Math.abs(gap)
    buckets.push({
      lo, count: inBucket.length,
      avgConfidence: round4(avgConfidence), accuracy: round4(accuracy), gap: round4(gap),
    })
  }
  const brier = pairs.reduce((s, x) => s + (x.p - x.correct) ** 2, 0) / pairs.length
  const meanConf = pairs.reduce((s, x) => s + x.p, 0) / pairs.length
  const meanAcc = pairs.reduce((s, x) => s + x.correct, 0) / pairs.length
  const meanGap = meanConf - meanAcc
  // 大白话：找样本最多的"高信心桶"（lo≥0.7）讲人话；没有高信心桶讲整体
  const highBuckets = buckets.filter((b) => b.lo >= 0.7 && b.count > 0).sort((a, b) => b.count - a.count)
  const worst = highBuckets[0]
  let plain: string
  if (worst && worst.gap > 0.1) {
    plain = `判定器自报 ${Math.round((worst.lo + 0.05) * 100)}% 左右把握的断言（${worst.count} 条），实际命中 ${Math.round(worst.accuracy * 100)}%——信心高估约 ${Math.round(worst.gap * 100)} 个百分点（元认知缺口：知道自己不知道的能力不足）`
  } else if (meanGap > 0.1) {
    plain = `整体信心 ${Math.round(meanConf * 100)}% vs 实际命中 ${Math.round(meanAcc * 100)}%——高估 ${Math.round(meanGap * 100)} 个百分点`
  } else if (meanGap < -0.1) {
    plain = `整体信心 ${Math.round(meanConf * 100)}% vs 实际命中 ${Math.round(meanAcc * 100)}%——低估 ${Math.round(-meanGap * 100)} 个百分点（保守倾向，校准良好时差距应 <10 点）`
  } else {
    plain = `整体信心 ${Math.round(meanConf * 100)}% vs 实际命中 ${Math.round(meanAcc * 100)}%——校准良好（差距 <10 个百分点）`
  }
  return {
    samples: pairs.length, excludedUnknown, missingP, buckets,
    ece: round4(ece), brier: round4(brier), meanGap: round4(meanGap),
    plainSummary: plain,
  }
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000
}

/** 类型再导出（消费方不直连 types 内部）。 */
export type { AttemptVerdict, EvalTask }
