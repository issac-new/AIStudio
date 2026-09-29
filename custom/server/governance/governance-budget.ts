/**
 * SLO 错误预算派发闸（spec 2026-09-29 §8 第二期 ③ 冻结面）。
 *
 * 语义：列编排/mention 派发前，按 step.specialist → 台账单元 → sloTier → metrics.yaml
 * sloTargets 判定该档错误预算是否耗尽（成功率 < 目标且样本 ≥ minSamples）。
 * 模式经 GOVERNANCE_SLO_BUDGET 控制：off=不查；warn（默认）=日志告警放行并记档；
 * enforce=budgetAction=freeze 的档耗尽即抛 BudgetExhaustedError 拒绝派发。
 * 硬冻结仅 core 档可配（校验器在 governance-ledger.ts 强制），防一般档误配拦死全链路。
 * SLO 计算有 60s TTL 缓存——kanban 聚合一分钟内的重复派发不重复扫库。
 */
import { loadCapabilityLedger, loadMetricsDefs } from './governance-ledger'
import { collectAssigneeStats, computeSloReport, type SloReport } from './governance-analytics'

export class BudgetExhaustedError extends Error {
  readonly tier: string
  readonly successRate: number
  readonly target: number
  constructor(tier: string, successRate: number, target: number) {
    super(`SLO 错误预算耗尽：${tier} 档成功率 ${(successRate * 100).toFixed(1)}% < 目标 ${(target * 100).toFixed(0)}%（样本达标，budgetAction=freeze）`)
    this.name = 'BudgetExhaustedError'
    this.tier = tier
    this.successRate = successRate
    this.target = target
  }
}

export type BudgetMode = 'off' | 'warn' | 'enforce'

export function budgetMode(): BudgetMode {
  const v = (process.env.GOVERNANCE_SLO_BUDGET || 'warn').trim()
  return v === 'off' || v === 'enforce' ? v : 'warn'
}

interface SloCache { at: number; report: SloReport }
let sloCache: SloCache | null = null
const SLO_TTL_MS = 60_000

export function resetBudgetCacheForTests(): void {
  sloCache = null
}

interface BudgetDeps {
  sloReport: () => Promise<SloReport>
  unitTier: (specialistId: string) => string | null
}

function defaultDeps(): BudgetDeps {
  return {
    async sloReport() {
      if (sloCache && Date.now() - sloCache.at < SLO_TTL_MS) return sloCache.report
      const ledger = loadCapabilityLedger()
      const metrics = loadMetricsDefs()
      const report = ledger.doc
        ? computeSloReport(ledger.doc, metrics.doc ?? null, await collectAssigneeStats())
        : { windowDays: 30, tiers: [], unmapped: { closed: 0, done: 0, successRate: null, assignees: [] }, dataAvailable: false }
      sloCache = { at: Date.now(), report }
      return report
    },
    unitTier(specialistId: string) {
      const ledger = loadCapabilityLedger()
      return ledger.doc?.units.find((u) => u.id === specialistId)?.sloTier ?? null
    },
  }
}

export interface BudgetCheck {
  allowed: boolean
  mode: BudgetMode
  note?: string
}

/**
 * 派发预算判定。specialistId 为列编排 step.specialist（台账单元 id，守门已断言入账）。
 * 台账缺档/未配目标/非 freeze 档 → 放行（warn 档的告警在 UI 横幅与 SLO API 呈现）。
 */
export async function checkDispatchBudget(specialistId: string, deps: BudgetDeps = defaultDeps()): Promise<BudgetCheck> {
  const mode = budgetMode()
  if (mode === 'off') return { allowed: true, mode }
  const tier = deps.unitTier(specialistId)
  if (!tier) return { allowed: true, mode, note: `specialist ${specialistId} 台账无档，预算判定跳过` }
  const metrics = loadMetricsDefs()
  const target = (metrics.doc as { sloTargets?: Record<string, { successRate: number; budgetAction: string }> } | null)?.sloTargets?.[tier]
  if (!target || target.budgetAction !== 'freeze') return { allowed: true, mode }
  const report = await deps.sloReport()
  const tierReport = report.tiers.find((t) => t.tier === tier)
  if (!tierReport?.exhausted) return { allowed: true, mode }
  const rate = tierReport.successRate ?? 0
  if (mode === 'enforce') {
    throw new BudgetExhaustedError(tier, rate, target.successRate)
  }
  console.warn(`[slo-budget] ${tier} 档错误预算耗尽（成功率 ${(rate * 100).toFixed(1)}% < ${(target.successRate * 100).toFixed(0)}%）——warn 模式放行；GOVERNANCE_SLO_BUDGET=enforce 转硬冻结`)
  return { allowed: true, mode, note: `${tier} 档预算耗尽（warn 放行）` }
}
