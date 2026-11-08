// overlay[expcandidates] 经验候选 REST（/api/expcandidates/*，2026-10-14 阿里调研轮 B1）。
import Router from '@koa/router'
import { fail, ok, bodyOf } from '../lib/http'
import { ReflectionGuardError, curateCandidate, listCandidates, runExtraction } from './exp-store'

const router = new Router({ prefix: '/api/expcandidates' })

router.get('/', async (ctx) => {
  const status = typeof ctx.query.status === 'string' ? ctx.query.status : undefined
  const all = listCandidates()
  ctx.body = { ok: true, candidates: status ? all.filter((c) => c.status === status) : all }
})

router.post('/extract', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { days?: number }
  try {
    const result = await runExtraction({ days: Number(body.days) || undefined })
    ctx.body = { ok: true, ...result }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, problems: [String((e as Error).message || e)] }
  }
})

router.post('/:id/curate', async (ctx) => {
  const body = bodyOf<{ status?: string }>(ctx)
  const status = String(body.status ?? '')
  if (!['approved', 'rejected', 'candidate'].includes(status)) {
    fail(ctx, 400, 'status 须为 approved/rejected/candidate', {
      code: 'bad_status',
      problems: ['status 须为 approved/rejected/candidate'],
    })
    return
  }
  try {
    const c = curateCandidate(ctx.params.id, status as 'approved' | 'rejected' | 'candidate')
    ok(ctx, { candidate: c })
  } catch (e) {
    // 反思守卫拒收：422 + 逐条理由（可先改陈述再批，不静默降级为通过）。
    if (e instanceof ReflectionGuardError) {
      fail(ctx, 422, '经验陈述未通过反思守卫（泛泛/过窄/自相矛盾）', {
        code: 'reflection_guard',
        problems: e.reasons,
      })
      return
    }
    const msg = String((e as Error).message || e)
    fail(ctx, msg.includes('不存在') ? 404 : 400, msg, { code: 'curate_failed' })
  }
})

export { router as expCandidatesRoutes }
