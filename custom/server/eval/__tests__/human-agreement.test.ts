// 裁判×人工一致率 + 盲测面板守门（2026-10-21 三号调研落地）。
import { describe, expect, it } from 'vitest'
import { blindPairChoice, blindTrimmedMean } from '../blind-review'
import { cohenKappa, judgeHumanAgreement, kappaBand, type AgreementPair } from '../human-agreement'
import type { Attempt } from '../types'

function pair(machine: 'yes' | 'no', human: 'yes' | 'no'): AgreementPair {
  return { key: `${machine}-${human}-${Math.random().toString(36).slice(2, 7)}`, machine, human }
}

describe('cohenKappa', () => {
  it('完全一致 → κ=1；纯随机不一致按机会校正压低', () => {
    const perfect = [pair('yes', 'yes'), pair('yes', 'yes'), pair('no', 'no'), pair('no', 'no')]
    expect(cohenKappa(perfect)).toBeCloseTo(1, 5)
    // 非对称错位（机判 yes 人多判 no、机判 no 人多判 yes）：κ 跌破机会线为负
    const half = [
      pair('yes', 'no'), pair('yes', 'no'), pair('yes', 'no'), pair('yes', 'no'),
      pair('no', 'yes'), pair('no', 'yes'), pair('no', 'yes'), pair('no', 'no'),
    ]
    expect(cohenKappa(half)!).toBeLessThan(0)
    const opposite = [pair('yes', 'no'), pair('yes', 'no'), pair('no', 'yes'), pair('no', 'yes')]
    expect(cohenKappa(opposite)).toBeCloseTo(-1, 5)
    // 单边恒定（机判全 yes）：κ 数学上恒为 0（机会线）
    const constantMachine = Array.from({ length: 6 }, (_, i) => pair('yes', i < 4 ? 'yes' : 'no'))
    expect(cohenKappa(constantMachine)).toBeCloseTo(0, 5)
  })

  it('样本 <2 或单边退化 → null', () => {
    expect(cohenKappa([pair('yes', 'yes')])).toBeNull()
    expect(cohenKappa(Array.from({ length: 5 }, () => pair('yes', 'yes')))).toBeNull()
  })

  it('kappaBand 档位与数据不足档', () => {
    expect(kappaBand(0.85, 10)).toBe('almost_perfect')
    expect(kappaBand(0.65, 10)).toBe('substantial')
    expect(kappaBand(0.45, 10)).toBe('moderate')
    expect(kappaBand(0.2, 10)).toBe('fair_or_less')
    expect(kappaBand(null, 0)).toBe('insufficient_data')
  })
})

describe('judgeHumanAgreement（从 attempts 聚合）', () => {
  function attemptWith(verdicts: Array<Partial<Attempt['verdicts'][number]>>): Attempt {
    return {
      taskId: 'T1',
      sampleIdx: 1,
      verdicts: verdicts.map((v, i) => ({
        assertionId: v.assertionId ?? `a${i}`,
        value: v.value ?? 'yes',
        source: v.source ?? 's1',
        previousValue: v.previousValue,
      })) as Attempt['verdicts'],
    }
  }

  it('只认 source=human 且带 previousValue 的判词；unknown 机判单独披露', () => {
    const report = judgeHumanAgreement([
      attemptWith([
        { source: 'human', value: 'yes', previousValue: 'yes' },
        { source: 'human', value: 'no', previousValue: 'unknown' },
        { source: 's1', value: 'yes' }, // 无人改判：不入账
        { source: 'human', value: 'no', previousValue: 'yes' }, // 假通过
      ]),
    ])
    expect(report.usableCount).toBe(2)
    expect(report.machineUnknown).toBe(1)
    expect(report.confusion.machineYesHumanNo).toBe(1)
    expect(report.falsePassSamples).toHaveLength(1)
    expect(report.agreementRate).toBeCloseTo(0.5)
  })
})

describe('blindTrimmedMean（盲测面板）', () => {
  const base = { reviewId: 'r1', targetRef: 'run9#T1', scaleMin: 1, scaleMax: 5 }

  it('去最高最低取均值；并列极值各截一个', () => {
    const r = blindTrimmedMean({ ...base, scores: [
      { reviewerId: 'a', score: 2 }, { reviewerId: 'b', score: 3 }, { reviewerId: 'c', score: 3 },
      { reviewerId: 'd', score: 3 }, { reviewerId: 'e', score: 5 },
    ] })
    expect(r.insufficient).toBe(false)
    expect(r.dropped).toEqual([2, 5])
    expect(r.trimmedMean).toBeCloseTo(3)
    const tie = blindTrimmedMean({ ...base, scores: [
      { reviewerId: 'a', score: 1 }, { reviewerId: 'b', score: 1 }, { reviewerId: 'c', score: 4 },
      { reviewerId: 'd', score: 4 }, { reviewerId: 'e', score: 4 },
    ] })
    expect(tie.dropped).toEqual([1, 4])
    expect(tie.kept).toEqual([1, 4, 4])
    expect(tie.note).toContain('并列')
  })

  it('评审数不足 → 不给分（insufficient）；<4 人降级全量均值', () => {
    const few = blindTrimmedMean({ ...base, minReviewers: 5, scores: [
      { reviewerId: 'a', score: 3 }, { reviewerId: 'b', score: 4 },
    ] })
    expect(few.insufficient).toBe(true)
    expect(few.trimmedMean).toBeNull()
    const small = blindTrimmedMean({ ...base, minReviewers: 3, scores: [
      { reviewerId: 'a', score: 3 }, { reviewerId: 'b', score: 4 }, { reviewerId: 'c', score: 5 },
    ] })
    expect(small.insufficient).toBe(false)
    expect(small.trimmedMean).toBeCloseTo(4) // 全量均值 (3+4+5)/3
    expect(small.note).toContain('降级')
  })

  it('量表外分值剔除；spreadRatio 反映分歧度', () => {
    const r = blindTrimmedMean({ ...base, scores: [
      { reviewerId: 'a', score: 1 }, { reviewerId: 'b', score: 2 }, { reviewerId: 'c', score: 2 },
      { reviewerId: 'd', score: 2 }, { reviewerId: 'e', score: 9 }, // 越界剔除
    ] })
    expect(r.reviewerCount).toBe(4)
    expect(r.spreadRatio).toBeCloseTo((2 - 1) / 4)
  })
})

describe('blindPairChoice（背靠背盲选）', () => {
  it('多数决 + 平票如实 tie', () => {
    expect(blindPairChoice([{ reviewerId: 'a', choice: 'A' }, { reviewerId: 'b', choice: 'B' }, { reviewerId: 'c', choice: 'A' }]).winner).toBe('A')
    expect(blindPairChoice([{ reviewerId: 'a', choice: 'A' }, { reviewerId: 'b', choice: 'B' }]).winner).toBe('tie')
  })
})
