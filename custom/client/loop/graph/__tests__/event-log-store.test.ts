import { describe, it, expect } from 'vitest'
import {
  InMemoryEventLogStore, createEventLogStore,
  type StoredCheckpoint,
} from '../../../../server/loop/graph/event-log-store'

const base = { runId: 'r1', graphId: 'g1', ts: 1000, kind: 'node.completed', payload: { ok: true } }

describe('InMemoryEventLogStore', () => {
  it('appends with monotonic seq and queries by run', async () => {
    const s = new InMemoryEventLogStore()
    const s1 = await s.append(base)
    const s2 = await s.append({ ...base, nodeId: 'n1', superStep: 0 })
    expect(s1).toBe(1); expect(s2).toBe(2)
    const all = await s.query('r1')
    expect(all).toHaveLength(2)
    expect(all[1].nodeId).toBe('n1')
    expect(await s.latestSeq('r1')).toBe(2)
    expect(await s.count('r1')).toBe(2)
    expect(await s.query('other')).toHaveLength(0)
  })

  it('filters by sinceSeq and kind', async () => {
    const s = new InMemoryEventLogStore()
    await s.append(base)
    await s.append({ ...base, kind: 'checkpoint.saved' })
    await s.append({ ...base, kind: 'node.failed' })
    expect(await s.query('r1', { sinceSeq: 1 })).toHaveLength(2)
    expect(await s.query('r1', { kind: 'node.failed' })).toHaveLength(1)
  })

  it('saves and retrieves checkpoints in order', async () => {
    const s = new InMemoryEventLogStore()
    const cp = (n: number): StoredCheckpoint => ({
      id: `cp-${n}`, runId: 'r1', graphId: 'g1', superStep: n,
      state: { count: n }, nextNodes: ['b'], pendingInterrupts: [],
      iterCounters: { 'b->a': n }, totalCost: 0.5, startedAtMs: 100,
      createdAt: new Date(1000 + n).toISOString(),
    })
    await s.saveCheckpoint(cp(0))
    await s.saveCheckpoint(cp(3))
    const latest = await s.getLatestCheckpoint('r1')
    expect(latest?.superStep).toBe(3)
    expect(latest?.iterCounters).toEqual({ 'b->a': 3 })
    expect((await s.listCheckpoints('r1')).map(c => c.superStep)).toEqual([0, 3])
    expect(await s.getLatestCheckpoint('nope')).toBeNull()
  })

  it('round-trips state payloads via JSON (no class instances)', async () => {
    const s = new InMemoryEventLogStore()
    await s.append({ ...base, payload: { nested: { arr: [1, 2] } } })
    const [e] = await s.query('r1')
    expect(e.payload).toEqual({ nested: { arr: [1, 2] } })
    expect(() => JSON.stringify(e)).not.toThrow()
  })
})

describe('createEventLogStore', () => {
  it('falls back to memory when no path given', () => {
    const s = createEventLogStore()
    expect(s).toBeInstanceOf(InMemoryEventLogStore)
  })
})
