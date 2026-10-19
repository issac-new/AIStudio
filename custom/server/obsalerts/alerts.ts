// overlay/obsalerts 域：基线漂移告警（2026-10-19 观测层轮，spec 2026-10-19-observability-signals-round）。
//
// 源文《AI-Native可观测层》告警口径：聚焦四类——成本尖峰、延迟尖峰、错误率、
// 幻觉/质量分数；「告警阈值应该基于系统自己的基线漂移来定，而不是拍一个绝对数值」。
// 本模块是纯函数判定（不 IO）：最近 24h 窗口统计 vs 前 N 天基线，比率/差值超阈
// 才告警；基线不足/无数据如实 skipped，不猜数不硬报。

export type ObsAlertKind = 'cost-spike' | 'latency-spike' | 'error-rate' | 'quality-drift'
export type ObsAlertSeverity = 'warn' | 'critical'

export interface ObsAlertThresholds {
  /** 成本尖峰：当日 token / 基线日均 token 的比率阈（token 为成本代理）。 */
  costSpikeRatio: number
  /** 延迟尖峰：当日 TTFT p95 / 基线 TTFT p95 的比率阈。 */
  latencySpikeRatio: number
  /** 错误率：综合错误率绝对增量阈（百分点）。 */
  errorRateDeltaPp: number
  /** 质量漂移：eval passAt1 均值下跌阈（百分点）。 */
  qualityDropPp: number
  /** 基线最少有效天数/样本数，不足=skipped no_baseline。 */
  minBaselineSamples: number
}

export const DEFAULT_THRESHOLDS: ObsAlertThresholds = {
  costSpikeRatio: 2.0,
  latencySpikeRatio: 1.5,
  errorRateDeltaPp: 10,
  qualityDropPp: 10,
  minBaselineSamples: 2,
}

export interface ObsAlert {
  kind: ObsAlertKind
  severity: ObsAlertSeverity
  current: number | null
  baseline: number | null
  /** 比率类告警的实测比率。 */
  ratio?: number | null
  /** 差值类告警的实测增量（百分点）。 */
  deltaPp?: number | null
  threshold: number
  evidence: string
}

export interface ObsAlertSkipped {
  kind: ObsAlertKind
  reason: 'no_baseline' | 'no_data'
  detail: string
}

export interface WindowInput {
  llmCalls: number
  llmErrors: number
  toolCalls: number
  toolFailures: number
  totalTokens: number
  ttftP95: number | null
  errorRate: number | null
}

export interface ObsAlertsInput {
  /** 最近 24h 窗口统计。 */
  current: WindowInput
  /** 前 N 天基线窗口统计（整窗合并）。 */
  baseline: WindowInput
  /** 基线覆盖的有效天数（有数据的天）。 */
  baselineDays: number
  /** 最近 24h eval passAt1 均值（0-1）；无运行=null。 */
  currentQualityMean: number | null
  /** 基线窗 eval passAt1 均值与运行数；无运行=null。 */
  baselineQualityMean: number | null
  baselineQualityRuns: number
  thresholds?: Partial<ObsAlertThresholds>
}

export interface ObsAlertsReport {
  alerts: ObsAlert[]
  skipped: ObsAlertSkipped[]
  thresholds: ObsAlertThresholds
}

const round4 = (v: number): number => Math.round(v * 10000) / 10000
const round2 = (v: number): number => Math.round(v * 100) / 100

/** 比率类严重度：实测比率 ≥ 阈值×2 升 critical。 */
function ratioSeverity(ratio: number, threshold: number): ObsAlertSeverity {
  return ratio >= threshold * 2 ? 'critical' : 'warn'
}

