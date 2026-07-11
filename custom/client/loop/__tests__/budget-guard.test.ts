// overlay/custom/client/loop/__tests__/budget-guard.test.ts
import { describe, it, expect, vi } from 'vitest'
import { BudgetGuard } from '../../../server/loop/engine/budget-guard'
import type { LoopInstance, LoopEvent } from '../types'

function makeLoop(totalCost: number, maxTotal: number = 200): LoopInstance {
  return {
    id: 'test', name: 'Test', goal: 'g', stopCondition: 's',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: maxTotal, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost, currentIteration: 0 },
  }
}

describe('BudgetGuard', () => {
  it('allows when under budget', () => {
    const guard = new BudgetGuard(vi.fn())
    const result = guard.check(makeLoop(10))
    expect(result.allow).toBe(true)
  })

  it('warns at 80% threshold', () => {
    const events: LoopEvent[] = []
    const guard = new BudgetGuard((e) => { events.push(e) })
    guard.check(makeLoop(170, 200))
    expect(events.some(e => e.type === 'loop.budget-warning')).toBe(true)
  })

  it('denies when over budget with throw mode', () => {
    const guard = new BudgetGuard(vi.fn())
    const result = guard.check(makeLoop(250, 200))
    expect(result.allow).toBe(false)
    expect(result.action).toBe('throw')
  })

  it('kill mode returns kill action', () => {
    const loop = makeLoop(250, 200)
    loop.budget.killMode = 'kill'
    const guard = new BudgetGuard(vi.fn())
    const result = guard.check(loop)
    expect(result.action).toBe('kill')
  })
})
