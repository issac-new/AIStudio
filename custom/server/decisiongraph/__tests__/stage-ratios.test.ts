import { describe, expect, it } from 'vitest'
import { MIN_STAGE_SAMPLE, stageRatios } from '../stage-ratios'
import type { BridgeDecision } from '../semantica-client'

function d(patch: Partial<BridgeDecision> = {}): BridgeDecision {
  return {
    id: Math.random().toString(36).slice(2),
    category: 'dispatch',
    scenario: 's',
    outcome: 'approved',
    confidence: 0.8,
    ...patch,
  }
}

describe('stageRatios：决策权审计两比例', () => {
  it('无记录时 available=false 且 gap 说明原因', () => {
    const r = stageRatios([])
    expect(r.available).toBe(false)
    expect(r.designShare).toBeNull()
    expect(r.vetoRate).toBeNull()
    expect(r.gap).toContain('无带介入阶段')
  })

  it('样本充足时两比例可算', () => {
    const rows = [
      ...Array.from({ length: 4 }, () => d({ stage: 'design' })),
      ...Array.from({ length: 4 }, () => d({ stage: 'implement' })),
      ...Array.from({ length: 2 }, () => d({ stage: 'review', outcome: 'rejected' })),
    ]
    const r = stageRatios(rows)
    expect(r.staged).toBe(10)
    expect(r.distribution.design).toBe(4)
    expect(r.designShare).toBeCloseTo(0.4, 4)
    // rejected 2 / (approved 8 + rejected 2) = 0.2
    expect(r.vetoRate).toBeCloseTo(0.2, 4)
    expect(r.available).toBe(true)
  })

  it('deferred 不进否决率分母（否则否决率被稀释）', () => {
    const rows = [
      ...Array.from({ length: 5 }, () => d({ stage: 'design', outcome: 'approved' })),
      ...Array.from({ length: 5 }, () => d({ stage: 'design', outcome: 'rejected' })),
      ...Array.from({ length: 20 }, () => d({ stage: 'design', outcome: 'deferred' })),
    ]
    const r = stageRatios(rows)
    expect(r.vetoRate).toBeCloseTo(0.5, 4)
  })

  it('缺 stage 的存量记录单独计数，不进分母', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => d({ stage: 'design' })),
      ...Array.from({ length: 7 }, () => d({ stage: null })),
      d({}),
    ]
    const r = stageRatios(rows)
    expect(r.staged).toBe(10)
    expect(r.unstaged).toBe(8)
    expect(r.designShare).toBe(1)
    expect(r.gap).toContain('8 条决策缺介入阶段')
  })

  it('样本低于下限时 available=false 但仍给示意值', () => {
    const rows = Array.from({ length: MIN_STAGE_SAMPLE - 1 }, () => d({ stage: 'design' }))
    const r = stageRatios(rows)
    expect(r.available).toBe(false)
    expect(r.designShare).toBe(1)
    expect(r.gap).toContain('低于下限')
  })

  it('无 approved/rejected 时否决率为 null 并报缺口', () => {
    const rows = Array.from({ length: 10 }, () => d({ stage: 'design', outcome: 'deferred' }))
    const r = stageRatios(rows)
    expect(r.vetoRate).toBeNull()
    expect(r.available).toBe(false)
    expect(r.gap).toContain('无分母')
  })

  it('未知 stage 值按缺阶段处理，不硬塞进某个阶段', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => d({ stage: 'design' })),
      d({ stage: 'bogus' as unknown as BridgeDecision['stage'] }),
    ]
    const r = stageRatios(rows)
    expect(r.unstaged).toBe(1)
    expect(r.distribution.design).toBe(10)
  })

  it('五阶段计数齐备（含 0 值）', () => {
    const r = stageRatios([d({ stage: 'initiate' })])
    expect(Object.keys(r.distribution).sort()).toEqual(['design', 'implement', 'initiate', 'posthoc', 'review'])
  })
})
