// overlay[expcandidates] 经验候选 REST（/api/expcandidates/*，2026-10-14 阿里调研轮 B1）。
import Router from '@koa/router'
import { curateCandidate, listCandidates, runExtraction } from './exp-store'

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
  const body = (ctx.request.body ?? {}) as { status?: string }
  const status = String(body.status ?? '')
  if (!['approved', 'rejected', 'candidate'].includes(status)) {
    ctx.status = 400
    ctx.body = { ok: false, problems: ['status 须为 approved/rejected/candidate'] }
    return
  }
  try {
    const c = curateCandidate(ctx.params.id, status as 'approved' | 'rejected' | 'candidate')
    ctx.body = { ok: true, candidate: c }
  } catch (e) {
    const msg = String((e as Error).message || e)
    ctx.status = msg.includes('不存在') ? 404 : 400
    ctx.body = { ok: false, problems: [msg] }
  }
})

export { router as expCandidatesRoutes }
