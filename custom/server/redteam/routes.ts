// overlay[redteam] REST 路由（挂在 eval 路由器下，零新增 patch）。
//
// GET  /api/hermes/eval/redteam/corpus       语料/算子/检测器清单（不含语料原文）
// POST /api/hermes/eval/redteam/runs         跑一次红队体检 {generations?,population?,threshold?,seed?}
// GET  /api/hermes/eval/redteam/runs         最近运行摘要
// GET  /api/hermes/eval/redteam/runs/:id     完整报告
import Router from '@koa/router'
import type { Context } from 'koa'
import { CATEGORY_LABELS, attackSeeds, benignSeeds } from './corpus'
import { DETECTOR_INFO } from './detector'
import { DEFAULT_REDTEAM_CONFIG, REDTEAM_LIMITS, runRedteam } from './engine'
import { OPERATORS } from './mutate'
import { appendRun, getRun, listRuns } from './store'
import type { RedteamConfig } from './types'

function actorOf(ctx: Context): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

/** 把红队路由挂到宿主路由器（eval controller 调用）。 */
export function mountRedteam(router: Router): void {
  router.get('/redteam/corpus', async (ctx) => {
    const seeds = attackSeeds()
    ctx.body = {
      ok: true,
      detector: DETECTOR_INFO,
      defaults: DEFAULT_REDTEAM_CONFIG,
      limits: REDTEAM_LIMITS,
      categories: CATEGORY_LABELS
        .filter((c) => c.key !== 'benign')
        .map((c) => ({ ...c, seedCount: seeds.filter((s) => s.category === c.key).length })),
      benignCount: benignSeeds().length,
      operators: OPERATORS,
    }
  })

  router.post('/redteam/runs', async (ctx) => {
    const body = (ctx.request.body ?? {}) as Partial<RedteamConfig>
    const result = runRedteam(body)
    if ('problems' in result) {
      ctx.status = 400
      ctx.body = { ok: false, problems: result.problems }
      return
    }
    appendRun(result.run)
    ctx.status = 201
    ctx.body = { ok: true, run: result.run, actor: actorOf(ctx) }
  })

  router.get('/redteam/runs', async (ctx) => {
    const raw = typeof ctx.query.limit === 'string' ? Number(ctx.query.limit) : 20
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(Math.trunc(raw), 50)) : 20
    ctx.body = { ok: true, runs: listRuns(limit) }
  })

  router.get('/redteam/runs/:id', async (ctx) => {
    const run = getRun(ctx.params.id)
    if (!run) {
      ctx.status = 404
      ctx.body = { ok: false, problems: [`红队运行不存在：${ctx.params.id}`] }
      return
    }
    ctx.body = { ok: true, run }
  })
}
