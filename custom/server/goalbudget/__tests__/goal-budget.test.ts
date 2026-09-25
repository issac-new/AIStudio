// 三预算显式化守门（八源归一：三维独立触顶/剩余量/累加）。
import { describe, it, expect } from 'vitest'
import { budgetCheck, advanceUsage, type GoalBudget, type GoalUsage } from '../goal-budget'

const budget: GoalBudget = { maxSteps: 10, maxTokens: 1000, maxWallClockMs: 60000 }
const usage = (over: Partial<GoalUsage> = {}): GoalUsage => ({ steps: 3, tokens: 200, elapsedMs: 5000, ...over })

describe('budgetCheck（三维独立触顶）', () => {
  it('未触顶：exhausted=false，剩余量正确', () => {
    const d = budgetCheck(budget, usage())
    expect(d.exhausted).toBe(false)
    expect(d.breached).toEqual([])
    expect(d.remaining).toEqual({ steps: 7, tokens: 800, wallclock: 55000 })
  })

  it('任一维触顶即 exhausted 并列出触顶维度', () => {
    expect(budgetCheck(budget, usage({ steps: 10 })).breached).toEqual(['steps'])
    expect(budgetCheck(budget, usage({ tokens: 1000 })).breached).toEqual(['tokens'])
    expect(budgetCheck(budget, usage({ elapsedMs: 60000 })).breached).toEqual(['wallclock'])
    const all = budgetCheck(budget, usage({ steps: 12, tokens: 2000, elapsedMs: 70000 }))
    expect(all.exhausted).toBe(true)
    expect(all.breached).toEqual(['steps', 'tokens', 'wallclock'])
    expect(all.remaining).toEqual({ steps: 0, tokens: 0, wallclock: 0 })
  })
})

describe('advanceUsage（幂等累加）', () => {
  it('缺省维度不回退', () => {
    expect(advanceUsage(usage(), { steps: 2 })).toEqual(usage({ steps: 5 }))
  })
})
