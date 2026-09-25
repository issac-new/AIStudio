// rounds 表守门（G8：逐轮台账/费用 null 不显示/合计口径）。
import { describe, it, expect } from 'vitest'
import { buildRoundsTable, roundsSummary, type RoundEvent } from '../utils/rounds-table'

const ev = (over: Partial<RoundEvent>): RoundEvent => ({ kind: 'round', at: 0, ...over })

describe('rounds 表（dsh 台账语义）', () => {
  it('逐轮台账：模型/token/TTFT；费用未收录=null 不显示', () => {
    const rows = buildRoundsTable([
      ev({ at: 200, model: 'glm-4.7', inputTokens: 100, outputTokens: 50, ttftMs: 300 }),
      ev({ at: 100, model: 'unknown-model', inputTokens: 10, outputTokens: 5 }),
    ], () => null)  // 未收录 → null
    expect(rows[0].roundIndex).toBe(0)  // at 排序（100 在前）
    expect(rows[0].model).toBe('unknown-model')
    expect(rows[0].costIdle).toBeNull()
    expect(rows[1]).toMatchObject({ model: 'glm-4.7', ttftMs: 300 })
  })

  it('费用列经 costFn 计入；合计口径（部分 null→合计 null）', () => {
    const costFn = () => ({ idleCost: 1.5, peakCost: 3 })
    const rows = buildRoundsTable([ev({ model: 'm' }), ev({ model: 'm' })], costFn)
    expect(rows[0].costIdle).toBe(1.5)
    const sum = roundsSummary(rows)
    expect(sum).toMatchObject({ rounds: 2, totalCostIdle: 3, totalCostPeak: 6 })
    const partial = roundsSummary([rows[0], { ...rows[1], costIdle: null, costPeak: null }])
    expect(partial.totalCostIdle).toBeNull()  // 有 null 不虚报合计
    expect(roundsSummary([])).toMatchObject({ rounds: 0, totalCostIdle: null })
  })
})
