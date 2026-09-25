/**
 * token-meter REST（/api/token-meter/*）——第一批吸收 #9。
 *
 * POST /api/token-meter/project   { attempts, pressure?, breakdown? } → 三投影一次算齐
 * POST /api/token-meter/zcode     { summary } → zcode rounds 契约互校（映射+对账）
 *
 * 挂载：B 类 patch 403 在 bootstrap/routes.ts（与 380/402 同款模式）。
 */
import Router from '@koa/router'
import {
  attemptLedger, cacheHitPercent, deriveContextBreakdown, deriveContextPressure,
  deriveTokenUsage, fromZcodeUsageSummary, type AttemptUsage,
} from './meter-projections'
import { estimateCost, loadPricingTable, matchPriceKey } from './pricing'

const router = new Router({ prefix: '/api/token-meter' })

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

router.post('/project', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const rawAttempts = Array.isArray(body.attempts) ? body.attempts : []
  const attempts: AttemptUsage[] = []
  for (const ra of rawAttempts) {
    const r = ra as Record<string, unknown>
    const inputTokens = num(r.inputTokens)
    const outputTokens = num(r.outputTokens)
    if (inputTokens === undefined || outputTokens === undefined) continue // 证据不全不估
    attempts.push({
      inputTokens, outputTokens,
      cacheReadTokens: num(r.cacheReadTokens),
      cacheCreationTokens: num(r.cacheCreationTokens),
      ttftMs: num(r.ttftMs),
      decodeMs: num(r.decodeMs),
    })
  }
  const usage = deriveTokenUsage(attempts)
  const result: Record<string, unknown> = {
    ok: true,
    tokenUsage: usage,
    cacheHitPercent: cacheHitPercent(usage),
    attemptLedger: attemptLedger(attempts),
  }
  const p = body.pressure as Record<string, unknown> | undefined
  if (p && num(p.pressureTokens) !== undefined && num(p.projectedTokens) !== undefined && num(p.contextWindow)! > 0) {
    result.contextPressure = deriveContextPressure(num(p.pressureTokens)!, num(p.projectedTokens)!, num(p.contextWindow)!)
  }
  const b = body.breakdown as Record<string, unknown> | undefined
  if (b && num(b.systemTokens) !== undefined && num(b.toolsTokens) !== undefined && num(b.messageTokens) !== undefined && num(b.surfaceTokens) !== undefined) {
    result.contextBreakdown = deriveContextBreakdown(num(b.systemTokens)!, num(b.toolsTokens)!, num(b.messageTokens)!, num(b.surfaceTokens)!)
  }
  ctx.body = result
})

router.post('/zcode', async (ctx) => {
  const s = (ctx.request.body ?? {}) as Record<string, unknown>
  if (num(s.inputTokens) === undefined || num(s.outputTokens) === undefined) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'summary.inputTokens/outputTokens 必填（zcode UsageStatsSummary 契约）' }
    return
  }
  const mapped = fromZcodeUsageSummary({
    inputTokens: num(s.inputTokens)!,
    outputTokens: num(s.outputTokens)!,
    cacheReadTokens: num(s.cacheReadTokens),
    cacheCreationTokens: num(s.cacheCreationTokens),
    reasoningTokens: num(s.reasoningTokens),
  })
  ctx.body = { ok: true, ...mapped, reconcileOk: mapped.reconcile.length === 0 }
})

router.post('/cost', async (ctx) => {
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const model = typeof body.model === 'string' ? body.model : ''
  const u = (body.usage ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  if (!model) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'model 必填' }
    return
  }
  const table = loadPricingTable()
  const key = matchPriceKey(table, model)
  if (!key) {
    // dsh 原则 3：未收录模型不显示金额（HTTP 200 + available:false，UI 不渲染金额）。
    ctx.body = { ok: true, available: false, model, priced: Object.keys(table.models).length }
    return
  }
  const estimate = estimateCost(model, {
    uncachedInput: num(u.uncachedInput), output: num(u.output),
    cacheRead: num(u.cacheRead), cacheWrite: num(u.cacheWrite),
  }, table)
  ctx.body = { ok: true, available: true, estimate }
})

export const tokenMeterRoutes = router
