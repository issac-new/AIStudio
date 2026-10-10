// overlay/custom/server/controllers/sim/run-progress.ts
// 推演运行态端点（2026-10-04 后台感知三件套③）：harness 的 sset 在每次状态写入时
// 同步刷 $HERMES_HOME/run-progress.json（文件契约：harness 单写、产品只读；缺文件=无推演）。
// 本端点 fail-soft：文件缺失/损坏一律 { ok:false, run:null }，不报错——宿主 studio
// （无推演）与 SIM studio（推演前后）都拿得到可判定的空态。
import Router from '@koa/router'
import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { ingestRunProgress } from './run-ingest'

export interface SimRunProgress {
  runId: string
  done: number
  total: number
  doneSteps: string[]
  updatedTs: number
  /** lite 轮口径（G4 2026-10-10）：harness 写 scope=lite 时透传，横幅显示「lite 轮 x/N」
   *  而非误导性的 0/26（lite 夹具步不计 total，按执行段计）。 */
  scope?: 'lite' | 'full'
  fixturesFrom?: string
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
  const scope = data.scope === 'lite' ? 'lite' as const : undefined
  const fixturesFrom = typeof data.fixtures_from === 'string' && data.fixtures_from ? data.fixtures_from : undefined
  return { runId, done, total, doneSteps, updatedTs, ...(scope ? { scope } : {}), ...(fixturesFrom ? { fixturesFrom } : {}) }
}

export function runProgressPath(homeDir = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')): string {
  return join(homeDir, 'run-progress.json')
}

export function createSimRunRouter(opts?: {
  /** 推演快照 → 运行注册表摄取钩子（backlog②）；null=关闭（测试/降级），缺省=run-ingest 实现 */
  ingest?: ((p: SimRunProgress) => Promise<unknown>) | null
}): Router {
  const router = new Router()
  router.get('/api/sim/run-progress', async (ctx) => {
    try {
      const raw = readFileSync(runProgressPath(), 'utf8')
      const run = parseRunProgress(raw)
      if (run && opts?.ingest !== null) {
        const ingest = opts?.ingest ?? ingestRunProgress
        // fail-soft：注册表摄取失败不影响横幅契约（横幅/注册表两通道各自独立可用）
        void Promise.resolve(ingest(run)).catch(() => {})
      }
      ctx.body = { ok: !!run, ts: Date.now(), run: run ? { ...run, staleMin: Math.max(0, Math.floor((Date.now() / 1000 - run.updatedTs) / 60)) } : null }
    } catch {
      ctx.body = { ok: false, ts: Date.now(), run: null }
    }
  })
  return router
}

export default createSimRunRouter()
