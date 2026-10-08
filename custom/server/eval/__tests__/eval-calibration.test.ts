// overlay/custom/server/eval/__tests__/eval-calibration.test.ts
// 校准度分析（六文调研轮 G）守门测试：分桶/ECE/Brier/大白话结论/诚实缺席。
import { describe, it, expect } from 'vitest'
import { calibrationReport, extractCalibrationPairs } from '../calibration'
import type { Attempt, EvalSet } from '../types'

function makeSet(): EvalSet {
  return {
    id: 's-cal', name: '校准测试集', track: 'e2e', sealed: false, createdAt: 1,
    tasks: [{
      id: 't1', problem: 'p', expectedBehavior: 'e',
      rubric: [{ id: 'a1', text: '断言1', expect: 'yes', kind: 'result' }],
    }],
  }
}

function attempt(p: number | undefined, value: 'yes' | 'no' | 'unknown', sampleIdx = 1): Attempt {
  const verdicts = [{ assertionId: 'a1', value, source: 's1' as const, ...(p !== undefined ? { p } : {}) }]
  return { taskId: 't1', sampleIdx, verdicts }
}

describe('calibration report', () => {
  it('高估场景：自报 0.9 信心 × 实际 5/10 命中 → 高估桶 gap≈0.4、大白话点名', () => {
    const set = makeSet()
    const attempts: Attempt[] = []
    for (let i = 0; i < 10; i++) attempts.push(attempt(0.9, i < 5 ? 'yes' : 'no', i + 1))
    const r = calibrationReport(set, attempts)
    expect(r.samples).toBe(10)
    const b90 = r.buckets.find((b) => b.lo === 0.9)!
    expect(b90.count).toBe(10)
    expect(b90.accuracy).toBeCloseTo(0.5, 3)
    expect(b90.gap).toBeCloseTo(0.4, 3)
    expect(r.ece!).toBeCloseTo(0.4, 3)  // 全部样本在一个桶
    expect(r.meanGap).toBeCloseTo(0.4, 3)
    expect(r.plainSummary).toContain('高估')
    expect(r.plainSummary).toContain('元认知')
  })

  it('完美校准：0.8 信心 × 8/10 命中 → gap≈0、结论=校准良好', () => {
    const set = makeSet()
    const attempts: Attempt[] = []
    for (let i = 0; i < 10; i++) attempts.push(attempt(0.8, i < 8 ? 'yes' : 'no', i + 1))
    const r = calibrationReport(set, attempts)
    expect(r.meanGap!).toBeLessThan(0.05)
    expect(r.plainSummary).toContain('校准良好')
    expect(r.ece!).toBeLessThan(0.05)
  })

  it('Brier：全错 1.0 信心 → 1.0；半对 0.5 信心 → 0.25', () => {
    const set = makeSet()
    const allWrong = [attempt(1.0, 'no', 1), attempt(1.0, 'no', 2)]
    expect(calibrationReport(set, allWrong).brier).toBeCloseTo(1, 3)
    const half = [attempt(0.5, 'yes', 1), attempt(0.5, 'no', 2)]
    expect(calibrationReport(set, half).brier).toBeCloseTo(0.25, 3)
  })

  it('诚实缺席：无 p 留痕 → samples=0 + 提示；unknown 判词入 excludedUnknown 不入校准', () => {
    const set = makeSet()
    const r = calibrationReport(set, [attempt(undefined, 'yes', 1), attempt(undefined, 'unknown', 2)])
    expect(r.samples).toBe(0)
    expect(r.missingP).toBe(1)
    expect(r.excludedUnknown).toBe(1)
    expect(r.ece).toBeNull()
    expect(r.plainSummary).toContain('不可用')
  })

  it('extractCalibrationPairs：正确性按 value===expect 计（expect=no 的断言 no 才是命中）', () => {
    const set = makeSet()
    set.tasks[0].rubric[0].expect = 'no'
    const { pairs } = extractCalibrationPairs(set, [attempt(0.9, 'no', 1), attempt(0.9, 'yes', 2)])
    expect(pairs[0].correct).toBe(1)
    expect(pairs[1].correct).toBe(0)
  })

  it('aggregateRun 集成：聚合产出 calibration 字段（有 p 即有面）', async () => {
    const { aggregateRun } = await import('../aggregate')
    const set = makeSet()
    const run = {
      id: 'r1', setId: 's-cal', target: {}, k: 2, status: 'done' as const,
      attempts: [attempt(0.9, 'yes', 1), attempt(0.9, 'no', 2)],
      aggregates: {} as never,
    }
    const config = { unknownWarnRatio: 0.3, passAtKGate: 0.8 } as never
    const out = aggregateRun(set, run as never, config)
    expect(out.aggregates.calibration).toBeTruthy()
    expect(out.aggregates.calibration!.samples).toBe(2)
  })
})
