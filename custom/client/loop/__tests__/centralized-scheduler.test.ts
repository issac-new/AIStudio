// overlay/custom/client/loop/__tests__/centralized-scheduler.test.ts
import { describe, it, expect, vi } from 'vitest'
import { CentralizedScheduler } from '../../../server/loop/engine/centralized-scheduler'
import type { LoopStateStore } from '../../../server/loop/store/state-store'
import type { LoopInstance } from '../types'

function makeLoop(nextTickAt: string | null): LoopInstance {
  return {
    id: 'saas-loop', name: 'SaaS', goal: 'g', stopCondition: 's', pattern: 'daily-triage',
    schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'UTC' },
    stage: 'scheduling', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'saas',
    createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('CentralizedScheduler', () => {
  it('polls and ticks loops with past nextTickAt', async () => {
    const loop = makeLoop(new Date(Date.now() - 1000).toISOString())
    const store: Partial<LoopStateStore> = {
      listLoops: vi.fn().mockResolvedValue([loop]),
    }
    const engine = { tick: vi.fn().mockResolvedValue(undefined) }
    const sched = new CentralizedScheduler(store as any, engine as any, 100)
    await sched.poll()
    expect(engine.tick).toHaveBeenCalledWith('saas-loop')
  })

  it('skips loops with future nextTickAt', async () => {
    const loop = makeLoop(new Date(Date.now() + 3600_000).toISOString())
    const store: Partial<LoopStateStore> = {
      listLoops: vi.fn().mockResolvedValue([loop]),
    }
    const engine = { tick: vi.fn() }
    const sched = new CentralizedScheduler(store as any, engine as any, 100)
    await sched.poll()
    expect(engine.tick).not.toHaveBeenCalled()
  })

  it('skips non-idle loops', async () => {
    const loop = makeLoop(new Date(Date.now() - 1000).toISOString())
    loop.status = 'running'
    const store: Partial<LoopStateStore> = {
      listLoops: vi.fn().mockResolvedValue([loop]),
    }
    const engine = { tick: vi.fn() }
    const sched = new CentralizedScheduler(store as any, engine as any, 100)
    await sched.poll()
    expect(engine.tick).not.toHaveBeenCalled()
  })

  it('computeNextTick uses cron-parser v5 API', () => {
    const store: Partial<LoopStateStore> = { listLoops: vi.fn() }
    const sched = new CentralizedScheduler(store as any, {} as any)
    const next = sched.computeNextTick(makeLoop(null))
    expect(new Date(next).getTime()).toBeGreaterThan(Date.now())
  })
})
