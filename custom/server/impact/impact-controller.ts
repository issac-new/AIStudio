/**
 * 需求影响推演 REST（/api/hermes/impact/*，JoyAI 闭环吸收轮 P5）。
 *
 * POST /requirement   需求文本 → 四路命中（本体实例/板级 KG/FIBO 术语/specs 迭代）
 *                     + 建议模块 + 保守边界声明（规则式，无 LLM、无写入面）
 *
 * 挂载：patches/ 追加 bootstrap/routes.ts（import + app.use，patch 590 同款范式）。
 */
import Router from '@koa/router'
import { analyzeRequirementImpact } from './requirement-impact'

const router = new Router({ prefix: '/api/hermes/impact' })

router.post('/requirement', (ctx) => {
  // bodyparser 增强类型不在本文件编译集（typecheck:harness 白名单）——显式收窄
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as { title?: unknown; description?: unknown }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!title || title.length > 120) {
    ctx.status = 400
    ctx.body = { ok: false, error: 'title 非法（非空且 ≤120 字符）' }
    return
  }
  if (!description || description.length > 2000) {
    ctx.status = 400
    ctx.body = { ok: false, error: 'description 非法（非空且 ≤2000 字符）' }
    return
  }
  ctx.body = { ok: true, impact: analyzeRequirementImpact(title, description) }
})

export const impactRoutes = router
