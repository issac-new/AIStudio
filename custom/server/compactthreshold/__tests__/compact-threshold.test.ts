// compact 阈值校准守门（minimax：reserve 公式/90% 线/三级建议）。
import { describe, it, expect } from 'vitest'
import { compactThreshold, reserveTokens } from '../compact-threshold'

describe('reserve 公式（minimax）', () => {
  it('reserve = 输出预算 + limit*5%（向上取整）', () => {
    expect(reserveTokens(100000, 8000)).toBe(13000)
    expect(reserveTokens(100001, 0)).toBe(5001)
  })
})

describe('90% 线三级建议', () => {
  it('under→soon→now 按 used 递进', () => {
    // limit 100k, budget 8k → reserve 13k, capacity 87k, trigger 78.3k
    const base = { limitTokens: 100000, outputBudget: 8000 }
    expect(compactThreshold({ ...base, usedTokens: 70000 }).level).toBe('under')
    const soon = compactThreshold({ ...base, usedTokens: 78300 })
    expect(soon.level).toBe('soon')
    expect(soon.headroom).toBe(0)
    const now = compactThreshold({ ...base, usedTokens: 87000 })
    expect(now.level).toBe('now')
  })

  it('headroom=触发线-used（负值=过线）', () => {
    const d = compactThreshold({ limitTokens: 100000, outputBudget: 8000, usedTokens: 79000 })
    expect(d.triggerTokens).toBe(78300)
    expect(d.headroom).toBe(-700)
    expect(d.level).toBe('soon') // 过触发线但未满 capacity
  })
})
