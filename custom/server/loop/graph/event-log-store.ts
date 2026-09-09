// overlay/custom/server/loop/graph/event-log-store.ts
// EventLogStore — 图执行的 append-only 事实源
// 默认 InMemory（测试/Electron 无原生模块时降级）；
// 生产经 createEventLogStore(path) 走 better-sqlite3（动态 require，未安装则降级并 warn）

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
}

export interface StoredCheckpoint {
  id: string
  runId: string
  graphId: string
  superStep: number
  state: Record<string, unknown>
  nextNodes: string[]
  pendingInterrupts: Array<{ nodeId: string; value: unknown; id: string }>
  iterCounters: Record<string, number>
  totalCost: number
  startedAtMs: number
  createdAt: string
}

export interface EventLogStore {
  append(e: Omit<GraphLogEvent, 'seq'>): Promise<number>
  query(runId: string, opts?: { sinceSeq?: number; limit?: number; kind?: string }): Promise<GraphLogEvent[]>
  latestSeq(runId: string): Promise<number>
  count(runId: string): Promise<number>
  saveCheckpoint(c: StoredCheckpoint): Promise<void>
  getLatestCheckpoint(runId: string): Promise<StoredCheckpoint | null>
  listCheckpoints(runId: string): Promise<StoredCheckpoint[]>
}

export class InMemoryEventLogStore implements EventLogStore {
  private events: GraphLogEvent[] = []
  private checkpoints = new Map<string, StoredCheckpoint[]>()

  async append(e: Omit<GraphLogEvent, 'seq'>): Promise<number> {
    const seq = this.events.length + 1
    this.events.push({ ...JSON.parse(JSON.stringify(e)), seq })
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
}

/** better-sqlite3 实现（可选依赖；schema 见 spec §3.1，checkpoints 同库另表） */
class SqliteEventLogStore implements EventLogStore {
  constructor(private db: import('better-sqlite3').Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL, graph_id TEXT NOT NULL, ts INTEGER NOT NULL,
        kind TEXT NOT NULL, node_id TEXT, iteration INTEGER, super_step INTEGER,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_events_run ON graph_events(run_id, seq);
      CREATE TABLE IF NOT EXISTS graph_checkpoints (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, graph_id TEXT NOT NULL,
        super_step INTEGER NOT NULL, state TEXT NOT NULL, next_nodes TEXT NOT NULL,
        pending_interrupts TEXT NOT NULL, iter_counters TEXT NOT NULL,
        total_cost REAL NOT NULL, started_at_ms INTEGER NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_cp_run ON graph_checkpoints(run_id, super_step);
    `)
  }

  async append(e: Omit<GraphLogEvent, 'seq'>): Promise<number> {
    const r = this.db.prepare(
      `INSERT INTO graph_events (run_id, graph_id, ts, kind, node_id, iteration, super_step, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(e.runId, e.graphId, e.ts, e.kind, e.nodeId ?? null, e.iteration ?? null, e.superStep ?? null, JSON.stringify(e.payload))
    return Number(r.lastInsertRowid)
  }

  async query(runId: string, opts?: { sinceSeq?: number; limit?: number; kind?: string }): Promise<GraphLogEvent[]> {
    let sql = `SELECT * FROM graph_events WHERE run_id = ?`
    const args: unknown[] = [runId]
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
       (id, run_id, graph_id, super_step, state, next_nodes, pending_interrupts, iter_counters, total_cost, started_at_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(c.id, c.runId, c.graphId, c.superStep, JSON.stringify(c.state), JSON.stringify(c.nextNodes),
      JSON.stringify(c.pendingInterrupts), JSON.stringify(c.iterCounters), c.totalCost, c.startedAtMs, c.createdAt)
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
}

function rowToEvent(r: Record<string, unknown>): GraphLogEvent {
  return {
    seq: r.seq as number, runId: r.run_id as string, graphId: r.graph_id as string,
    ts: r.ts as number, kind: r.kind as string,
    nodeId: (r.node_id as string) ?? undefined,
    iteration: (r.iteration as number) ?? undefined,
    superStep: (r.super_step as number) ?? undefined,
    payload: JSON.parse(r.payload as string),
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
  }
}

/** 工厂：给路径且 better-sqlite3 可用 → SQLite；否则内存降级 */
export function createEventLogStore(sqlitePath?: string): EventLogStore {
  if (sqlitePath) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3')
      return new SqliteEventLogStore(new Database(sqlitePath))
    } catch {
      // 原生模块不可用时降级（Electron 未重建 / 测试环境）
    }
  }
  return new InMemoryEventLogStore()
}
