// overlay[modelcap] 只读 REST：能力矩阵与风险分档路由决定。
// GET /api/hermes/modelcap/matrix  矩阵 + 可用性（缺席/损坏如实 available:false）
// POST /api/hermes/modelcap/route  风险×类别→模型决定（高风险无证据 requiresHuman）
import Router from '@koa/router'
import { loadMatrix } from './store'
import { routeModel } from './route'
import { CAPABILITY_CATEGORIES, type CapabilityCategory, type RiskTier } from './types'

const RISKS: RiskTier[] = ['low', 'medium', 'high']

const router = new Router({ prefix: '/api/hermes/modelcap' })

router.get('/matrix', async (ctx) => {
  const loaded = loadMatrix()
  ctx.body = {
    ok: true,
    available: loaded.available,
    path: loaded.path,
    reason: loaded.reason,
    matrix: loaded.matrix,
  }
})

router.post('/route', async (ctx) => {
  const body = (ctx.request as unknown as { body?: Record<string, unknown> }).body
  if (!body || typeof body !== 'object') {
    ctx.status = 400
    ctx.body = { ok: false, error: 'request body 必须是 JSON 对象' }
    return
  }
  const risk = body.risk
  const category = body.category
  if (!RISKS.includes(risk as RiskTier)) {
    ctx.status = 400
    ctx.body = { ok: false, error: `risk 必须是 ${RISKS.join('|')}` }
    return
  }
  if (!CAPABILITY_CATEGORIES.includes(category as CapabilityCategory)) {
    ctx.status = 400
    ctx.body = { ok: false, error: `category 必须是 ${CAPABILITY_CATEGORIES.join('|')}` }
    return
  }
  const difficulty = typeof body.difficulty === 'string' ? body.difficulty : undefined
  const defaultModel = typeof body.defaultModel === 'string' ? body.defaultModel : undefined
  const loaded = loadMatrix()
  const decision = routeModel({
    risk: risk as RiskTier,
    category: category as CapabilityCategory,
    difficulty,
    defaultModel,
  }, loaded.matrix)
  ctx.body = {
    ok: true,
    available: loaded.available,
    reason: loaded.reason,
    decision,
  }
})

export const modelcapRoutes = router
