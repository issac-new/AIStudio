/**
 * 结构化问卷 REST（/api/ask）——minimax ask_user 契约吸收（矩阵 §3.4 P1）。
 *
 * POST /api/ask                 开问卷（先校验 1-4 步×2-4 选项×recommended≤1 后落盘）
 * GET  /api/ask/:id             查询（含 answers）
 * POST /api/ask/:id/answer      答卷（必答+选项合法+一次定音）
 *
 * 挂载：B 类 patch 420 在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import { answerQuestionnaire, createQuestionnaire, loadQuestionnaire, type AskStep } from './ask-contract'

const router = new Router({ prefix: '/api/ask' })

router.post('/', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const askId = body.askId
  if (typeof askId !== 'string' || !askId || !Array.isArray(body.steps)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'askId 必填；steps 须为数组' }
    return
  }
  const result = createQuestionnaire({
    askId,
    taskId: typeof body.taskId === 'string' ? body.taskId : undefined,
    steps: body.steps as AskStep[],
  })
  if ('issues' in result) {
    ctx.status = 422
    ctx.body = { ok: false, issues: result.issues }
    return
  }
  ctx.body = { ok: true, questionnaire: result }
})

router.get('/:id', async (ctx) => {
  const q = loadQuestionnaire(ctx.params.id)
  if (!q) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '问卷不存在' }
    return
  }
  ctx.body = { ok: true, questionnaire: q }
})

router.post('/:id/answer', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  if (!body.answers || typeof body.answers !== 'object') {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'answers 必填（stepId→optionId）' }
    return
  }
  const result = answerQuestionnaire(ctx.params.id, body.answers as Record<string, string>)
  if ('error' in result) {
    ctx.status = result.error.includes('不存在') ? 404 : 409
    ctx.body = { ok: false, detail: result.error }
    return
  }
  ctx.body = { ok: true, questionnaire: result }
})

export const askRoutes = router
