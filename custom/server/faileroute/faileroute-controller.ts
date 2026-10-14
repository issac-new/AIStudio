// overlay[faileroute] 失败路由 REST（/api/faileroute/*，2026-10-14 阿里调研轮 E）。
import Router from '@koa/router'
import { FAILURE_CLASSES, ROUTE_TABLE, resolveRoute, type FailureClass } from './failure-routes'

const router = new Router({ prefix: '/api/faileroute' })

router.get('/table', async (ctx) => {
  ctx.body = {
    ok: true,
    classes: FAILURE_CLASSES.map((c) => ROUTE_TABLE[c]),
  }
})

router.post('/resolve', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { failureClass?: string; attempts?: number; maxAttempts?: number }
  const failureClass = String(body.failureClass ?? '') as FailureClass
  if (!FAILURE_CLASSES.includes(failureClass)) {
    ctx.status = 400
    ctx.body = { ok: false, problems: [`failureClass 须为 ${FAILURE_CLASSES.join('/')}`] }
    return
  }
  const attempts = Number(body.attempts ?? 0)
  const decision = resolveRoute(failureClass, {
    attempts: Number.isFinite(attempts) ? attempts : 0,
    maxAttempts: Number.isFinite(Number(body.maxAttempts)) ? Number(body.maxAttempts) : undefined,
  })
  ctx.body = { ok: true, decision }
})

export { router as failerouteRoutes }
