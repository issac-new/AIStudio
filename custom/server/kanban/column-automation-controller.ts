/**
 * 列级 automation 编排 REST（/api/column-automation）——routa §七#1 吸收（矩阵 §3.6 P0）。
 *
 * GET  /api/column-automation                  配置全量（列→steps/timing/autoAdvance）
 * GET  /api/column-automation/match?from=&to=  COLUMN_TRANSITION 匹配模拟（触发编排预览）
 *
 * 挂载：B 类 patch 415 在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import { loadColumnAutomations, matchColumnTransition } from './column-automation'

const router = new Router({ prefix: '/api/column-automation' })

router.get('/', async (ctx) => {
  ctx.body = { ok: true, columns: loadColumnAutomations() }
})

router.get('/match', async (ctx) => {
  const from = typeof ctx.query.from === 'string' && ctx.query.from ? ctx.query.from : null
  const to = typeof ctx.query.to === 'string' && ctx.query.to ? ctx.query.to : null
  if (!to) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'to 必填（from 可空=首列进入）' }
    return
  }
  ctx.body = { ok: true, triggers: matchColumnTransition(from, to) }
})

export const columnAutomationRoutes = router
