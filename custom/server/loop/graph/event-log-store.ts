// overlay/custom/server/loop/graph/event-log-store.ts
// EventLogStore — 图执行的 append-only 事实源
// 默认 InMemory（无路径时的测试/内存形态）；
// 生产经 createEventLogStore(path) 走 node:sqlite（Node 内置 DatabaseSync，零新依赖）
//
// 降级边界（台账 m 修正）：本文件对 node:sqlite 是顶层静态 import——
// 运行时缺少该内置模块时（package.json engines 声明 node >=23），import 即抛、
// 本模块加载失败，createEventLogStore 工厂根本不会执行；工厂的 try/catch 只兜
// "模块存在但建库失败"（路径不可写 / 文件损坏等），此时降级 InMemory 并 console.warn 一次，不静默。

import { DatabaseSync } from 'node:sqlite'
import type { SQLInputValue } from 'node:sqlite'

export interface GraphLogEvent {
  seq: number
  runId: string
  graphId: string
  ts: number
  kind: string
  nodeId?: string
  iteration?: number
  superStep?: number
  payload: Record<string, unknown>
  /** 事件幂等 id（P3 台账：history 双发/重连去重的根）＝ `<runId>-<seq>`，
   *  由 store 在 append 时生成并随事件持久化；前端按 eid 去重（Task 2 接线）。 */
  eid?: string
}

/** join 屏障簿记（可序列化）：随 checkpoint 进出，保证 resume 后 join 判定不丢前驱完成事实 */
export interface JoinLedger {
  /** 本 run 中已成功完成的节点 */
  completed: string[]
  /** 节点 → 最近一次完成的 superStep */
  completedAtStep: Record<string, number>
  /** 节点 → 最近一次被调度执行的 superStep */
  lastRunStep: Record<string, number>
}

export function emptyJoinLedger(): JoinLedger {
  return { completed: [], completedAtStep: {}, lastRunStep: {} }
}

export interface StoredCheckpoint {
  id: string
  runId: string
  graphId: string
  superStep: number
  state: Record<string, unknown>
  nextNodes: string[]
  /** raisedAtMs：interrupt 挂起时刻（P2 台账 h，超时策略判定用）；
   *  旧 checkpoint 可无此字段，读取方回退 checkpoint.createdAt */
  pendingInterrupts: Array<{ nodeId: string; value: unknown; id: string; raisedAtMs?: number }>
  iterCounters: Record<string, number>
  totalCost: number
  startedAtMs: number
  createdAt: string
  /** join 屏障簿记（Task 4 F2 引入；旧 checkpoint 可无此字段，读取方按 emptyJoinLedger 兜底） */
  joinLedger?: JoinLedger
}

export interface StoredGraphSpec {
  id: string
  version: number
  spec: unknown
}

export interface StoredGraphSpecMeta {
  id: string
  version: number
  updatedAt: string
}

export interface EventLogStore {
  append(e: Omit<GraphLogEvent, 'seq'>): Promise<number>
  query(runId: string, opts?: { sinceSeq?: number; limit?: number; kind?: string }): Promise<GraphLogEvent[]>
  latestSeq(runId: string): Promise<number>
  count(runId: string): Promise<number>
  saveCheckpoint(c: StoredCheckpoint): Promise<void>
  getLatestCheckpoint(runId: string): Promise<StoredCheckpoint | null>
  listCheckpoints(runId: string): Promise<StoredCheckpoint[]>
  /** 全部已知 run（runId → graphId），供 GraphService 重启后重建注册表 */
  listRuns(): Promise<Array<{ runId: string; graphId: string }>>
  /** GraphSpec 持久化（P2 台账⑥：替换 .loop/graph-specs.json 文件）。同 id 重写 = upsert */
  saveSpec(spec: StoredGraphSpec): Promise<void>
  getSpec(id: string): Promise<StoredGraphSpec | null>
  listSpecs(): Promise<StoredGraphSpecMeta[]>
}

export class InMemoryEventLogStore implements EventLogStore {
  private events: GraphLogEvent[] = []
  private checkpoints = new Map<string, StoredCheckpoint[]>()
  private specs = new Map<string, StoredGraphSpec & { updatedAt: string }>()

  async append(e: Omit<GraphLogEvent, 'seq'>): Promise<number> {
    const seq = this.events.length + 1
    this.events.push({ ...JSON.parse(JSON.stringify(e)), seq, eid: `${e.runId}-${seq}` })
    return seq
  }

  async query(runId: string, opts?: { sinceSeq?: number; limit?: number; kind?: string }): Promise<GraphLogEvent[]> {
    let out = this.events.filter(e => e.runId === runId)
    if (opts?.sinceSeq !== undefined) out = out.filter(e => e.seq > opts.sinceSeq!)
    if (opts?.kind !== undefined) out = out.filter(e => e.kind === opts.kind)
    if (opts?.limit !== undefined) out = out.slice(0, opts.limit)
    return out
  }

  async latestSeq(runId: string): Promise<number> {
    const evts = this.events.filter(e => e.runId === runId)
    return evts.length ? evts[evts.length - 1].seq : 0
  }

