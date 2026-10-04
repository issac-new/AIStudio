// overlay/custom/server/controllers/sim/run-progress.ts
// 推演运行态端点（2026-10-04 后台感知三件套③）：harness 的 sset 在每次状态写入时
// 同步刷 $HERMES_HOME/run-progress.json（文件契约：harness 单写、产品只读；缺文件=无推演）。
// 本端点 fail-soft：文件缺失/损坏一律 { ok:false, run:null }，不报错——宿主 studio
// （无推演）与 SIM studio（推演前后）都拿得到可判定的空态。
import Router from '@koa/router'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface SimRunProgress {
  runId: string
  done: number
  total: number
  doneSteps: string[]
  updatedTs: number
}

export function parseRunProgress(raw: string): SimRunProgress | null {
  let data: any
  try { data = JSON.parse(raw) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const runId = typeof data.run_id === 'string' ? data.run_id : ''
  const done = Number(data.done)
  const total = Number(data.total)
  const updatedTs = Number(data.updated_ts)
  if (!runId || !Number.isFinite(done) || !Number.isFinite(total) || total <= 0 || !Number.isFinite(updatedTs)) return null
  const doneSteps = Array.isArray(data.done_steps) ? data.done_steps.filter((s: unknown) => typeof s === 'string') : []
  return { runId, done, total, doneSteps, updatedTs }
}

export function runProgressPath(homeDir = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')): string {
  return join(homeDir, 'run-progress.json')
}

export function createSimRunRouter(): Router {
  const router = new Router()
  router.get('/api/sim/run-progress', async (ctx) => {
    try {
      const raw = readFileSync(runProgressPath(), 'utf8')
      const run = parseRunProgress(raw)
      ctx.body = { ok: !!run, ts: Date.now(), run: run ? { ...run, staleMin: Math.max(0, Math.floor((Date.now() / 1000 - run.updatedTs) / 60)) } : null }
    } catch {
      ctx.body = { ok: false, ts: Date.now(), run: null }
    }
  })
  return router
}

export default createSimRunRouter()
