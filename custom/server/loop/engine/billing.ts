// overlay/custom/server/loop/engine/billing.ts
import type { Pool } from 'pg'

export interface TenantBilling {
  tenantId: string
  totalCost: number
  activeLoopCount: number
  totalIterations: number
  totalTasksCompleted: number
  averageCompletionRate: number
  period: string  // e.g. "2026-07"
}

export class BillingService {
  constructor(private pool: Pool) {}

  async getTenantBilling(tenantId: string): Promise<TenantBilling> {
    const costRes = await this.pool.query(
      `SELECT
        COALESCE(SUM((stats->>'totalCost')::numeric), 0) as total_cost,
        COUNT(*) as active_loops,
        COALESCE(SUM((stats->>'totalIterations')::int), 0) as total_iterations,
        COALESCE(SUM((stats->>'tasksCompleted')::int), 0) as tasks_completed
       FROM loops WHERE tenant_id = $1`,
      [tenantId],
    )
    const completedRes = await this.pool.query(
      "SELECT COUNT(*) as completed FROM loops WHERE tenant_id = $1 AND status = 'completed'",
      [tenantId],
    )
    const row = costRes.rows[0]
    const completed = parseInt(completedRes.rows[0].completed)
    const totalLoops = parseInt(row.active_loops)
    return {
      tenantId,
      totalCost: parseFloat(row.total_cost),
      activeLoopCount: totalLoops,
      totalIterations: parseInt(row.total_iterations),
      totalTasksCompleted: parseInt(row.tasks_completed),
      averageCompletionRate: totalLoops > 0 ? (completed / totalLoops) * 100 : 0,
      period: new Date().toISOString().slice(0, 7),
    }
  }

  async getAllTenantBilling(): Promise<TenantBilling[]> {
    const tenantsRes = await this.pool.query('SELECT id FROM tenants ORDER BY id')
    return Promise.all(tenantsRes.rows.map(r => this.getTenantBilling(r.id)))
  }

  async getMonthlyReport(tenantId: string, year: number, month: number): Promise<{
    tenantId: string
    cost: number
    iterations: number
    loopsCreated: number
  }> {
    const startDate = new Date(year, month - 1, 1).toISOString()
    const endDate = new Date(year, month, 1).toISOString()
    const res = await this.pool.query(
      `SELECT
        COALESCE(SUM((stats->>'totalCost')::numeric), 0) as cost,
        COALESCE(SUM((stats->>'totalIterations')::int), 0) as iterations,
        COUNT(*) as loops_created
       FROM loops
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3`,
      [tenantId, startDate, endDate],
    )
    const row = res.rows[0]
    return {
      tenantId,
      cost: parseFloat(row.cost),
      iterations: parseInt(row.iterations),
      loopsCreated: parseInt(row.loops_created),
    }
  }
}
