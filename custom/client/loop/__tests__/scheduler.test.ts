// overlay/custom/client/loop/__tests__/scheduler.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Scheduler } from '../../../server/loop/engine/scheduler'
import type { LoopStateStore } from '../../../server/loop/store/state-store'
import type { LoopInstance } from '../types'

function makeLoop(mode: 'cron' | 'manual' | 'webhook' = 'cron'): LoopInstance {
  return {
    id: 'sched-test', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage',
    schedule: { mode, cron: mode === 'cron' ? '0 9 * * *' : undefined, timezone: 'UTC' },
    stage: 'scheduling', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Scheduler', () => {
  it('computes next tick from cron expression', () => {
    const store = { listLoops: vi.fn() } as any
    const engine = { tick: vi.fn() } as any
    const wc = { enqueue: vi.fn() } as any
    const sched = new Scheduler(store, engine, wc)
    const next = sched.computeNextTick(makeLoop('cron'))
    expect(new Date(next).getTime()).toBeGreaterThan(Date.now())
  })

  it('does not schedule timer for manual mode', () => {
    const store = { listLoops: vi.fn().mockResolvedValue([]) } as any
    const engine = { tick: vi.fn() } as any
    const wc = { enqueue: vi.fn() } as any
    const sched = new Scheduler(store, engine, wc)
    sched.scheduleLoop(makeLoop('manual'))
    expect(engine.tick).not.toHaveBeenCalled()
  })
})
