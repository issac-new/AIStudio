// overlay/custom/server/diagram/diagram-controller.ts
// 图产物机械验收 REST（spec 项3）：POST /api/hermes/diagram/check
// 语义= vendored self_check.py；本控制器只做入参校验、路径政策、结果透传。
import Router from '@koa/router'
import { assertDiagramPath, runSelfCheck } from './self-check'

export const diagramRoutes = new Router({ prefix: '/api/hermes/diagram' })

diagramRoutes.post('/check', async (ctx) => {
  const body = (ctx.request as { body?: unknown }).body as { path?: unknown; offline?: unknown } | undefined
  let safePath: string
  try {
    safePath = assertDiagramPath(body?.path)
  } catch (e) {
    const err = e as Error & { code?: string }
    ctx.status = err.code === 'not_found' ? 404 : err.code === 'outside_sandbox' ? 403 : 400
    ctx.body = { ok: false, error: err.message, code: err.code ?? 'invalid_path' }
    return
  }
  const result = await runSelfCheck([safePath], { offline: body?.offline === true })
  ctx.body = result
})

export default diagramRoutes
