// 指标退化禁发闸守门：绝对闸优先 / 相对退化越线 / 无基线如实 no_baseline / no_data 单指标跳过。
import { describe, expect, it } from 'vitest'
import { evaluateReleaseHold, type RegressionThresholds } from '../release-hold'
import type { ReleaseGateSummary } from '../releaseGate'

const T: RegressionThresholds = { toolSuccessRateDrop: 0.005, p99RatioRise: 0.3, degradeRateRise: 0.005 }

function summary(verdict: ReleaseGateSummary['verdict'], numeric: Partial<ReleaseGateSummary['numeric']>): ReleaseGateSummary {
  return {
    verdict,
    checks: [],
    measuredCount: verdict === 'no_data' ? 0 : 3,
    gapKeys: [],
    basis: 'test',
    numeric: { toolSuccessRate: null, p99Ratio: null, degradeRate: null, ...numeric },
  }
}

describe('evaluateReleaseHold', () => {
  it('候选自身 fail → candidate_failed 先拦（绝对闸优先）', () => {
    const d = evaluateReleaseHold(summary('fail', { toolSuccessRate: 0.97 }), summary('pass', { toolSuccessRate: 0.99 }), T)
    expect(d.hold).toBe(true)
    expect(d.verdict).toBe('candidate_failed')
  })

  it('无基线 → 不 hold 但如实 no_baseline（不虚称已比对）', () => {
    const d = evaluateReleaseHold(summary('pass', { toolSuccessRate: 0.99 }), null, T)
    expect(d.hold).toBe(false)
    expect(d.verdict).toBe('no_baseline')
    expect(d.basis).toContain('无最近稳定版基线')
  })

  it('工具成功率跌超 0.5pp → regressed 禁发，明细含基线/候选/阈值', () => {
    const d = evaluateReleaseHold(
      summary('pass', { toolSuccessRate: 0.985, p99Ratio: 1.9, degradeRate: 0.003 }),
      summary('pass', { toolSuccessRate: 0.993, p99Ratio: 1.85, degradeRate: 0.002 }),
      T,
    )
    expect(d.hold).toBe(true)
    expect(d.verdict).toBe('regressed')
    expect(d.regressions.map((r) => r.metric)).toEqual(['tool_success'])
    expect(d.regressions[0].detail).toContain('0.993')
    expect(d.regressions[0].detail).toContain('0.985')
  })

  it('三项都在允许带内 → pass；no_data 指标跳过比对', () => {
    const d = evaluateReleaseHold(
      summary('pass', { toolSuccessRate: 0.991, p99Ratio: 2.0, degradeRate: null }),
      summary('pass', { toolSuccessRate: 0.993, p99Ratio: 1.9, degradeRate: 0.004 }),
      T,
    )
    expect(d.hold).toBe(false)
    expect(d.verdict).toBe('pass')
  })

  it('P99 与降级率同时越线 → 两项都列出', () => {
    const d = evaluateReleaseHold(
      summary('pass', { toolSuccessRate: 0.993, p99Ratio: 2.4, degradeRate: 0.012 }),
      summary('pass', { toolSuccessRate: 0.993, p99Ratio: 1.9, degradeRate: 0.004 }),
      T,
    )
    expect(d.verdict).toBe('regressed')
    expect(d.regressions.map((r) => r.metric)).toEqual(['p99_ratio', 'degrade_rate'])
  })
})
