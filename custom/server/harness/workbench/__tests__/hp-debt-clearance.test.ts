// 冠军退役候选守门（2026-10-23 挂账清偿 G4，腾讯文误区九「拆墙」侧）。
import { describe, it, expect } from 'vitest'
import { RETIREMENT_MIN_ROUNDS_SINCE, evolutionReport, retirementCandidates } from '../loop'
import type { EvolutionSurface } from '../types'

function surface(over: Partial<EvolutionSurface> = {}): EvolutionSurface {
  return {
    surfaceKey: 'system_prompt',
    rounds: 3, proposalsTotal: 3, promoted: 3, rejected: 0, rolledBack: 0, open: 0,
    failedProbes: 0, stalled: false, pruneSuggested: false,
    timeline: [],
    ...over,
  }
}

function round(n: number, over: Partial<EvolutionSurface['timeline'][number]> = {}): EvolutionSurface['timeline'][number] {
  return {
    round: n, proposalId: `p${n}`, variantLabel: `v${n}`, promotedAt: `t${n}`, rolledBack: false,
    passAt1: 0.5, tokens: 1000, costUsd: 1, noiseDelta: null, passAt1Delta: 0.1,
    ...over,
  }
}

describe('retirementCandidates', () => {
  it('命中：增益 ≤0 ∧ 相对前轮变贵 ∧ 其后 ≥2 个已采纳轮', () => {
    const s = surface({
      timeline: [
        round(1, { passAt1Delta: 0.1, costUsd: 1, tokens: 1000 }),
        round(2, { passAt1Delta: -0.02, costUsd: 1.5, tokens: 1500 }), // 退役候选
        round(3, { passAt1Delta: 0.05, costUsd: 1.4, tokens: 1400 }),
        round(4, { passAt1Delta: 0.05, costUsd: 1.4, tokens: 1400 }),
      ],
    })
    const out = retirementCandidates([s])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ surfaceKey: 'system_prompt', round: 2, proposalId: 'p2', roundsSince: 2 })
    expect(out[0].costDeltaPct).toBeCloseTo(0.5, 3)
  })

  it('不命中：有增益 / 变便宜 / 后续轮数不足 / 已回滚', () => {
    const gain = surface({ timeline: [round(1), round(2, { passAt1Delta: 0.05, costUsd: 2 }), round(3), round(4)] })
    const cheaper = surface({ timeline: [round(1), round(2, { passAt1Delta: -0.02, costUsd: 0.5 }), round(3), round(4)] })
    const tooRecent = surface({ timeline: [round(1), round(2, { passAt1Delta: -0.02, costUsd: 2 }), round(3)] })
    const rolled = surface({ timeline: [round(1), round(2, { passAt1Delta: -0.02, costUsd: 2, rolledBack: true }), round(3), round(4)] })
    expect(retirementCandidates([gain, cheaper, tooRecent, rolled])).toEqual([])
  })

  it('首轮无前轮基线不判（缺比较对象）；成本缺读数退化用 token 次口径', () => {
    const first = surface({ timeline: [round(1, { passAt1Delta: -0.02, costUsd: 2 }), round(2), round(3)] })
    expect(retirementCandidates([first])).toEqual([])
    const tokenOnly = surface({ timeline: [round(1, { costUsd: null, tokens: 1000 }), round(2, { passAt1Delta: -0.02, costUsd: null, tokens: 2000 }), round(3), round(4)] })
    const out = retirementCandidates([tokenOnly])
    expect(out).toHaveLength(1)
    expect(out[0].costDeltaPct).toBeNull()
    expect(out[0].tokenDeltaPct).toBeCloseTo(1, 3)
  })

  it('门槛常量 =2（advisory 需要 ≥2 轮后续证据）', () => {
    expect(RETIREMENT_MIN_ROUNDS_SINCE).toBe(2)
  })
})

describe('evolutionReport 透出', () => {
  it('报告带 retirementCandidates 段（空数据=空数组，不造数）', () => {
    const r = evolutionReport(['system_prompt', 'skills'], [], [])
    expect(r.retirementCandidates).toEqual([])
  })
})
