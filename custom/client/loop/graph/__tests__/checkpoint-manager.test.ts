// overlay/custom/client/loop/graph/__tests__/checkpoint-manager.test.ts
import { describe, it, expect } from 'vitest'
import { CheckpointManager } from '../../../../server/loop/graph/checkpoint-manager'
import { InMemoryEventLogStore, type StoredCheckpoint } from '../../../../server/loop/graph/event-log-store'

const cp = (runId: string, step: number): StoredCheckpoint => ({
  id: `cp-${runId}-${step}`, runId, graphId: 'g', superStep: step,
  state: { count: step }, nextNodes: ['n'], pendingInterrupts: [],
  iterCounters: {}, totalCost: step * 0.1, startedAtMs: 1,
  createdAt: new Date(1000 + step).toISOString(),
})

describe('CheckpointManager', () => {
  it('saves and gets latest per run', async () => {
    const log = new InMemoryEventLogStore()
    const m = new CheckpointManager(log)
    await m.save(cp('r1', 0)); await m.save(cp('r1', 2)); await m.save(cp('r2', 5))
    expect((await m.getLatest('r1'))?.superStep).toBe(2)
    expect((await m.getLatest('r2'))?.superStep).toBe(5)
    expect((await m.list('r1')).map(c => c.superStep)).toEqual([0, 2])
    expect((await m.getAt('r1', 0))?.state.count).toBe(0)
  })

  it('fork copies checkpoint into a new run and logs run.forked', async () => {
    const log = new InMemoryEventLogStore()
    const m = new CheckpointManager(log)
    await m.save(cp('r1', 3))
    const forked = await m.fork('r1', 3, 'r2')
    expect(forked.runId).toBe('r2')
    expect(forked.state).toEqual({ count: 3 })
    expect(forked.id).not.toBe('cp-r1-3')
    const evts = await log.query('r2', { kind: 'run.forked' })
    expect(evts).toHaveLength(1)
    expect(evts[0].payload.fromRunId).toBe('r1')
    expect(evts[0].payload.fromSuperStep).toBe(3)
  })

  it('fork of missing checkpoint throws', async () => {
    const m = new CheckpointManager(new InMemoryEventLogStore())
    await expect(m.fork('nope', 0, 'r2')).rejects.toThrow()
  })
})
