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
import { dispatchColumnTransition } from './column-dispatch'
import { getZcodeProjectionRuntime } from '../zcode/projection-runtime'

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

router.post('/dispatch', async (ctx) => {
  // 执行半环（routa §七#2）：列流转→匹配→每 step 派单到 provider（zcode 引擎）。
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const { from, to, workspacePath } = body as Record<string, unknown>
  if (typeof to !== 'string' || !to || typeof workspacePath !== 'string' || !workspacePath) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'to 与 workspacePath 必填（from 可空）' }
    return
  }
  const runtime = getZcodeProjectionRuntime()
  try {
    const result = await dispatchColumnTransition(
      {
        probe: () => runtime.withAgent(async () => true).catch(() => false),
        createSession: (p) => runtime.withAgent((agent) => agent.createSession(p)),
        sendCommand: (p) => runtime.withAgent((agent) => agent.sendConversationCommandV4({ workspacePath: p.workspacePath, envelope: p.envelope as never })),
      },
      'swarmstudio-column-dispatch',
      { from: typeof from === 'string' && from ? from : null, to, workspacePath },
    )
    ctx.body = { ok: true, triggers: result.triggers.length, outcomes: result.outcomes }
  } catch (err) {
    ctx.status = 503
    ctx.body = { ok: false, reason: 'engine_unreachable', detail: err instanceof Error ? err.message : String(err) }
  }
})

export const columnAutomationRoutes = router
