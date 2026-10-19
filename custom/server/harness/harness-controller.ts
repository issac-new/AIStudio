/**
 * 驾驭工程治理面 REST（/api/harness/*）——信通院《驾驭工程》报告四职能产品化。
 *
 *   GET  /api/harness/capability-catalog?source=   统一能力目录（三系读模型+四要素缺口报告）
 *   GET  /api/harness/cost-accounts?days=7         六类成本账（token/人工干预/工具执行/等待时延/故障返工/安全治理）
 *   GET  /api/harness/maturity?days=7              L1-L5 成熟度自检清单（量化指标+达成证据；自检清单非认证）
 *   GET  /api/harness/primitives                   八工程原语对账（静态定义+活体计数+覆盖矩阵）
 *   GET  /api/harness/nine-layers?days=7          九层运行体检（2026-10-18；逐层证据/差距/动作）
 *   GET  /api/harness/tool-contracts               工具契约表（副作用/超时/重试/幂等）
 *   GET  /api/harness/tool-audit?days=&limit=      工具执行审计查询（窗口/身份/结果过滤+聚合）
 *   GET  /api/harness/policy-decisions?days=        执法放行/拒绝决策账（P0-2）
 *   GET  /api/harness/run-manifests?days=            运行清单与运行级成本（P1-3）
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
import { queryToolExecAudit } from '../toolpipeline/tool-hooks'
import { queryPolicyDecisions } from '../toolpipeline/policy-decisions'
import { queryRunManifests, runCostFromTrace } from '../runmanifest/run-manifest'
import { planResume } from '../resume/resume-planner'
import { collectProcessQuality } from '../observability/process-quality'
import { budgetStatus, listBudgetPolicies, removeBudgetPolicy, setBudgetPolicy, type BudgetAction } from '../tokenbudget/budget-policy'
import { listLeases, registerLease, startSandboxJanitorIfEnabled, sweepExpiredLeases } from '../sandbox/sandbox-lease'
import { BUILTIN_CONTRACTS } from '../toolcontract/contract'
import { buildNineLayers, collectNineLayersInputs, type NineLayersReport } from './nine-layers'
import { workbenchRoutes } from './workbench/controller'

const router = new Router({ prefix: '/api/harness' })

// Harness² 改进实验台（2026-10-19）：提案-探测-组合-冠军闭环，复用本路由前缀，
// 不新增 bootstrap patch。子路由自带写面权限校验（super_admin）。
router.use('/workbench', workbenchRoutes.routes(), workbenchRoutes.allowedMethods())

function daysOf(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 && n <= 90 ? Math.round(n) : 7
}

/** 治理写面（预算/沙箱）：有认证主体时须 super_admin；单用户无鉴权部署放行。 */
function writeDenied(ctx: { state?: unknown; status?: number; body?: unknown }): boolean {
  const user = (ctx.state as { user?: { role?: string } } | undefined)?.user
  if (user && user.role !== 'super_admin') {
    ctx.status = 403
    ctx.body = { ok: false, detail: '治理写面须 super_admin 权限' }
    return true
  }
  return false
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

// 工具契约目录（2026-10-18 Harness 可靠性轮）：按工具族声明副作用/超时/重试/
// 幂等，是审计与执行器共用的单一事实源。只读静态表。
router.get('/tool-contracts', async (ctx) => {
  ctx.body = { ok: true, count: BUILTIN_CONTRACTS.length, contracts: BUILTIN_CONTRACTS }
})

// 工具执行审计查询（v3）：窗口/身份/工具/结果过滤 + 分页与聚合。
// 坏行跳过、目录缺席返回空账（fail-soft）；审计写失败计数随回包可见。
router.get('/tool-audit', async (ctx) => {
  try {
    const q = ctx.query
    const outcome = q.outcome === 'ok' || q.outcome === 'error' ? q.outcome : undefined
    const phase = q.phase === 'pre' || q.phase === 'post' ? q.phase : undefined
    const limit = Number(q.limit)
    const result = queryToolExecAudit({
      days: daysOf(q.days),
      limit: Number.isFinite(limit) ? limit : undefined,
      tool: typeof q.tool === 'string' && q.tool ? q.tool : undefined,
      sessionId: typeof q.sessionId === 'string' && q.sessionId ? q.sessionId : undefined,
      runId: typeof q.runId === 'string' && q.runId ? q.runId : undefined,
      outcome,
      phase,
    })
    ctx.body = { ...result, ok: true }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// 执法放行/拒绝决策账（P0-2）：与工具执行审计分面，回答“为什么放行”。
router.get('/policy-decisions', async (ctx) => {
  try {
    const q = ctx.query
    const limit = Number(q.limit)
    const outcome = q.outcome === 'allow' || q.outcome === 'deny' ? q.outcome : undefined
    const result = queryPolicyDecisions({
      days: daysOf(q.days),
      limit: Number.isFinite(limit) ? limit : undefined,
      tool: typeof q.tool === 'string' && q.tool ? q.tool : undefined,
      userId: typeof q.userId === 'string' && q.userId ? q.userId : undefined,
      sessionId: typeof q.sessionId === 'string' && q.sessionId ? q.sessionId : undefined,
      runId: typeof q.runId === 'string' && q.runId ? q.runId : undefined,
      outcome,
    })
    ctx.body = { ...result, ok: true }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// 运行清单（P1-3）：模型/提示词指纹/权限模式/契约版本；withCost=1 时按 trace 估价。
router.get('/run-manifests', async (ctx) => {
  try {
    const q = ctx.query
    const limit = Number(q.limit)
    const result = queryRunManifests({
      days: daysOf(q.days),
      limit: Number.isFinite(limit) ? limit : undefined,
      sessionId: typeof q.sessionId === 'string' && q.sessionId ? q.sessionId : undefined,
      runId: typeof q.runId === 'string' && q.runId ? q.runId : undefined,
    })
    const withCost = q.withCost === '1' || q.withCost === 'true'
    const entries = withCost
      ? result.entries.slice(0, 50).map((m) => ({ ...m, cost: runCostFromTrace(m) }))
      : result.entries
    ctx.body = { ...result, entries, ok: true }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// 恢复判定（残余项②）：三档建议 + 证据；只建议不执行。
router.get('/resume-plan', async (ctx) => {
  try {
    const runId = typeof ctx.query.runId === 'string' && ctx.query.runId ? ctx.query.runId : undefined
    const sessionId = typeof ctx.query.sessionId === 'string' && ctx.query.sessionId ? ctx.query.sessionId : undefined
    if (!runId && !sessionId) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'runId 或 sessionId 至少提供一个' }
      return
    }
    ctx.body = { ok: true, plan: await planResume({ runId, sessionId }) }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// 过程质量指标（残余项③）：重复调用/失败率/长链/首过/规范符合率。
router.get('/process-quality', async (ctx) => {
  try {
    ctx.body = { ok: true, ...collectProcessQuality(daysOf(ctx.query.days)) }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// 预算状态（残余项⑤）：只读；策略写面在下方 POST。
router.get('/budget-status', async (ctx) => {
  try {
    const userId = typeof ctx.query.userId === 'string' && ctx.query.userId ? ctx.query.userId : undefined
    const profileId = typeof ctx.query.profileId === 'string' && ctx.query.profileId ? ctx.query.profileId : undefined
    ctx.body = { ok: true, status: budgetStatus({ userId, profileId }) }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

router.get('/budget-policies', async (ctx) => {
  ctx.body = { ok: true, policies: listBudgetPolicies() }
})

router.post('/budget-policy', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = (ctx.request.body ?? {}) as Record<string, unknown>
  const action = b.action === 'warn' || b.action === 'downgrade' || b.action === 'block' ? b.action as BudgetAction : null
  const dailyUsd = Number(b.dailyUsd)
  const userId = typeof b.userId === 'string' && b.userId ? b.userId : undefined
  const profileId = typeof b.profileId === 'string' && b.profileId ? b.profileId : undefined
  if ((!userId && !profileId) || !action || !Number.isFinite(dailyUsd) || dailyUsd < 0) {
    ctx.status = 400
    ctx.body = { ok: false, detail: '须提供 userId 或 profileId、dailyUsd≥0、action=warn|downgrade|block' }
    return
  }
  try {
    ctx.body = { ok: true, policy: setBudgetPolicy({ userId, profileId, dailyUsd, action }) }
  } catch (e) {
    ctx.status = 400
    ctx.body = { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
})

router.post('/budget-policy/remove', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = (ctx.request.body ?? {}) as Record<string, unknown>
  const removed = removeBudgetPolicy({
    userId: typeof b.userId === 'string' && b.userId ? b.userId : undefined,
    profileId: typeof b.profileId === 'string' && b.profileId ? b.profileId : undefined,
  })
  ctx.body = { ok: true, removed }
})

// 沙箱租约与清扫（残余项⑥）：清扫只动沙箱根内目录，未配置根拒绝。
router.get('/sandbox/leases', async (ctx) => {
  ctx.body = { ok: true, leases: listLeases() }
})

router.post('/sandbox/lease', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = (ctx.request.body ?? {}) as Record<string, unknown>
  const res = registerLease({
    runId: String(b.runId ?? ''),
    sessionId: typeof b.sessionId === 'string' ? b.sessionId : undefined,
    workspace: String(b.workspace ?? ''),
    ttlMs: typeof b.ttlMs === 'number' ? b.ttlMs : undefined,
  })
  if (!res.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: res.problems }
    return
  }
  ctx.body = res
})

router.post('/sandbox/sweep', async (ctx) => {
  if (writeDenied(ctx)) return
  const b = (ctx.request.body ?? {}) as Record<string, unknown>
  const result = sweepExpiredLeases({ dryRun: b.dryRun === true })
  if (!result.root) {
    ctx.status = 409
    ctx.body = { ok: false, detail: '未配置 HERMES_SANDBOX_WORKSPACES_ROOT，拒绝清扫', ...result }
    return
  }
  ctx.body = { ok: true, ...result }
})

// 九层运行体检（2026-10-18 Harness 可靠性轮）：按源文九层逐项给证据与差距。
// 30s 进程内缓存：采集要读审计账/检查点库/评测库，治理页轮询不应重复扫盘。
let nineLayersCache: { at: number; days: number; report: NineLayersReport } | null = null
const NINE_LAYERS_TTL_MS = 30_000

router.get('/nine-layers', async (ctx) => {
  try {
    const days = daysOf(ctx.query.days)
    const now = Date.now()
    if (!nineLayersCache || nineLayersCache.days !== days || now - nineLayersCache.at > NINE_LAYERS_TTL_MS) {
      const inputs = await collectNineLayersInputs(days)
      nineLayersCache = { at: now, days, report: buildNineLayers(inputs) }
    }
    ctx.body = { ...nineLayersCache.report, ok: true, cachedAt: nineLayersCache.at }
  } catch (e) {
    ctx.status = 500
    ctx.body = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// P2-5：启动时把 qgate FAIL/CONDITIONAL 回流成经验候选（指纹幂等、fail-soft）。
// 测试环境跳过：避免单测扫描真实 .qgate/runs 并写真实经验库。
if (process.env.NODE_ENV !== 'test') {
  void import('../expcandidates/exp-store')
    .then((m) => m.ingestQgateRuns())
    .catch(() => { /* 回流失败不影响治理面 */ })
  // 残余项⑥：沙箱租约 janitor（显式配置根与间隔才启动）。
  startSandboxJanitorIfEnabled()
}

export const harnessRoutes = router
