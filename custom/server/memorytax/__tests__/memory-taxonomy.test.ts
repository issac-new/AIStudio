// auto memory 四类型守门（cc：四类型归档/新鲜度三档/stale 降权/fact 锚点纪律）。
import { describe, it, expect } from 'vitest'
import { MEMORY_TYPES, classifyMemories, freshnessOf, isMemoryType, memoryTypeSummary } from '../memory-taxonomy'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

describe('四类型+新鲜度（cc 语义）', () => {
  it('四类型冻结；新鲜度三档 7/30 天；stale 降权提示', () => {
    expect([...MEMORY_TYPES]).toEqual(['preference', 'convention', 'fact', 'lesson'])
    expect(isMemoryType('fact')).toBe(true)
    expect(isMemoryType('gossip')).toBe(false)
    expect(freshnessOf(NOW - DAY, NOW)).toMatchObject({ freshness: 'fresh', needsRecheck: false })
    expect(freshnessOf(NOW - 10 * DAY, NOW)).toMatchObject({ freshness: 'aging', needsRecheck: false })
    expect(freshnessOf(NOW - 40 * DAY, NOW)).toMatchObject({ freshness: 'stale', needsRecheck: true })
  })

  it('fact 缺锚点告警（400 done 同纪律）；类型分桶汇总', () => {
    const out = classifyMemories([
      { text: 'a', type: 'fact', at: NOW, anchor: 'auth.ts:61' },
      { text: 'b', type: 'fact', at: NOW },  // 缺锚点
      { text: 'c', type: 'lesson', at: NOW },
    ], NOW)
    expect(out[0].anchorMissing).toBeUndefined()
    expect(out[1].anchorMissing).toBe(true)
    expect(memoryTypeSummary(out)).toEqual({ preference: 0, convention: 0, fact: 2, lesson: 1 })
  })
})
