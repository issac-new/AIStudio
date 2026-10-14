// overlay[optadvice] 建议报告 REST（/api/optadvice/report，2026-10-14 阿里调研轮 A+F）。
import Router from '@koa/router'
import { buildAdviceReport } from './optadvice-service'

const router = new Router({ prefix: '/api/optadvice' })

router.get('/report', async (ctx) => {
  const days = Number(ctx.query.days ?? 7)
  const limit = Number(ctx.query.limit ?? 5)
  try {
    const report = await buildAdviceReport({
      days: Number.isFinite(days) ? days : 7,
      limit: Number.isFinite(limit) ? limit : 5,
    })
    ctx.body = { ok: true, report }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, problems: [String((e as Error).message || e)] }
  }
})

export { router as optAdviceRoutes }
