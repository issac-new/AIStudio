// goal 三预算显式化守门（kimi token/turn/wallClock：三段式解析/警示线/触顶维）。
import { describe, it, expect } from 'vitest'
import { buildThreeBudgets, parseThreeBudgets } from '../utils/goal-budget'

describe('三预算（kimi 语义）', () => {
  it('三维独立+80% 警示线+触顶判定', () => {
    const b = buildThreeBudgets([8, 10], [50, 1000], [5, 60])
    expect(b.turn.progress).toBe(0.8)
    expect(b.turn.warn).toBe(true)      // 越线
    expect(b.token.warn).toBe(false)
    expect(b.exhausted).toBeNull()
    const done = buildThreeBudgets([10, 10], [1, 2], [1, 2])
    expect(done.exhausted).toBe('turn')  // 轮先触顶
    const noMax = buildThreeBudgets([5, 0], [0, 0], [0, 0])
    expect(noMax.turn.progress).toBeNull()
    expect(noMax.turn.warn).toBe(false)  // 无上限不警示
  })

  it('三段式回执解析；任一段缺省该维无上限；无匹配回 null', () => {
    const b = parseThreeBudgets('goal 8/10 turns · 500/2000 tokens · 5/60 min')!
    expect(b.turn).toMatchObject({ used: 8, max: 10 })
    expect(b.token).toMatchObject({ used: 500, max: 2000 })
    expect(b.wallClock).toMatchObject({ used: 5, max: 60 })
    const partial = parseThreeBudgets('3/5 turns')!
    expect(partial.turn.max).toBe(5)
    expect(partial.token.max).toBe(0)   // 缺省无上限
    expect(parseThreeBudgets('no numbers here')).toBeNull()
    expect(parseThreeBudgets('')).toBeNull()
  })

  it('wallClock 触顶判定', () => {
    const b = buildThreeBudgets([1, 10], [1, 100], [60, 60])
    expect(b.exhausted).toBe('wallClock')
  })
})
