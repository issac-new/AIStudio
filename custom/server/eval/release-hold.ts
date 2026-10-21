// overlay[eval] 指标退化禁发闸（2026-10-21 三号调研落地）。
//
// 来源：《AIGC 四层评测体系》第四层——「每次模型更新全量回归，指标退化禁止
// 上线，小流量灰度+一键回滚」；《评测自动化体系》——线上 bug 修复后强制回灌
// 回归集、核心完成率降超阈值 CI 阻断发布；《Agent 架构设计 20（评测篇）》
// 回归集纪律。现状盘点：releaseGate 六检查只看绝对阈值（≥99% 等），A/B 对比
// 门只对比两次 run；「与最近稳定版比，退化即禁发」这一相对闸缺失——本模块
// 补相对面：候选版 vs 基线版（最近稳定版）的数值对比，任一指标退化越线即
// hold。绝对闸在 releaseGate，相对闸在这里，两闸并联。
import type { ReleaseGateSummary } from './releaseGate'

export interface RegressionThresholds {
  /** 工具成功率允许的最大绝对跌幅（0.005 = 99.3% → 98.7% 即拦）。 */
  toolSuccessRateDrop: number
  /** P99/均值比允许的最大升幅（0.3 = 1.8× → 2.1× 即拦）。 */
  p99RatioRise: number
  /** 降级率允许的最大绝对升幅。 */
  degradeRateRise: number
}

export function loadRegressionThresholds(): RegressionThresholds {
  const num = (name: string, fallback: number): number => {
    const raw = process.env[name]
    if (raw === undefined || raw === '') return fallback
    const v = Number(raw)
    return Number.isFinite(v) ? v : fallback
  }
  return {
    toolSuccessRateDrop: num('EVAL_HOLD_TOOL_SUCCESS_DROP', 0.005),
    p99RatioRise: num('EVAL_HOLD_P99_RATIO_RISE', 0.3),
    degradeRateRise: num('EVAL_HOLD_DEGRADE_RISE', 0.005),
  }
}

export interface MetricRegression {
  metric: 'tool_success' | 'p99_ratio' | 'degrade_rate'
  baseline: number
  candidate: number
  delta: number
  threshold: number
  /** 呈现口径（如 "-0.8pp > 允许 -0.5pp"）。 */
  detail: string
}

export interface ReleaseHoldDecision {
  /** true=禁发（候选绝对闸已红，或相对基线退化越线）。 */
  hold: boolean
  verdict: 'pass' | 'regressed' | 'candidate_failed' | 'no_baseline'
  regressions: MetricRegression[]
  /** 无基线时如实说明（首版无稳定基线，只过绝对闸，不虚报已比对）。 */
  basis: string
}

/**
 * 相对闸求值：候选 releaseGate 摘要 vs 基线（最近稳定版）。
 *   - 候选自身 fail → 直接 hold（candidate_failed，绝对闸优先）。
 *   - 基线缺失/no_data → 不 hold 但如实标 no_baseline（不能虚称「已比对无退化」）。
 *   - 任一可比指标退化越线 → hold + regressions 明细（哪项、基线多少、候选多少、阈值多少）。
 * no_data 的单指标跳过比对（缺口已由 releaseGate gaps 披露，不在这里重复惩罚）。
 */
export function evaluateReleaseHold(
  candidate: ReleaseGateSummary,
  baseline: ReleaseGateSummary | null,
  thresholds: RegressionThresholds = loadRegressionThresholds(),
): ReleaseHoldDecision {
  if (candidate.verdict === 'fail') {
    return { hold: true, verdict: 'candidate_failed', regressions: [], basis: '候选版本自身未过发布门禁六检查（绝对闸），先行拦截' }
  }
  if (!baseline || baseline.verdict === 'no_data') {
    return { hold: false, verdict: 'no_baseline', regressions: [], basis: '无最近稳定版基线可比：只过绝对闸（六检查），相对退化闸未生效' }
  }

  const regressions: MetricRegression[] = []
  const { toolSuccessRate: cTool, p99Ratio: cP99, degradeRate: cDegrade } = candidate.numeric
  const { toolSuccessRate: bTool, p99Ratio: bP99, degradeRate: bDegrade } = baseline.numeric

  if (typeof cTool === 'number' && typeof bTool === 'number' && bTool - cTool > thresholds.toolSuccessRateDrop) {
    regressions.push({
      metric: 'tool_success', baseline: bTool, candidate: cTool,
      delta: cTool - bTool, threshold: thresholds.toolSuccessRateDrop,
      detail: `工具成功率 ${bTool.toFixed(4)} → ${cTool.toFixed(4)}（跌 ${(bTool - cTool).toFixed(4)} > 允许 ${thresholds.toolSuccessRateDrop}）`,
    })
  }
  if (typeof cP99 === 'number' && typeof bP99 === 'number' && cP99 - bP99 > thresholds.p99RatioRise) {
    regressions.push({
      metric: 'p99_ratio', baseline: bP99, candidate: cP99,
      delta: cP99 - bP99, threshold: thresholds.p99RatioRise,
      detail: `P99/均值比 ${bP99.toFixed(2)}× → ${cP99.toFixed(2)}×（升 ${(cP99 - bP99).toFixed(2)} > 允许 ${thresholds.p99RatioRise}）`,
    })
  }
  if (typeof cDegrade === 'number' && typeof bDegrade === 'number' && cDegrade - bDegrade > thresholds.degradeRateRise) {
    regressions.push({
      metric: 'degrade_rate', baseline: bDegrade, candidate: cDegrade,
      delta: cDegrade - bDegrade, threshold: thresholds.degradeRateRise,
      detail: `降级率 ${bDegrade.toFixed(4)} → ${cDegrade.toFixed(4)}（升 ${(cDegrade - bDegrade).toFixed(4)} > 允许 ${thresholds.degradeRateRise}）`,
    })
  }

  if (regressions.length) {
    return { hold: true, verdict: 'regressed', regressions, basis: `相对最近稳定版退化越线 ${regressions.length} 项：指标退化禁止上线` }
  }
  return { hold: false, verdict: 'pass', regressions: [], basis: '绝对闸与相对退化闸均通过（对比基线=最近稳定版）' }
}
