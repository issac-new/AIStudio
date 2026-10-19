// 评审治理·评测集打分器守门：一对一匹配、行号容差、召回/精确率、漏网与误报。
import { describe, it, expect } from 'vitest'
import { scorePredictions } from '../eval-scorer'
import type { ReviewEvalCase, ReviewEvalPrediction } from '../types'

const evalCase = (id: string, file: string, line?: number): ReviewEvalCase => ({
  evalCaseId: id,
  caseId: 'c',
  source: 'manual',
  title: id,
  expected: 'x',
  file,
  line,
  createdAt: 1,
})

describe('评测集打分', () => {
  it('同文件行号 ±3 命中；漏网与误报分别列出', () => {
    const cases = [evalCase('e1', 'a.ts', 10), evalCase('e2', 'b.ts', 20)]
    const predictions: ReviewEvalPrediction[] = [
      { file: 'a.ts', line: 12 },
      { file: 'c.ts', line: 1 },
    ]
    const score = scorePredictions(cases, predictions)
    expect(score).toMatchObject({ total: 2, matched: 1, recall: 0.5, precision: 0.5 })
    expect(score.missing).toEqual(['e2'])
    expect(score.falsePositives).toEqual([{ file: 'c.ts', line: 1 }])
  })

  it('行号差超过 3 不命中；无行号时按文件命中', () => {
    const cases = [evalCase('e1', 'a.ts', 10)]
    expect(scorePredictions(cases, [{ file: 'a.ts', line: 14 }]).matched).toBe(0)
    expect(scorePredictions(cases, [{ file: 'a.ts', line: 30 }]).matched).toBe(0)
    expect(scorePredictions(cases, [{ file: 'a.ts' }]).matched).toBe(1)
  })

  it('空输入口径：无评测集时召回 null；无预测时精确率 null', () => {
    expect(scorePredictions([], [])).toMatchObject({ recall: null, precision: null })
    expect(scorePredictions([evalCase('e1', 'a.ts')], [])).toMatchObject({ recall: 0, precision: null })
    expect(scorePredictions([], [{ file: 'a.ts' }])).toMatchObject({ recall: null, precision: 0 })
  })

  it('一对一匹配：同一预测不能同时命中两条评测案例', () => {
    const cases = [evalCase('e1', 'a.ts', 10), evalCase('e2', 'a.ts', 11)]
    const score = scorePredictions(cases, [{ file: 'a.ts', line: 10 }])
    expect(score.matched).toBe(1)
    expect(score.missing).toHaveLength(1)
  })
})
