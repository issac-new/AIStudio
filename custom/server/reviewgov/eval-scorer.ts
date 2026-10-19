// overlay/custom/server/reviewgov/eval-scorer.ts
// 评审「错题本」打分器（纯函数）：把一次评审 Agent 的预测发现与回归评测集比对，
// 算召回率/精确率，列出漏网（missing）与误报（false positive）。
// 对齐 Anthropic 文章：事故与回滚变成专家确认的评测集；改提示词/工具/模型后
// 先拿历史踩过的坑考一遍，分数涨了才准保留。
import type { ReviewEvalCase, ReviewEvalPrediction } from './types'

export interface EvalScore {
  total: number
  matched: number
  recall: number | null
  precision: number | null
  missing: string[]
  falsePositives: ReviewEvalPrediction[]
}

function sameTarget(c: ReviewEvalCase, p: ReviewEvalPrediction): boolean {
  if (!c.file || !p.file) return false
  if (c.file.replace(/\\/g, '/') !== p.file.replace(/\\/g, '/')) return false
  if (typeof c.line === 'number' && typeof p.line === 'number') {
    return Math.abs(c.line - p.line) <= 3
  }
  return true
}

/** 一对一匹配：每个评测案例最多命中一条预测；同文件行号容差 ±3。 */
export function scorePredictions(
  evalCases: ReviewEvalCase[],
  predictions: ReviewEvalPrediction[],
): EvalScore {
  const used = new Set<number>()
  const missing: string[] = []
  let matched = 0
  for (const c of evalCases) {
    const idx = predictions.findIndex((p, i) => !used.has(i) && sameTarget(c, p))
    if (idx >= 0) {
      used.add(idx)
      matched += 1
    } else {
      missing.push(c.evalCaseId)
    }
  }
  const falsePositives = predictions.filter((_, i) => !used.has(i))
  return {
    total: evalCases.length,
    matched,
    recall: evalCases.length ? matched / evalCases.length : null,
    precision: predictions.length ? matched / predictions.length : null,
    missing,
    falsePositives,
  }
}
