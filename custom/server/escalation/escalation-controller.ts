/**
 * 权限升级协议 REST（/api/escalation）——routa §七#7 吸收（矩阵 §3.6 P1）。
 *
 * POST /api/escalation           发起（urgency 三档；幂等 escalationId）
 * GET  /api/escalation/pending   待决队列（urgency 高在前，routa listPendingPermissions）
 * POST /api/escalation/:id/decide 裁决（approved 可附 sandboxConstraints→联动 402 规则；一次定音）
 * GET  /api/escalation/:id       查询
 *
 * 挂载：B 类 patch 455（统一挂载）在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import {
  decideEscalation, isEscalationUrgency, listPending, loadEscalation, requestEscalation,
  type EscalationRequest,
} from './escalation-store'

const router = new Router({ prefix: '/api/escalation' })

router.post('/', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { escalationId, fromAgent, scope, urgency, reason } = body as Record<string, unknown>
  const sc = scope as { tool?: unknown; argvPrefix?: unknown } | undefined
  if (typeof escalationId !== 'string' || !escalationId || typeof fromAgent !== 'string' || !fromAgent
      || !sc || typeof sc.tool !== 'string' || !sc.tool
      || !isEscalationUrgency(urgency) || typeof reason !== 'string' || !reason) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'escalationId/fromAgent/scope.tool/urgency(三档)/reason 必填' }
    return
  }
  const req = requestEscalation({
    escalationId, fromAgent,
    scope: { tool: sc.tool, argvPrefix: typeof sc.argvPrefix === 'string' ? sc.argvPrefix : undefined },
    urgency: urgency as EscalationRequest['urgency'], reason,
    taskId: typeof body.taskId === 'string' ? body.taskId : undefined,
  })
  ctx.body = { ok: true, request: req }
})

router.get('/pending', async (ctx) => {
  ctx.body = { ok: true, pending: listPending() }
})

router.post('/:id/decide', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const verdict = body.verdict
  if (verdict !== 'approved' && verdict !== 'denied') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'verdict 须为 approved|denied' }
    return
  }
  const result = decideEscalation(ctx.params.id, verdict, {
    by: typeof body.by === 'string' ? body.by : 'coordinator',
    note: typeof body.note === 'string' ? body.note : undefined,
    sandboxConstraints: Array.isArray(body.sandboxConstraints) ? body.sandboxConstraints as never : undefined,
  })
  if ('error' in result) {
    ctx.status = result.error.includes('不存在') ? 404 : 409
    ctx.body = { ok: false, detail: result.error }
    return
  }
  ctx.body = { ok: true, request: result }
})

router.get('/:id', async (ctx) => {
  const req = loadEscalation(ctx.params.id)
  if (!req) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '升级请求不存在' }
    return
  }
  ctx.body = { ok: true, request: req }
})

export const escalationRoutes = router