/** 纯判定：四类基线漂移告警。 */
export function buildObsAlerts(input: ObsAlertsInput): ObsAlertsReport {
  const thresholds: ObsAlertThresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds }
  const alerts: ObsAlert[] = []
  const skipped: ObsAlertSkipped[] = []
  const hasBaseline = input.baselineDays >= thresholds.minBaselineSamples

  // ① 成本尖峰（token 代理成本；定价侧成本账在 cost-accounts，本告警用 token 体量漂移）
  if (!hasBaseline) {
    skipped.push({ kind: 'cost-spike', reason: 'no_baseline', detail: `基线有效天数 ${input.baselineDays} < ${thresholds.minBaselineSamples}` })
  } else if (input.current.llmCalls === 0) {
    skipped.push({ kind: 'cost-spike', reason: 'no_data', detail: '最近 24h 无 LLM 调用' })
  } else {
    const baselineDaily = input.baseline.totalTokens / input.baselineDays
    if (baselineDaily <= 0) {
      skipped.push({ kind: 'cost-spike', reason: 'no_data', detail: '基线 token 为零（历史 trace 可能缺 usage 字段）' })
    } else {
      const ratio = input.current.totalTokens / baselineDaily
      if (ratio >= thresholds.costSpikeRatio) {
        alerts.push({
          kind: 'cost-spike',
          severity: ratioSeverity(ratio, thresholds.costSpikeRatio),
          current: input.current.totalTokens,
          baseline: Math.round(baselineDaily),
          ratio: round4(ratio),
          threshold: thresholds.costSpikeRatio,
          evidence: `当日 token ${input.current.totalTokens} 是基线日均 ${Math.round(baselineDaily)} 的 ${round2(ratio)} 倍（阈 ${thresholds.costSpikeRatio}x）`,
        })
      }
    }
  }

  // ② 延迟尖峰（TTFT p95 比率）
  if (!hasBaseline) {
    skipped.push({ kind: 'latency-spike', reason: 'no_baseline', detail: `基线有效天数 ${input.baselineDays} < ${thresholds.minBaselineSamples}` })
  } else if (input.current.ttftP95 == null) {
    skipped.push({ kind: 'latency-spike', reason: 'no_data', detail: '最近 24h 无 TTFT 打点（非流式或旧版 trace）' })
  } else if (input.baseline.ttftP95 == null || input.baseline.ttftP95 <= 0) {
    skipped.push({ kind: 'latency-spike', reason: 'no_data', detail: '基线无 TTFT 打点' })
  } else {
    const ratio = input.current.ttftP95 / input.baseline.ttftP95
    if (ratio >= thresholds.latencySpikeRatio) {
      alerts.push({
        kind: 'latency-spike',
        severity: ratioSeverity(ratio, thresholds.latencySpikeRatio),
        current: input.current.ttftP95,
        baseline: input.baseline.ttftP95,
        ratio: round4(ratio),
        threshold: thresholds.latencySpikeRatio,
        evidence: `当日 TTFT p95 ${input.current.ttftP95}ms 是基线 ${input.baseline.ttftP95}ms 的 ${round2(ratio)} 倍（阈 ${thresholds.latencySpikeRatio}x）`,
      })
    }
  }

  // ③ 错误率（LLM 错误 + 工具失败综合，绝对增量 pp）
  if (!hasBaseline) {
    skipped.push({ kind: 'error-rate', reason: 'no_baseline', detail: `基线有效天数 ${input.baselineDays} < ${thresholds.minBaselineSamples}` })
  } else if (input.current.errorRate == null) {
    skipped.push({ kind: 'error-rate', reason: 'no_data', detail: '最近 24h 无 LLM/工具调用' })
  } else if (input.baseline.errorRate == null) {
    skipped.push({ kind: 'error-rate', reason: 'no_data', detail: '基线无 LLM/工具调用' })
  } else {
    const deltaPp = (input.current.errorRate - input.baseline.errorRate) * 100
    if (deltaPp >= thresholds.errorRateDeltaPp) {
      alerts.push({
        kind: 'error-rate',
        severity: deltaPp >= thresholds.errorRateDeltaPp * 2 ? 'critical' : 'warn',
        current: round4(input.current.errorRate),
        baseline: round4(input.baseline.errorRate),
        deltaPp: round2(deltaPp),
        threshold: thresholds.errorRateDeltaPp,
        evidence: `综合错误率 ${round2(input.current.errorRate * 100)}% 较基线 ${round2(input.baseline.errorRate * 100)}% 上升 ${round2(deltaPp)}pp（阈 +${thresholds.errorRateDeltaPp}pp）`,
      })
    }
  }

  // ④ 质量漂移（eval passAt1 均值下跌 pp）
  if (input.baselineQualityMean == null || input.baselineQualityRuns < thresholds.minBaselineSamples) {
    skipped.push({ kind: 'quality-drift', reason: 'no_baseline', detail: `基线 eval 运行数 ${input.baselineQualityRuns} < ${thresholds.minBaselineSamples}` })
  } else if (input.currentQualityMean == null) {
    skipped.push({ kind: 'quality-drift', reason: 'no_data', detail: '最近 24h 无 eval 运行' })
  } else {
    const deltaPp = (input.baselineQualityMean - input.currentQualityMean) * 100
    if (deltaPp >= thresholds.qualityDropPp) {
      alerts.push({
        kind: 'quality-drift',
        severity: deltaPp >= thresholds.qualityDropPp * 2 ? 'critical' : 'warn',
        current: round4(input.currentQualityMean),
        baseline: round4(input.baselineQualityMean),
        deltaPp: round2(deltaPp),
        threshold: thresholds.qualityDropPp,
        evidence: `eval pass@1 均值 ${round2(input.currentQualityMean * 100)}% 较基线 ${round2(input.baselineQualityMean * 100)}% 下跌 ${round2(deltaPp)}pp（阈 -${thresholds.qualityDropPp}pp）`,
      })
    }
  }

  return { alerts, skipped, thresholds }
}

/** env 覆盖阈值（OBS_ALERT_*）；缺省/非法值落默认。 */
export function thresholdsFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<ObsAlertThresholds> {
  const num = (v: string | undefined): number | undefined => {
    if (!v) return undefined
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const out: Partial<ObsAlertThresholds> = {}
  const cost = num(env.OBS_ALERT_COST_RATIO)
  const latency = num(env.OBS_ALERT_LATENCY_RATIO)
  const errPp = num(env.OBS_ALERT_ERROR_PP)
  const qualPp = num(env.OBS_ALERT_QUALITY_PP)
  if (cost !== undefined) out.costSpikeRatio = cost
  if (latency !== undefined) out.latencySpikeRatio = latency
  if (errPp !== undefined) out.errorRateDeltaPp = errPp
  if (qualPp !== undefined) out.qualityDropPp = qualPp
  return out
}
