/**
 * KG 演化治理 REST（/api/kg-evolution/*，2026-10-02 动态本体三部曲调研落地）。
 *
 * GET  /status                 自动同步状态（arm/env/interval/pending/节流余量）
 * POST /tick                   手动兜底：立即推进一轮（force，绕节流/攒批等待）
 * POST /arm | /disarm          运行期开关（env KG_AUTO_SYNC=0 是硬闸，arm 拒绝）
 * GET  /versions?board=<slug>  板级 KG 快照版本列表（ts 降序，含大小/节点数）
 * POST /rollback               回滚（body: board, ts；回滚前另存 pre-rollback 可再回）
 *
 * 写面（tick/arm/disarm/rollback）与 governance 管理维护端点同闸：super_admin 或
 * 无鉴权上下文（本地 dev）可操作，其余 403——语义照抄 governance-controller
 * superAdminDenied。
 * 挂载：patch 542 在 bootstrap/routes.ts（import + app.use + startKgAutoSync 三 hunk）。
 */
import Router from '@koa/router'
import { listBoardSnapshots, rollbackBoardKg } from '../knowledge/kg-version'
import { armKgAutoSync, kgAutoSyncStatus, tickKgAutoSync } from '../kgtrigger/auto-sync'

const router = new Router({ prefix: '/api/kg-evolution' })

/** 写闸（与 governance-controller superAdminDenied 同语义）。 */
function superAdminDenied(ctx: { state?: unknown; status: number; body: unknown }): boolean {
  const user = (ctx.state as { user?: { role?: string } | undefined } | undefined)?.user
  if (!user || user.role === 'super_admin') return false
  ctx.status = 403
  ctx.body = { ok: false, error: '管理维护端点仅 super_admin 可操作' }
  return true
}

router.get('/status', async (ctx) => {
  ctx.body = { ok: true, ...kgAutoSyncStatus() }
})

router.post('/tick', async (ctx) => {
  if (superAdminDenied(ctx)) return
  const report = await tickKgAutoSync({ force: true })
  ctx.body = { ok: report.ok, tick: { synced: report.synced, reason: report.reason, pendingCount: report.pendingCount }, results: report.results ?? [] }
})

router.post('/arm', async (ctx) => {
  if (superAdminDenied(ctx)) return
  ctx.body = { ok: true, ...armKgAutoSync(true) }
})

router.post('/disarm', async (ctx) => {
  if (superAdminDenied(ctx)) return
  ctx.body = { ok: true, ...armKgAutoSync(false) }
})

router.get('/versions', async (ctx) => {
  const board = typeof ctx.query.board === 'string' && ctx.query.board ? ctx.query.board : 'main'
  ctx.body = { ok: true, board, versions: listBoardSnapshots(board) }
})

router.post('/rollback', async (ctx) => {
  if (superAdminDenied(ctx)) return
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const board = typeof body.board === 'string' ? body.board : ''
  const ts = Number(body.ts)
  if (!board || !Number.isFinite(ts) || ts <= 0) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'board 必填；ts 必填（快照 unix 毫秒，见 GET /versions）' }
    return
  }
  const r = rollbackBoardKg(board, ts)
  if (!r.ok) {
    ctx.status = 404
    ctx.body = { ok: false, detail: r.error }
    return
  }
  ctx.body = { ok: true, board, ts, snapshot: r.snapshot, preRollback: r.preRollback }
})

export const kgEvolutionRoutes = router
