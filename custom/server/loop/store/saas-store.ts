// overlay/custom/server/loop/store/saas-store.ts
import { Pool } from 'pg'
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent,
  DriftReport, LoopFilter, ContractFilter,
} from '../../../client/loop/types'
import type { LoopStateStore } from './state-store'

export interface SaaSStoreConfig {
  connectionString: string
  tenantId: string
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS loops (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  goal TEXT NOT NULL,
  stop_condition TEXT,
  pattern TEXT NOT NULL,
  schedule JSONB NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  autonomy_level TEXT NOT NULL,
  budget JSONB NOT NULL,
  stats JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_tick_at TIMESTAMPTZ,
  next_tick_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS loop_contracts (
  id TEXT PRIMARY KEY,
  loop_id TEXT NOT NULL REFERENCES loops(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  source JSONB NOT NULL,
  read_plan JSONB NOT NULL,
  write_boundary TEXT[] NOT NULL,
  verification_spec JSONB NOT NULL,
  result_template JSONB NOT NULL,
  worktree_id TEXT,
  assignee TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loop_verifications (
  id SERIAL PRIMARY KEY,
  contract_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  results JSONB NOT NULL,
  overall TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loop_events (
  id BIGSERIAL PRIMARY KEY,
  loop_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_loop_ts ON loop_events (loop_id, ts DESC);
`

export class SaaSStore implements LoopStateStore {
  private pool: Pool
  private tenantId: string

  constructor(config: SaaSStoreConfig) {
    this.pool = new Pool({ connectionString: config.connectionString })
    this.tenantId = config.tenantId
  }

  async init(): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query(SCHEMA_SQL)
      // Enable RLS
      await client.query('ALTER TABLE loops ENABLE ROW LEVEL SECURITY')
      await client.query('ALTER TABLE loop_contracts ENABLE ROW LEVEL SECURITY')
      await client.query('ALTER TABLE loop_verifications ENABLE ROW LEVEL SECURITY')
      await client.query('ALTER TABLE loop_events ENABLE ROW LEVEL SECURITY')
      // Create policies (idempotent)
      await client.query(`
        CREATE POLICY IF NOT EXISTS tenant_isolation_loops ON loops
          USING (tenant_id = current_setting('app.tenant_id', true))
      `)
      await client.query(`
        CREATE POLICY IF NOT EXISTS tenant_isolation_contracts ON loop_contracts
          USING (tenant_id = current_setting('app.tenant_id', true))
      `)
      await client.query(`
        CREATE POLICY IF NOT EXISTS tenant_isolation_verifications ON loop_verifications
          USING (tenant_id = current_setting('app.tenant_id', true))
      `)
      await client.query(`
        CREATE POLICY IF NOT EXISTS tenant_isolation_events ON loop_events
          USING (tenant_id = current_setting('app.tenant_id', true))
      `)
    } finally {
      client.release()
    }
  }

  private async query(text: string, params?: unknown[]) {
    const client = await this.pool.connect()
    try {
      await client.query(`SET LOCAL app.tenant_id = '${this.tenantId}'`)
      return await client.query(text, params)
    } finally {
      client.release()
    }
  }

  async createLoop(loop: LoopInstance): Promise<void> {
    await this.query(
      `INSERT INTO loops (id, tenant_id, name, goal, stop_condition, pattern, schedule, stage, status, autonomy_level, budget, stats)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [loop.id, this.tenantId, loop.name, loop.goal, loop.stopCondition, loop.pattern,
       JSON.stringify(loop.schedule), loop.stage, loop.status, loop.autonomyLevel,
       JSON.stringify(loop.budget), JSON.stringify(loop.stats)],
    )
  }

  async getLoop(id: string): Promise<LoopInstance | null> {
    const res = await this.query('SELECT * FROM loops WHERE id = $1', [id])
    if (res.rows.length === 0) return null
    return this.rowToLoop(res.rows[0])
  }

  async listLoops(filter?: LoopFilter): Promise<LoopInstance[]> {
    let sql = 'SELECT * FROM loops'
    const params: unknown[] = []
    if (filter?.status && filter.status.length > 0) {
      params.push(filter.status)
      sql += ` WHERE status = ANY($1)`
    }
    sql += ' ORDER BY updated_at DESC'
    const res = await this.query(sql, params)
    return res.rows.map(this.rowToLoop)
  }

  async updateLoop(id: string, patch: Partial<LoopInstance>): Promise<void> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (patch.name) { sets.push(`name = $${idx++}`); params.push(patch.name) }
    if (patch.goal) { sets.push(`goal = $${idx++}`); params.push(patch.goal) }
    if (patch.stage) { sets.push(`stage = $${idx++}`); params.push(patch.stage) }
    if (patch.status) { sets.push(`status = $${idx++}`); params.push(patch.status) }
    if (patch.autonomyLevel) { sets.push(`autonomy_level = $${idx++}`); params.push(patch.autonomyLevel) }
    if (patch.budget) { sets.push(`budget = $${idx++}`); params.push(JSON.stringify(patch.budget)) }
    if (patch.stats) { sets.push(`stats = $${idx++}`); params.push(JSON.stringify(patch.stats)) }
    if (patch.nextTickAt) { sets.push(`next_tick_at = $${idx++}`); params.push(patch.nextTickAt) }
    if (patch.lastTickAt) { sets.push(`last_tick_at = $${idx++}`); params.push(patch.lastTickAt) }
    sets.push(`updated_at = NOW()`)
    params.push(id)

    if (sets.length > 0) {
      await this.query(`UPDATE loops SET ${sets.join(', ')} WHERE id = $${idx}`, params)
    }
  }

  async deleteLoop(id: string): Promise<void> {
    await this.query('DELETE FROM loops WHERE id = $1', [id])
  }

  async appendContract(contract: TaskContract): Promise<void> {
    await this.query(
      `INSERT INTO loop_contracts (id, loop_id, tenant_id, source, read_plan, write_boundary, verification_spec, result_template, worktree_id, assignee, status, attempts, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET status = $11, attempts = $12, worktree_id = $9`,
      [contract.id, contract.loopId, this.tenantId,
       JSON.stringify(contract.source), JSON.stringify(contract.readPlan),
       contract.writeBoundary, JSON.stringify(contract.verificationIntent),
       JSON.stringify(contract.resultTemplate), contract.worktreeId,
       contract.assignee, contract.status, contract.attempts, contract.maxAttempts],
    )
  }

  async getContract(id: string): Promise<TaskContract | null> {
    const res = await this.query('SELECT * FROM loop_contracts WHERE id = $1', [id])
    if (res.rows.length === 0) return null
    return this.rowToContract(res.rows[0])
  }

  async queryContracts(loopId: string, filter?: ContractFilter): Promise<TaskContract[]> {
    let sql = 'SELECT * FROM loop_contracts WHERE loop_id = $1'
    const params: unknown[] = [loopId]
    if (filter?.status && filter.status.length > 0) {
      params.push(filter.status)
      sql += ` AND status = ANY($2)`
    }
    const res = await this.query(sql, params)
    return res.rows.map(this.rowToContract)
  }

  async updateContract(id: string, patch: Partial<TaskContract>): Promise<void> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (patch.status) { sets.push(`status = $${idx++}`); params.push(patch.status) }
    if (patch.attempts !== undefined) { sets.push(`attempts = $${idx++}`); params.push(patch.attempts) }
    if (patch.worktreeId !== undefined) { sets.push(`worktree_id = $${idx++}`); params.push(patch.worktreeId) }
    if (patch.assignee) { sets.push(`assignee = $${idx++}`); params.push(patch.assignee) }
    params.push(id)
    if (sets.length > 0) {
      await this.query(`UPDATE loop_contracts SET ${sets.join(', ')} WHERE id = $${idx}`, params)
    }
  }

  async appendVerification(record: VerificationRecord): Promise<void> {
    await this.query(
      'INSERT INTO loop_verifications (contract_id, tenant_id, results, overall) VALUES ($1, $2, $3, $4)',
      [record.contractId, this.tenantId, JSON.stringify(record.results), record.overall],
    )
  }

  async appendEvent(event: LoopEvent): Promise<void> {
    const loopId = 'loopId' in event ? event.loopId : (event as any).loop?.id
    if (!loopId) return
    await this.query(
      'INSERT INTO loop_events (loop_id, tenant_id, event_type, payload, ts) VALUES ($1, $2, $3, $4, $5)',
      [loopId, this.tenantId, event.type, JSON.stringify(event), (event as any).ts ?? new Date().toISOString()],
    )
  }

  async queryEvents(loopId: string, since?: string, limit?: number): Promise<LoopEvent[]> {
    let sql = 'SELECT payload FROM loop_events WHERE loop_id = $1'
    const params: unknown[] = [loopId]
    if (since) {
      params.push(since)
      sql += ` AND ts > $2`
    }
    sql += ' ORDER BY ts ASC'
    if (limit) {
      params.push(limit)
      sql += ` LIMIT $${params.length}`
    }
    const res = await this.query(sql, params)
    return res.rows.map(r => r.payload as LoopEvent)
  }

  async detectDrift(_loopId: string): Promise<DriftReport> {
    return { hasDrift: false, details: 'PostgreSQL is the single source of truth' }
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  private rowToLoop(row: any): LoopInstance {
    return {
      id: row.id,
      name: row.name,
      goal: row.goal,
      stopCondition: row.stop_condition ?? '',
      pattern: row.pattern,
      schedule: row.schedule,
      stage: row.stage,
      status: row.status,
      autonomyLevel: row.autonomy_level,
      stateAdapter: 'saas',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      lastTickAt: row.last_tick_at?.toISOString() ?? null,
      nextTickAt: row.next_tick_at?.toISOString() ?? null,
      budget: row.budget,
      stats: row.stats,
    }
  }

  private rowToContract(row: any): TaskContract {
    return {
      id: row.id,
      loopId: row.loop_id,
      source: row.source,
      readPlan: row.read_plan,
      writeBoundary: row.write_boundary,
      verificationIntent: row.verification_spec,
      resultTemplate: row.result_template,
      worktreeId: row.worktree_id,
      assignee: row.assignee,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    }
  }
}
