/**
 * 可观测性端点（PR-0②）——推演运行状态统一查询面。
 *
 * 定位：监测从「翻日志文件」升级为产品端点；与 simharness mux/mx-state-query.sh
 * 同源语义（summary/gates/steps/posture/ledger），HTTP 形态供 workflow 子智能体
 * 与 dashboard 消费。条款=《2026-10-15-swarmstudio-resilience-and-humansim-design.md》PR-0②。
 *
 * GET /api/hermes/observability/run-state?run=<RUN_ID>
 *   → { run, posture, gates[], steps[], ledger: { total, open, byType }, source }
 *
 * 配置（env）：OBS_SIM_ROOT（SIM 根目录；未配置=503 fail-closed——生产部署不开
 * env 即关，不读任意磁盘路径）。只读端点：不写任何文件。
 */
import type { Context } from 'koa'
import Router from '@koa/router'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const router = new Router({ prefix: '/api/hermes/observability' })

/** state.env 解析（纯函数，测试面）：键值对；重复键取首行。 */
export function parseStateEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const ln of text.split('\n')) {
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(ln)
    if (m && !(m[1] in out)) out[m[1]] = m[2]
  }
  return out
}

/** 闸键筛选（纯函数）：g 前缀/security 前缀/humangate/report_done/close_done。 */
export function gateKeys(state: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(state)) {
    if (/^(g[1-6][a-z_]*|security_[a-z_]+|humangate[a-z_]*|report_done|close_done)/.test(k)) out[k] = v
  }
  return out
}

/** 完成标记筛选（纯函数）：*_done/*_pass/*_verified，排除闸键族。 */
export function stepKeys(state: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(state)) {
    if (/^[a-z0-9_]+_(done|pass|verified)$/.test(k) && !/^(security_|g[1-6])/.test(k)) out[k] = v
  }
  return out
}

/** 代偿台账摘要（纯函数）：TSV 列 id/ts/type/defect/detail/status/resolution。 */
export function ledgerSummary(tsv: string): { total: number; open: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {}
  let total = 0, open = 0
  for (const ln of tsv.split('\n').slice(1)) {
    const f = ln.split('\t')
    if (f.length < 6 || !f[0]) continue
    total++
    byType[f[2]] = (byType[f[2]] ?? 0) + 1
    if (f[5] === 'open') open++
  }
  return { total, open, byType }
}

router.get('/run-state', (ctx: Context) => {
  const root = process.env.OBS_SIM_ROOT
  if (!root || !existsSync(root)) {
    ctx.status = 503; ctx.body = { error: 'observability 未配置（OBS_SIM_ROOT 缺席=fail-closed）' }; return
  }
  const run = String(ctx.query.run ?? '')
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(run)) { ctx.status = 400; ctx.body = { error: 'run 参数非法' }; return }
  const stateFile = resolve(root, 'runs', run, 'state.env')
  if (!existsSync(stateFile)) { ctx.status = 404; ctx.body = { error: `run ${run} 的 state.env 不存在` }; return }
  const state = parseStateEnv(readFileSync(stateFile, 'utf-8'))
  const ledgerFile = resolve(root, 'runs', run, 'evidence', 'compensation-ledger.tsv')
  const ledger = existsSync(ledgerFile) ? ledgerSummary(readFileSync(ledgerFile, 'utf-8')) : { total: 0, open: 0, byType: {} }
  ctx.body = {
    run,
    posture: state.posture || 'standard',
    gates: gateKeys(state),
    steps: stepKeys(state),
    ledger,
    source: { stateFile, ledgerFile, ledgerPresent: existsSync(ledgerFile) },
  }
})

export { router as observabilityRouter }