  async count(runId: string): Promise<number> {
    return this.events.filter(e => e.runId === runId).length
  }

  async saveCheckpoint(c: StoredCheckpoint): Promise<void> {
    const list = this.checkpoints.get(c.runId) ?? []
    list.push(JSON.parse(JSON.stringify(c)))
    this.checkpoints.set(c.runId, list)
  }

  async getLatestCheckpoint(runId: string): Promise<StoredCheckpoint | null> {
    const list = this.checkpoints.get(runId) ?? []
    return list.length ? list[list.length - 1] : null
  }

  async listCheckpoints(runId: string): Promise<StoredCheckpoint[]> {
    return [...(this.checkpoints.get(runId) ?? [])]
  }

  async listRuns(): Promise<Array<{ runId: string; graphId: string }>> {
    const seen = new Map<string, string>()
    for (const e of this.events) {
      if (!seen.has(e.runId)) seen.set(e.runId, e.graphId)
    }
    return [...seen.entries()].map(([runId, graphId]) => ({ runId, graphId }))
  }

  async saveSpec(spec: StoredGraphSpec): Promise<void> {
    this.specs.set(spec.id, { ...JSON.parse(JSON.stringify(spec)), updatedAt: new Date().toISOString() })
  }

  async getSpec(id: string): Promise<StoredGraphSpec | null> {
    const s = this.specs.get(id)
    return s ? { id: s.id, version: s.version, spec: s.spec } : null
  }

  async listSpecs(): Promise<StoredGraphSpecMeta[]> {
    return [...this.specs.values()].map(s => ({ id: s.id, version: s.version, updatedAt: s.updatedAt }))
  }
}

