/**
 * 列级 automation 编排 REST（/api/column-automation）——routa §七#1 吸收（矩阵 §3.6 P0）。
 *
 * GET  /api/column-automation                  配置全量（列→steps/timing/autoAdvance）
 * GET  /api/column-automation/match?from=&to=  COLUMN_TRANSITION 匹配模拟（触发编排预览）
 * POST /api/column-automation/dispatch         执行半环（列流转→派单；X1 归属闸同 /mention）
 *
 * to 为空（卡片离开看板的纯离场）不触发任何编排（含 from 侧 exit）——缺 to 的纯离场
 * 没有目标列可推进，matchColumnTransition 有意回空，此语义在 /match 文档注明。
 *
 * 挂载：B 类 patch 415 在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import { loadColumnAutomations, matchColumnTransition } from './column-automation'
import { dispatchColumnTransition, ColumnDispatchConfigError } from './column-dispatch'
import { getMentionDispatch, workspaceAccessDenied } from '../zcode/engine-controller'

const router = new Router({ prefix: '/api/column-automation' })

router.get('/', async (ctx) => {
  ctx.body = { ok: true, columns: loadColumnAutomations() }
})

router.get('/match', async (ctx) => {
  const from = typeof ctx.query.from === 'string' && ctx.query.from ? ctx.query.from : null
  const to = typeof ctx.query.to === 'string' && ctx.query.to ? ctx.query.to : null
  if (!to) {
    // to 缺席 = 纯离场（卡片离开看板）：现语义不触发任何编排（含 from 侧 exit），
    // 不是解析失败——见 column-automation.ts matchColumnTransition 文档。
    ctx.status = 400
    ctx.body = { ok: false, detail: 'to 必填（from 可空=首列进入；to 缺席的纯离场不触发编排）' }
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
  // X1 归属闸（P-C(b)）：列编排派单即引擎 run，与 /mention 同闸——未注册/不可见的
  // workspace 不得任意 workspacePath 直跑引擎。
  if (workspaceAccessDenied(ctx, workspacePath)) return
  try {
    // 共享派单单例（P-A(b)）：与 /mention REST 同一 pending 槽，跨入口不双跑。
    const result = await dispatchColumnTransition(getMentionDispatch(), {
      from: typeof from === 'string' && from ? from : null,
      to,
      workspacePath,
    })
    ctx.body = { ok: true, triggers: result.triggers.length, outcomes: result.outcomes }
  } catch (err) {
    // 错误分类透传（P-D(c)）：配置/校验错误≠引擎不可达≠未预期错误，不一律谎报。
    const detail = err instanceof Error ? err.message : String(err)
    const isConfig = err instanceof ColumnDispatchConfigError
      || (err as { name?: string } | null)?.name === 'ColumnDispatchConfigError'
    if (isConfig) {
      ctx.status = 400
      ctx.body = { ok: false, reason: 'target_unavailable', detail }
      return
    }
    const transport = /ECONNREFUSED|ETIMEDOUT|ECONNRESET|EPIPE|handshake|ws closed|unreachable/i.test(detail)
    ctx.status = transport ? 503 : 500
    ctx.body = { ok: false, reason: transport ? 'engine_unreachable' : 'internal_error', detail }
  }
})

export const columnAutomationRoutes = router
