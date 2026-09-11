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

  it('latest: per-run tail window under multi-run global-seq interleaving (2026-09-12 审查)', async () => {
    const s = new InMemoryEventLogStore()
    // seq 为跨 run 全局自增：r1 / r2 交错追加后，r1 的全局 seq 不连续
    await s.append(base)                    // r1 seq=1
    await s.append({ ...base, runId: 'r2' }) // r2 seq=2
    await s.append({ ...base, nodeId: 'n1' }) // r1 seq=3
    await s.append({ ...base, runId: 'r2' }) // r2 seq=4
    await s.append({ ...base, runId: 'r2' }) // r2 seq=5
    // r1 最新 2 条 = seq[1,3]，不受 r2 占据高位全局 seq 影响
    const tail = await s.query('r1', { latest: 2 })
    expect(tail.map(e => e.seq)).toEqual([1, 3])
    // 升序返回；latest 覆盖 limit（互斥语义）
    expect(await s.query('r2', { latest: 2, limit: 1 })).toHaveLength(2)
    expect(await s.query('r1', { latest: 0 })).toHaveLength(2)
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

  it('generates eid = <runId>-<seq> on append and returns it through query (P3 台账 幂等)', async () => {
    const s = new InMemoryEventLogStore()
    await s.append(base)
    await s.append({ ...base, nodeId: 'n1' })
    const all = await s.query('r1')
    expect(all.map(e => e.eid)).toEqual(['r1-1', 'r1-2'])
    // eid 全局可去重：同 run 内唯一，跨 run 不碰撞
    await s.append({ ...base, runId: 'r2' })
    expect((await s.query('r2'))[0]?.eid).toBe('r2-3')
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

  // 台账 #13（顺延 P4 清偿）：getSpec 返回深副本——调用方改写返回值不得污染 store 内存态
  it('getSpec returns a deep copy: mutating the result does not corrupt the store (台账 #13)', async () => {
    const s = new InMemoryEventLogStore()
    await s.saveSpec({ id: 'spec-1', version: 1, spec: { id: 'spec-1', nodes: ['a'], meta: { gateCommands: ['npm test'] } } })

    const got = await s.getSpec('spec-1')
    ;(got!.spec as { nodes: string[] }).nodes.push('HACK')
    ;((got!.spec as { meta: { gateCommands: string[] } }).meta).gateCommands.push('rm -rf /')
    got!.version = 99

    const reread = await s.getSpec('spec-1')
    expect(reread!.version).toBe(1)
    expect((reread!.spec as { nodes: string[] }).nodes).toEqual(['a'])
    expect((reread!.spec as { meta: { gateCommands: string[] } }).meta.gateCommands).toEqual(['npm test'])
    // 两次 getSpec 互不共享
    const a = await s.getSpec('spec-1')
    ;(a!.spec as { nodes: string[] }).nodes.push('X')
    const b = await s.getSpec('spec-1')
    expect((b!.spec as { nodes: string[] }).nodes).toEqual(['a'])
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

  it('generates eid = <runId>-<seq> in sqlite too (P3 台账 幂等)', async () => {
    const s = createEventLogStore(':memory:')
    await s.append(base)
    await s.append({ ...base, runId: 'r2' })
    expect((await s.query('r1'))[0]?.eid).toBe('r1-1')
    expect((await s.query('r2'))[0]?.eid).toBe('r2-2')
  })

  it('latest: per-run tail window in sqlite under multi-run global-seq interleaving (2026-09-12 审查)', async () => {
    const s = createEventLogStore(':memory:')
    await s.append(base)                       // r1 seq=1
    await s.append({ ...base, runId: 'r2' })   // r2 seq=2
    await s.append({ ...base, nodeId: 'n1' })  // r1 seq=3
    await s.append({ ...base, runId: 'r2' })   // r2 seq=4
    const tail = await s.query('r1', { latest: 1 })
    expect(tail.map(e => e.seq)).toEqual([3])
    expect(tail[0]?.nodeId).toBe('n1')
    expect(await s.query('r2', { latest: 10 })).toHaveLength(2)
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

  // P3 台账（T1 顺延 P4 清偿）：SQLite eid 升级守门——旧表（无 eid 列）打开后必须
  // 容错补列，新写事件带 eid、查询返回 eid。手工建旧 schema 再经工厂打开，模拟
  // "P3 eid 功能上线前创建的旧库升级"现场。
  it('upgrades an old-schema db (no eid column): ALTER backfills eid for new writes (P3 台账 eid 升级守门)', async () => {
    const { mkdtempSync, rmSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const { DatabaseSync } = await import('node:sqlite')
    const dir = mkdtempSync(join(tmpdir(), 'eid-upgrade-'))
    const dbPath = join(dir, 'old-events.sqlite')
    try {
      // 手工建旧 schema：graph_events 无 eid 列（P3 eid 功能之前的形态）
      const raw = new DatabaseSync(dbPath)
      raw.exec(`
        CREATE TABLE graph_events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL, graph_id TEXT NOT NULL, ts INTEGER NOT NULL,
          kind TEXT NOT NULL, node_id TEXT, iteration INTEGER, super_step INTEGER,
          payload TEXT NOT NULL
        );
        CREATE TABLE graph_checkpoints (
          id TEXT PRIMARY KEY, run_id TEXT NOT NULL, graph_id TEXT NOT NULL,
          super_step INTEGER NOT NULL, state TEXT NOT NULL, next_nodes TEXT NOT NULL,
          pending_interrupts TEXT NOT NULL, iter_counters TEXT NOT NULL,
          total_cost REAL NOT NULL, started_at_ms INTEGER NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE graph_specs (
          id TEXT PRIMARY KEY, version INTEGER NOT NULL, spec_json TEXT NOT NULL, updated_at TEXT NOT NULL
        );
      `)
      // 一条旧事件（无 eid 值可回填——读取方按无 eid 处理）
      raw.prepare(
        `INSERT INTO graph_events (run_id, graph_id, ts, kind, payload) VALUES (?, ?, ?, ?, ?)`,
      ).run('r-old', 'g1', 1000, 'run.started', '{}')
      raw.close()

      // 经工厂打开：构造器 ALTER 兜底补 eid 列（与 join_ledger 先例同款）
      const s = createEventLogStore(dbPath)
      expect(s.constructor.name).toBe('SqliteEventLogStore')

      // 旧事件可读，eid 缺省 undefined（前端按无 eid 兜底键）
      const old = await s.query('r-old')
      expect(old).toHaveLength(1)
      expect(old[0].eid).toBeUndefined()

      // 新写事件带 eid 且查询返回（升级后 append 的 UPDATE 回填路径可用）
      await s.append({ runId: 'r-old', graphId: 'g1', ts: 2000, kind: 'node.completed', nodeId: 'n', payload: {} })
      await s.append({ runId: 'r-new', graphId: 'g1', ts: 3000, kind: 'run.started', payload: {} })
      expect((await s.query('r-old'))[1]?.eid).toBe('r-old-2')
      expect((await s.query('r-new'))[0]?.eid).toBe('r-new-3')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
