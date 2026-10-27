// overlay[redteam] REST 路由（挂在 eval 路由器下，零新增 patch）。
//
// GET  /api/hermes/eval/redteam/corpus       语料/算子/检测器清单（不含语料原文）
// POST /api/hermes/eval/redteam/runs         跑一次红队体检 {generations?,population?,threshold?,seed?}
// GET  /api/hermes/eval/redteam/runs         最近运行摘要
// GET  /api/hermes/eval/redteam/runs/:id     完整报告
// POST /api/hermes/eval/redteam/runs/:id/s1  S0 幸存者 S1 裁判分层复评（挂账清偿批）
import Router from '@koa/router'
import type { Context } from 'koa'
import { CATEGORY_LABELS, attackSeeds, benignSeeds } from './corpus'
import { DETECTOR_INFO, s1Evaluate } from './detector'
import { summarizeS1Layer } from './s1-layer'
import { DEFAULT_REDTEAM_CONFIG, REDTEAM_LIMITS, replaySurvivorTexts, runRedteam } from './engine'
import { OPERATORS } from './mutate'
import { appendRun, attachS1, getRun, listRuns } from './store'
import { runExecRedteam } from './exec-probe'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RedteamConfig, S1LayerReport, S1SurvivorVerdict } from './types'

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

  // 沙箱攻防（2026-10-21 挂账清偿收）：执行型载荷在 OS 沙箱内真跑验活性，
  // 对照规则层出四分类事实。每次真执行（spawn 级代价），无状态不落库。
  router.post('/redteam/exec-runs', async (ctx) => {
    const body = (ctx.request.body ?? {}) as { threshold?: number; timeoutMs?: number }
    const scratch = mkdtempSync(join(tmpdir(), 'redteam-exec-api-'))
    try {
      const report = await runExecRedteam({
        scratch,
        ...(typeof body.threshold === 'number' && body.threshold >= 1 ? { threshold: body.threshold } : {}),
        ...(typeof body.timeoutMs === 'number' && body.timeoutMs >= 1000 && body.timeoutMs <= 60_000 ? { timeoutMs: body.timeoutMs } : {}),
      })
      ctx.status = report.sandbox === 'available' ? 200 : 503
      ctx.body = { ok: report.sandbox === 'available', run: report, actor: actorOf(ctx) }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
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

  // S1 分层复评（挂账清偿批，2026-10-27）：按 run.config 确定性复放 S0 幸存者原文
  // （账本不落原文），逐条过 toolresultguard 同源判定链；judge 不可用 fail-open
  // 如实入不可用桶（available:false），不冒充检出。幂等覆盖式落账。
  router.post('/redteam/runs/:id/s1', async (ctx) => {
    const run = getRun(ctx.params.id)
    if (!run) {
      ctx.status = 404
      ctx.body = { ok: false, problems: [`红队运行不存在：${ctx.params.id}`] }
      return
    }
    const replay = replaySurvivorTexts(run.config)
    if (!replay.ok) {
      ctx.status = 400
      ctx.body = { ok: false, problems: replay.problems }
      return
    }
    if (replay.survivors.length === 0) {
      const report: S1LayerReport = {
        ...summarizeS1Layer([], Date.now()),
        available: true,
        unavailableReason: 'S0 无幸存者，S1 无可复评对象',
      }
      attachS1(run.id, report)
      ctx.body = { ok: true, s1: report }
      return
    }
    const verdicts: S1SurvivorVerdict[] = await Promise.all(replay.survivors.map(async (s) => {
      const d = await s1Evaluate(s.text).catch((e: unknown) => ({
        via: `fail-open-error: ${e instanceof Error ? e.message : String(e)}`,
        verdict: null, attackP: null, category: null, severity: null,
      }))
      return { id: s.id, preview: s.preview, via: d.via, verdict: d.verdict, attackP: d.attackP, category: d.category, severity: d.severity }
    }))
    // 口径抽到纯函数 s1-layer.ts：fail-open 的 PASS 不算逃逸（否则两数相加超总数，
    // 2026-10-27 活体走查实锤）。
    const report = summarizeS1Layer(verdicts, Date.now())
    attachS1(run.id, report)
    ctx.body = { ok: true, s1: report, actor: actorOf(ctx) }
  })
}
