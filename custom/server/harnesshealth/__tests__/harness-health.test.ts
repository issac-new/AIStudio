// 工作台体检守门（qoder：五维评分/优化卡/损坏降级）。
import { describe, it, expect } from 'vitest'
import { harnessReport, type AssetFacts } from '../harness-health'

const facts = (over: Partial<AssetFacts> = {}): AssetFacts => ({
  counts: { rules: 5, memory: 3, skills: 2, mcp: 1, automations: 4 },
  broken: { rules: 0, memory: 0, skills: 0, mcp: 0, automations: 0 },
  ...over,
})

describe('五维体检（qoder 语义）', () => {
  it('五维评分（0=poor/有损=fair/余 good）；优化卡只给欠账维', () => {
    const r = harnessReport(facts())
    expect(r.dimensions.map((d) => d.score)).toEqual(['good', 'good', 'good', 'good', 'good'])
    expect(r.optimizationCards).toEqual([])

    const bad = harnessReport(facts({
      counts: { rules: 0, memory: 3, skills: 2, mcp: 1, automations: 4 },
      broken: { rules: 0, memory: 1, skills: 0, mcp: 0, automations: 0 },
    }))
    expect(bad.dimensions.find((d) => d.dimension === 'rules')!.score).toBe('poor')
    expect(bad.dimensions.find((d) => d.dimension === 'memory')!.score).toBe('fair')
    expect(bad.optimizationCards.map((c) => c.dimension)).toEqual(['rules', 'memory'])
    expect(bad.optimizationCards[0].suggestion).toContain('规则体系')
  })
})
