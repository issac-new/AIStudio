// brief 前缀稳定缓存守门（multica：公共前缀/词边界回退/链收益）。
import { describe, it, expect } from 'vitest'
import { briefChainSavings, diffBrief } from '../brief-cache'

describe('brief 前缀 diff（稳定段+变更段）', () => {
  it('首版全 delta；公共前缀提取+词边界回退', () => {
    expect(diffBrief(null, 'hello world')).toEqual({ stablePrefix: '', delta: 'hello world', prefixChars: 0 })
    const d = diffBrief('fix the login bug', 'fix the signup bug')
    expect(d.stablePrefix).toBe('fix the ')
    expect(d.delta).toBe('signup bug')
    // 词中回退：'ab cd' vs 'ab ce' 前缀断在 'c'——回退到词边界 'ab '。
    const w = diffBrief('ab cd', 'ab ce')
    expect(w.stablePrefix).toBe('ab ')
    expect(w.delta).toBe('ce')
  })

  it('链收益统计（缓存节省百分比）', () => {
    const s = briefChainSavings(['aaa bbb ccc', 'aaa bbb ddd', 'aaa bbb ddd'])
    expect(s.savedChars).toBeGreaterThan(0)
    expect(s.savedPct).toBeGreaterThan(30)  // 后两轮稳定前缀长
    expect(briefChainSavings([])).toEqual({ totalChars: 0, savedChars: 0, savedPct: 0 })
  })
})
