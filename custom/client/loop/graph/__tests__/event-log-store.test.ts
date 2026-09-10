import { describe, it, expect, vi } from 'vitest'
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

  it('saveSpec/getSpec/listSpecs round-trip and upsert by id (P2 台账⑥)', async () => {
    const s = new InMemoryEventLogStore()
    expect(await s.listSpecs()).toEqual([])
    expect(await s.getSpec('spec-1')).toBeNull()
    await s.saveSpec({ id: 'spec-1', version: 1, spec: { id: 'spec-1', nodes: ['a'] } })
    await s.saveSpec({ id: 'spec-2', version: 3, spec: { id: 'spec-2', nodes: [] } })
    expect(await s.getSpec('spec-1')).toEqual({ id: 'spec-1', version: 1, spec: { id: 'spec-1', nodes: ['a'] } })
    const listed = await s.listSpecs()
    expect(listed.map(r => r.id)).toEqual(['spec-1', 'spec-2'])
    expect(listed[0].version).toBe(1)
    expect(typeof listed[0].updatedAt).toBe('string')
    // 同 id 重写 = upsert（旧 GraphSpecStore.save 的覆盖语义）
    await s.saveSpec({ id: 'spec-1', version: 2, spec: { id: 'spec-1', nodes: ['a', 'b'] } })
    expect(await s.getSpec('spec-1')).toEqual({ id: 'spec-1', version: 2, spec: { id: 'spec-1', nodes: ['a', 'b'] } })
    expect(await s.listSpecs()).toHaveLength(2)
  })
})

describe('createEventLogStore', () => {
  it('falls back to memory when no path given', () => {
    const s = createEventLogStore()
    expect(s).toBeInstanceOf(InMemoryEventLogStore)
  })
})

// --- node:sqlite 真实路径（Task 8）---
// vitest 在 node 环境跑，本进程 Node >= 22.5 自带 node:sqlite；
// 若某运行环境（旧 Node）无该内置模块，探测失败则整组 skip（测不了即不假装通过）。
const sqliteAvailable = await (async () => {
  try {
    const { DatabaseSync } = await import('node:sqlite')
    new DatabaseSync(':memory:').close()
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!sqliteAvailable)('createEventLogStore via node:sqlite', () => {
  it('instantiates a sqlite-backed store for :memory: and round-trips events/checkpoint/joinLedger', async () => {
    const s = createEventLogStore(':memory:')
    // 守门断言：better-sqlite3 时代此处静默降级为 InMemory；切到 node:sqlite 后必须真的拿到 Sqlite 实现
    expect(s.constructor.name).toBe('SqliteEventLogStore')

    // append/query/latestSeq/count 全链路
    const seq1 = await s.append(base)
    const seq2 = await s.append({ ...base, nodeId: 'n1', iteration: 2, superStep: 1 })
    expect(seq1).toBe(1); expect(seq2).toBe(2)
    const all = await s.query('r1')
    expect(all).toHaveLength(2)
    expect(all[1]).toMatchObject({ nodeId: 'n1', iteration: 2, superStep: 1, payload: { ok: true } })
    expect(await s.latestSeq('r1')).toBe(2)
    expect(await s.count('r1')).toBe(2)
    expect(await s.query('r1', { sinceSeq: 1 })).toHaveLength(1)
    expect(await s.query('r1', { kind: 'node.completed', limit: 1 })).toHaveLength(1)
    expect(await s.query('other')).toHaveLength(0)

    // checkpoint 全链路 + joinLedger 往返（Task 4 F2 引入的列）
    const cp: StoredCheckpoint = {
      id: 'cp-1', runId: 'r1', graphId: 'g1', superStep: 1,
      state: { count: 1 }, nextNodes: ['b'],
      pendingInterrupts: [{ nodeId: 'h', value: { q: 'ok?' }, id: 'i-1' }],
      iterCounters: { 'b->a': 2 }, totalCost: 1.5, startedAtMs: 42,
      createdAt: new Date(2000).toISOString(),
      joinLedger: { completed: ['a', 'b'], completedAtStep: { a: 0, b: 1 }, lastRunStep: { a: 0, b: 1 } },
    }
    await s.saveCheckpoint(cp)
    await s.saveCheckpoint({ ...cp, id: 'cp-3', superStep: 3 })
    const latest = await s.getLatestCheckpoint('r1')
    expect(latest?.id).toBe('cp-3')
    expect(latest?.joinLedger).toEqual(cp.joinLedger)
    expect(latest?.pendingInterrupts).toEqual(cp.pendingInterrupts)
    expect(latest?.iterCounters).toEqual({ 'b->a': 2 })
    expect((await s.listCheckpoints('r1')).map(c => c.superStep)).toEqual([1, 3])
    expect(await s.getLatestCheckpoint('nope')).toBeNull()
  })

  it('persists graph_specs in sqlite (P2 台账⑥): upsert + round-trip + list', async () => {
    const s = createEventLogStore(':memory:')
    expect(await s.listSpecs()).toEqual([])
    expect(await s.getSpec('loop-a')).toBeNull()
    await s.saveSpec({ id: 'loop-a', version: 1, spec: { id: 'loop-a', entryNode: 'discovery' } })
    await s.saveSpec({ id: 'loop-b', version: 2, spec: { id: 'loop-b', entryNode: 'gate' } })
    expect(await s.getSpec('loop-a')).toEqual({ id: 'loop-a', version: 1, spec: { id: 'loop-a', entryNode: 'discovery' } })
    expect((await s.listSpecs()).map(r => r.id)).toEqual(['loop-a', 'loop-b'])
    expect((await s.listSpecs())[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    await s.saveSpec({ id: 'loop-a', version: 5, spec: { id: 'loop-a', entryNode: 'handoff' } })
    expect((await s.getSpec('loop-a'))?.version).toBe(5)
    expect(await s.listSpecs()).toHaveLength(2)
  })

  it('warns once and falls back to InMemory when the sqlite path cannot be opened', () => {
    // Task 3 审查遗留：降级必须 warn，不能静默
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const s = createEventLogStore('/nonexistent-dir-task8/nope.sqlite')
      expect(s).toBeInstanceOf(InMemoryEventLogStore)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      warn.mockRestore()
    }
  })
})
