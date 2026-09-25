// compaction 留痕卡守门（dsh P1-11：压缩不静默/影响范围/防复燃边界提示）。
import { describe, it, expect } from 'vitest'
import { buildCompactionCards, compactionSummary } from '../adapters/compaction-trace'

describe('compaction 留痕卡（压缩不静默）', () => {
  it('标记→卡序列：原因/影响范围/防复燃边界', () => {
    const cards = buildCompactionCards([
      { at: 100, reason: 'threshold', foldedMessages: 42, summaryChars: 800 },
      { at: 200, reason: 'manual' },
    ])
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ index: 0, reason: 'threshold', scopeText: '折叠 42 条进摘要', summaryChars: 800 })
    expect(cards[0].boundaryNote).toContain('防复燃')
    expect(cards[1].scopeText).toBe('折叠范围未记')  // 未记不伪造
  })

  it('摘要聚合：卡片数=压缩次数', () => {
    const cards = buildCompactionCards([
      { at: 1, foldedMessages: 10 }, { at: 2, foldedMessages: 20, reason: 'overflow' },
    ])
    expect(compactionSummary(cards)).toEqual({ count: 2, totalFolded: 30, lastReason: 'overflow' })
    expect(compactionSummary([])).toEqual({ count: 0, totalFolded: 0, lastReason: null })
  })
})
