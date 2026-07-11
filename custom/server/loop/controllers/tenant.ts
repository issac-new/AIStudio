// overlay/custom/server/loop/controllers/tenant.ts
import Router from '@koa/router'
import { Pool } from 'pg'

export function createTenantRouter(pool: Pool): Router {
  const router = new Router()

  // List tenants (admin only — in production, add auth middleware)
  router.get('/api/loop/tenants', async (ctx) => {
    const res = await pool.query('SELECT id, name, created_at FROM tenants ORDER BY created_at DESC')
    ctx.body = { tenants: res.rows }
  })

  // Get tenant stats
  router.get('/api/loop/tenants/:id/stats', async (ctx) => {
    const tenantId = ctx.params.id
    if (!/^[A-Za-z0-9._-]+$/.test(tenantId)) {
      ctx.status = 400; ctx.body = { error: 'Invalid tenant id' }; return
    }
    const loopCount = await pool.query('SELECT COUNT(*) FROM loops WHERE tenant_id = $1', [tenantId])
    const totalCost = await pool.query(
      `SELECT COALESCE(SUM((stats->>'totalCost')::numeric), 0) as cost FROM loops WHERE tenant_id = $1`,
      [tenantId],
    )
    const completedCount = await pool.query(
      "SELECT COUNT(*) FROM loops WHERE tenant_id = $1 AND status = 'completed'", [tenantId],
    )
    ctx.body = {
      tenantId,
      activeLoops: parseInt(loopCount.rows[0].count),
      totalCost: parseFloat(totalCost.rows[0].cost),
      completedLoops: parseInt(completedCount.rows[0].count),
    }
  })

  // Create tenant
  router.post('/api/loop/tenants', async (ctx) => {
    const { id, name } = ctx.request.body as { id: string; name: string }
    if (!id || !name || !/^[A-Za-z0-9._-]+$/.test(id)) {
      ctx.status = 400; ctx.body = { error: 'Invalid tenant id or missing name' }; return
    }
    try {
      await pool.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, name])
      ctx.body = { id, name }
    } catch (err) {
      ctx.status = 500; ctx.body = { error: 'Failed to create tenant' }
    }
  })

  return router
}
