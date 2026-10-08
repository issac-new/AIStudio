// overlay/custom/server/harness/virtual-pl-controller.ts
// AI 虚拟损益表 REST（六文调研轮 E）：GET /api/hermes/virtual-pl?days=30
import Router from '@koa/router'
import { buildVirtualPnl } from './virtual-pnl'

export const virtualPlRoutes = new Router({ prefix: '/api/hermes/virtual-pl' })

virtualPlRoutes.get('/', async (ctx) => {
  const days = Number(ctx.query.days ?? 30)
  ctx.body = await buildVirtualPnl({ days: Number.isFinite(days) ? days : 30 })
})
