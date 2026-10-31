// overlay[modelcap] 只读 REST：能力矩阵与风险分档路由决定。
// GET /api/hermes/modelcap/matrix  矩阵 + 可用性（缺席/损坏如实 available:false）
// POST /api/hermes/modelcap/route  风险×类别→模型决定（高风险无证据 requiresHuman）
// 响应形状统一走 custom/server/lib/http.ts（K19 棘轮：新代码不手写响应体/失败体）。
import Router from '@koa/router'
import { bodyOf, fail, ok } from '../lib/http'
import { loadMatrix } from './store'
import { routeModel } from './route'
import { CAPABILITY_CATEGORIES, type CapabilityCategory, type RiskTier } from './types'

const RISKS: RiskTier[] = ['low', 'medium', 'high']

const router = new Router({ prefix: '/api/hermes/modelcap' })

router.get('/matrix', async (ctx) => {
  const loaded = loadMatrix()
  ok(ctx, {
    available: loaded.available,
    path: loaded.path,
    reason: loaded.reason,
    matrix: loaded.matrix,
  })
})

router.post('/route', async (ctx) => {
  const body = bodyOf(ctx)
  if (!body || typeof body !== 'object') {
    fail(ctx, 400, 'request body 必须是 JSON 对象')
    return
  }
  const risk = body.risk
  const category = body.category
  if (!RISKS.includes(risk as RiskTier)) {
    fail(ctx, 400, `risk 必须是 ${RISKS.join('|')}`)
    return
  }
  if (!CAPABILITY_CATEGORIES.includes(category as CapabilityCategory)) {
    fail(ctx, 400, `category 必须是 ${CAPABILITY_CATEGORIES.join('|')}`)
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
  ok(ctx, {
    available: loaded.available,
    reason: loaded.reason,
    decision,
  })
})

export const modelcapRoutes = router