/** node:sqlite 实现（Node 内置 DatabaseSync，零新依赖；schema 见 spec §3.1，checkpoints 同库另表） */
class SqliteEventLogStore implements EventLogStore {
  constructor(private db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL, graph_id TEXT NOT NULL, ts INTEGER NOT NULL,
        kind TEXT NOT NULL, node_id TEXT, iteration INTEGER, super_step INTEGER,
        payload TEXT NOT NULL, eid TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_graph_events_run ON graph_events(run_id, seq);
      CREATE TABLE IF NOT EXISTS graph_checkpoints (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, graph_id TEXT NOT NULL,
        super_step INTEGER NOT NULL, state TEXT NOT NULL, next_nodes TEXT NOT NULL,
        pending_interrupts TEXT NOT NULL, iter_counters TEXT NOT NULL,
        total_cost REAL NOT NULL, started_at_ms INTEGER NOT NULL, created_at TEXT NOT NULL,
        join_ledger TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_graph_cp_run ON graph_checkpoints(run_id, super_step);
      CREATE TABLE IF NOT EXISTS graph_specs (
        id TEXT PRIMARY KEY, version INTEGER NOT NULL,
        spec_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `)
    // 已存在旧表（无 join_ledger 列）时容错升级；新表走 CREATE 带列，ALTER 必失败则忽略
    try {
      db.exec(`ALTER TABLE graph_checkpoints ADD COLUMN join_ledger TEXT`)
    } catch {
      // 列已存在（新表或已升级过的旧表）
    }
    // P3 台账（事件幂等）：旧 graph_events 表补 eid 列（同 join_ledger 先例）
    try {
      db.exec(`ALTER TABLE graph_events ADD COLUMN eid TEXT`)
    } catch {
      // 列已存在
    }
  }

  async append(e: Omit<GraphLogEvent, 'seq'>): Promise<number> {
    const r = this.db.prepare(
      `INSERT INTO graph_events (run_id, graph_id, ts, kind, node_id, iteration, super_step, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(e.runId, e.graphId, e.ts, e.kind, e.nodeId ?? null, e.iteration ?? null, e.superStep ?? null, JSON.stringify(e.payload))
    const seq = Number(r.lastInsertRowid)
    // eid = <runId>-<seq>（seq 即 AUTOINCREMENT rowid）；回填同 insert 一样走本库，失败不阻断追加
    try {
      this.db.prepare(`UPDATE graph_events SET eid = ? WHERE seq = ?`).run(`${e.runId}-${seq}`, seq)
    } catch {
      // 旧库补列失败（理论上构造时已容错）→ eid 缺失，读取方按无 eid 处理
    }
    return seq
  }

  async query(runId: string, opts?: { sinceSeq?: number; limit?: number; kind?: string }): Promise<GraphLogEvent[]> {
    let sql = `SELECT * FROM graph_events WHERE run_id = ?`
    const args: SQLInputValue[] = [runId]
    if (opts?.sinceSeq !== undefined) { sql += ` AND seq > ?`; args.push(opts.sinceSeq) }
    if (opts?.kind !== undefined) { sql += ` AND kind = ?`; args.push(opts.kind) }
    sql += ` ORDER BY seq`
    if (opts?.limit !== undefined) { sql += ` LIMIT ?`; args.push(opts.limit) }
    return (this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>).map(rowToEvent)
  }

  async latestSeq(runId: string): Promise<number> {
    const row = this.db.prepare(`SELECT MAX(seq) AS m FROM graph_events WHERE run_id = ?`).get(runId) as { m: number | null }
    return row.m ?? 0
  }

  async count(runId: string): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM graph_events WHERE run_id = ?`).get(runId) as { c: number }
    return row.c
  }

  async saveCheckpoint(c: StoredCheckpoint): Promise<void> {
    this.db.prepare(
      `INSERT INTO graph_checkpoints
       (id, run_id, graph_id, super_step, state, next_nodes, pending_interrupts, iter_counters, total_cost, started_at_ms, created_at, join_ledger)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(c.id, c.runId, c.graphId, c.superStep, JSON.stringify(c.state), JSON.stringify(c.nextNodes),
      JSON.stringify(c.pendingInterrupts), JSON.stringify(c.iterCounters), c.totalCost, c.startedAtMs, c.createdAt,
      JSON.stringify(c.joinLedger ?? emptyJoinLedger()))
  }

  async getLatestCheckpoint(runId: string): Promise<StoredCheckpoint | null> {
    const row = this.db.prepare(
      `SELECT * FROM graph_checkpoints WHERE run_id = ? ORDER BY super_step DESC LIMIT 1`,
    ).get(runId) as Record<string, unknown> | undefined
    return row ? rowToCheckpoint(row) : null
  }

  async listCheckpoints(runId: string): Promise<StoredCheckpoint[]> {
    const rows = this.db.prepare(
      `SELECT * FROM graph_checkpoints WHERE run_id = ? ORDER BY super_step`,
    ).all(runId) as Array<Record<string, unknown>>
    return rows.map(rowToCheckpoint)
  }

  async listRuns(): Promise<Array<{ runId: string; graphId: string }>> {
    const rows = this.db.prepare(
      `SELECT run_id, MIN(graph_id) AS graph_id FROM graph_events GROUP BY run_id ORDER BY MIN(seq)`,
    ).all() as Array<Record<string, unknown>>
    return rows.map(r => ({ runId: r.run_id as string, graphId: r.graph_id as string }))
  }

  async saveSpec(spec: StoredGraphSpec): Promise<void> {
    this.db.prepare(
      `INSERT OR REPLACE INTO graph_specs (id, version, spec_json, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(spec.id, spec.version, JSON.stringify(spec.spec), new Date().toISOString())
  }

  async getSpec(id: string): Promise<StoredGraphSpec | null> {
    const row = this.db.prepare(
      `SELECT id, version, spec_json FROM graph_specs WHERE id = ?`,
    ).get(id) as Record<string, unknown> | undefined
    return row ? { id: row.id as string, version: row.version as number, spec: JSON.parse(row.spec_json as string) } : null
  }

  async listSpecs(): Promise<StoredGraphSpecMeta[]> {
    const rows = this.db.prepare(
      `SELECT id, version, updated_at FROM graph_specs ORDER BY rowid`,
    ).all() as Array<Record<string, unknown>>
    return rows.map(r => ({ id: r.id as string, version: r.version as number, updatedAt: r.updated_at as string }))
  }
}

function rowToEvent(r: Record<string, unknown>): GraphLogEvent {
  return {
    seq: r.seq as number, runId: r.run_id as string, graphId: r.graph_id as string,
    ts: r.ts as number, kind: r.kind as string,
    nodeId: (r.node_id as string) ?? undefined,
    iteration: (r.iteration as number) ?? undefined,
    superStep: (r.super_step as number) ?? undefined,
    payload: JSON.parse(r.payload as string),
    eid: (r.eid as string) ?? undefined,
  }
}

function rowToCheckpoint(r: Record<string, unknown>): StoredCheckpoint {
  return {
    id: r.id as string, runId: r.run_id as string, graphId: r.graph_id as string,
    superStep: r.super_step as number,
    state: JSON.parse(r.state as string),
    nextNodes: JSON.parse(r.next_nodes as string),
    pendingInterrupts: JSON.parse(r.pending_interrupts as string),
    iterCounters: JSON.parse(r.iter_counters as string),
    totalCost: r.total_cost as number,
    startedAtMs: r.started_at_ms as number,
    createdAt: r.created_at as string,
    // 旧行无 join_ledger 列值（NULL）→ 兜底空簿记
    joinLedger: r.join_ledger ? JSON.parse(r.join_ledger as string) as JoinLedger : emptyJoinLedger(),
  }
}

/** 工厂：给路径且 node:sqlite 可创建 → SQLite；否则降级 InMemory 并 warn 一次 */
export function createEventLogStore(sqlitePath?: string): EventLogStore {
  if (sqlitePath) {
    try {
      return new SqliteEventLogStore(new DatabaseSync(sqlitePath))
    } catch (err) {
      // 创建失败（路径不可写 / node:sqlite 不可用）→ 显式告警后降级，不静默
      console.warn(`[event-log-store] SQLite 创建失败，降级为 InMemory（path=${sqlitePath}）:`, err)
    }
  }
  return new InMemoryEventLogStore()
}
