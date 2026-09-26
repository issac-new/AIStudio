// v2 触发判定守门（407 自注前置条件：反馈到量才合成；簇门槛；陈旧标记）。
import { describe, it, expect } from 'vitest'
import { distillV2Gate, type DistillCandidate } from '../distill-v2-gate'

const NOW = 1_700_000_000_000
const DAY = 24 * 3600 * 1000
const cand = (id: string, chars: number, lastHitAt: number | null = NOW): DistillCandidate => ({ memoryId: id, chars, lastHitAt })
const cluster = () => [cand('a', 300), cand('b', 250), cand('c', 200)]

describe('distillV2Gate', () => {
  it('反馈未到量：feedbackReady=false 不合成（407 自注前置条件）', () => {
    const d = distillV2Gate({ queryCount: 10, repeatHitRate: 0.5 }, cluster(), NOW)
    expect(d.feedbackReady).toBe(false)
    expect(d.worthSynthesizing).toBe(false)
    expect(d.reason).toContain('前置条件未到')
  })

  it('反馈到量+簇够大：值得合成', () => {
    const d = distillV2Gate({ queryCount: 80, repeatHitRate: 0.3 }, cluster(), NOW)
    expect(d.feedbackReady).toBe(true)
    expect(d.worthSynthesizing).toBe(true)
  })

  it('簇太小不值得；陈旧项（>30 天未命中/从未命中）标记', () => {
    const small = distillV2Gate({ queryCount: 80, repeatHitRate: 0.3 }, [cand('a', 100), cand('b', 90)], NOW)
    expect(small.worthSynthesizing).toBe(false)
    expect(small.reason).toContain('簇太小')
    const stale = distillV2Gate(
      { queryCount: 80, repeatHitRate: 0.3 },
      [cand('fresh', 300), cand('old', 250, NOW - 31 * DAY), cand('never', 200, null)],
      NOW,
    )
    expect(stale.worthSynthesizing).toBe(true)
    expect(stale.staleIds).toEqual(['old', 'never'])
  })
})
