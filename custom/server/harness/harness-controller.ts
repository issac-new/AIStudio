/**
 * 驾驭工程治理面 REST（/api/harness/*）——信通院《驾驭工程》报告四职能产品化。
 *
 *   GET  /api/harness/capability-catalog?source=   统一能力目录（三系读模型+四要素缺口报告）
 *   GET  /api/harness/cost-accounts?days=7         六类成本账（token/人工干预/工具执行/等待时延/故障返工/安全治理）
 *   GET  /api/harness/maturity?days=7              L1-L5 成熟度自检清单（量化指标+达成证据；自检清单非认证）
 *   GET  /api/harness/primitives                   八工程原语对账（静态定义+活体计数+覆盖矩阵）
 *
 * 四职能映射：统筹协同（L2/L4 指标）· 规范治理（B1 目录/B4 原语）· 效率提升
 * （B2 成本账）· 安全保障（安全治理账+审计完整率）。全部只读聚合，fail-soft：
 * 源缺席标 available:false / value:null，不猜数。
 * 挂载：patch 543 在 bootstrap/routes.ts（与 403 同款两行，series 台账惯例）。
 */
import Router from '@koa/router'
import { collectCapabilityCatalog, parseCapabilitySource } from './capability-catalog'
import { collectCostAccounts, type CostAccountsReport } from './cost-accounts'
import { assessMaturity, collectMaturityInputs, type MaturityReport } from './maturity'
import { buildPrimitivesReport, collectPrimitiveCounts, type PrimitivesReport } from './primitives'
import { buildEvalLayers, collectEvalLayersInputs, type EvalLayersReport } from './eval-layers'
import { collectRsiMaturity, type RsiMaturityReport } from './rsi-maturity'

const router = new Router({ prefix: '/api/harness' })

function daysOf(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 && n <= 90 ? Math.round(n) : 7
}

router.get('/capability-catalog', async (ctx) => {
  try {
    const source = parseCapabilitySource(typeof ctx.query.source === 'string' ? ctx.query.source : undefined)
    const res = await collectCapabilityCatalog(source)
    ctx.body = { ...res, ok: true, source: source ?? 'all' }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

router.get('/cost-accounts', async (ctx) => {
  try {
    const report: CostAccountsReport = await collectCostAccounts({ days: daysOf(ctx.query.days) })
    ctx.body = { ...report, ok: true }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

router.get('/maturity', async (ctx) => {
  try {
    const inputs = await collectMaturityInputs(daysOf(ctx.query.days))
    const report: MaturityReport = assessMaturity(inputs)
    ctx.body = { ...report, ok: true }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

router.get('/primitives', async (ctx) => {
  try {
    const { counts, notes } = await collectPrimitiveCounts()
    const report: PrimitivesReport = buildPrimitivesReport(counts, notes)
    ctx.body = { ...report, ok: true }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// B5 四层评估读模型（2026-10-04 九源调研落地项②）：既有仪表四层归位 +
// 五治理量化口径 gap 立账（口径原文在 definition，数据未采不造数）。
router.get('/eval-layers', async (ctx) => {
  try {
    const inputs = await collectEvalLayersInputs(daysOf(ctx.query.days))
    const report: EvalLayersReport = buildEvalLayers(inputs)
    ctx.body = { ...report, ok: true, days: inputs.days }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// B6 RSI 分级自检（P9）：L1-L5 对照 + 五元组盘点，每级判定带本机证据。
router.get('/rsi-maturity', async (ctx) => {
  try {
    const report: RsiMaturityReport = collectRsiMaturity()
    ctx.body = { ...report, ok: true }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

export const harnessRoutes = router
