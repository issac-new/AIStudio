// 用量台账守门（G7：日聚合/空日补 0/峰值并列取晚/streak 断点）。
import { describe, it, expect } from 'vitest'
import { buildUsageLedger } from '../utils/usage-ledger'

describe('用量台账（zcode usage-stats 契约）', () => {
  it('日聚合+空日补 0+峰值并列取更晚', () => {
    const ledger = buildUsageLedger([
      { day: '2026-09-20', tokens: 100 },
      { day: '2026-09-20', tokens: 50, turns: 1 },
      { day: '2026-09-22', tokens: 300 },
      { day: '2026-09-23', tokens: 300 },
    ], { fillDays: true })
    expect(ledger.daily.map((d) => d.day)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'])
    expect(ledger.daily[0]).toMatchObject({ tokens: 150, turns: 1 })
    expect(ledger.daily[1].tokens).toBe(0)  // 空日补 0
    expect(ledger.peakDay).toEqual({ day: '2026-09-23', tokens: 300 })  // 并列取更晚
    expect(ledger.activeDays).toBe(3)
  })

  it('streak 从最新活跃日往前连数，遇 0 断', () => {
    const ledger = buildUsageLedger([
      { day: '2026-09-18', tokens: 10 },
      { day: '2026-09-21', tokens: 10 },
      { day: '2026-09-22', tokens: 10 },
      { day: '2026-09-23', tokens: 10 },
    ], { fillDays: true })
    expect(ledger.currentStreakDays).toBe(3)  // 23/22/21 连续，20 断
    expect(ledger.totalTokens).toBe(40)
  })

  it('空输入→空台账零炸', () => {
    const ledger = buildUsageLedger([])
    expect(ledger).toMatchObject({ activeDays: 0, currentStreakDays: 0, totalTokens: 0, peakDay: null })
  })
})
