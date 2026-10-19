// overlay[eval] 发布门禁（腾讯评测体系轮，2026-10-13）。
//
// 范式来源：《腾讯 Agent 评测体系技术拆解》§08 Pre-Launch 清单——把「上线就绪」从
// 主观判断转成可机械执行的 gate。阈值照抄文章：TTFT ≤1.5s、P99 ≤2×均值、
// 工具调用成功率 ≥99%、降级率 <0.5%（env 可调）。
//
// 诚实契约：回放判分证据里没有的指标（TTFT/响应分档/QPS 压测）不硬凑代理值，
// 如实标 no_data + 证据缺口说明——缺口清单本身就是评测覆盖度的产品面。
import type { Attempt, LiveEvidence } from './types'
import { p99Of, toolSuccessRateOf } from './metrics'

export interface ReleaseGateCheck {
  key: 'tool_success' | 'p99_ratio' | 'degrade_rate' | 'ttft' | 'response_tier' | 'qps_headroom'
  /** 阈值口径（呈现用，如 "≥ 99%"）。 */
  threshold: string
  /** 实测读数（呈现用，如 "99.3%"）；no_data 时为 null。 */
  measured: string | null
  status: 'pass' | 'fail' | 'no_data'
  /** 证据缺口说明（no_data 项必填）。 */
  gap?: string
  /** 证据来源（live 回填项注明，如 mx-load-probe）。 */
  source?: string
}

export interface ReleaseGateSummary {
  /** fail=实测项有不过；pass=实测项全过（缺口项单列 gaps）；no_data=无任何实测项。 */
  verdict: 'pass' | 'fail' | 'no_data'
  checks: ReleaseGateCheck[]
  measuredCount: number
  gapKeys: string[]
  /** 数据面说明（降级率口径等呈现给读者）。 */
  basis: string
  /** 实测项数值面（六维分面等下游直接消费，不反解析呈现串）。 */
  numeric: { toolSuccessRate: number | null; p99Ratio: number | null; degradeRate: number | null }
}

export interface ReleaseGateConfig {
  toolSuccessMin: number
  p99RatioMax: number
  degradeRateMax: number
  ttftMaxMs: number
}

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const v = Number(raw)
  return Number.isFinite(v) ? v : fallback
}

export function loadReleaseGateConfig(): ReleaseGateConfig {
  return {
    toolSuccessMin: num('EVAL_GATE_TOOL_SUCCESS_MIN', 0.99),
    p99RatioMax: num('EVAL_GATE_P99_RATIO_MAX', 2),
    degradeRateMax: num('EVAL_GATE_DEGRADE_RATE_MAX', 0.005),
    ttftMaxMs: num('EVAL_GATE_TTFT_MS', 1500),
  }
}

function pct(v: number): string {
  return `${(v * 100).toFixed(v * 100 >= 10 ? 1 : 2)}%`
}

/** 发布门禁评估（纯函数）：从 attempt 证据面机械执行阈值清单；live 证据回填后 qps/分档项转真判（B7）。 */
export function evaluateReleaseGate(
  attempts: Attempt[],
  config: ReleaseGateConfig,
  live?: Pick<LiveEvidence, 'qpsProbe' | 'responseTiers'>,
): ReleaseGateSummary {
  const checks: ReleaseGateCheck[] = []

  // ① 工具调用成功率 ≥ 99%
  const toolRate = toolSuccessRateOf(attempts)
  checks.push(
    toolRate === null
      ? { key: 'tool_success', threshold: `≥ ${pct(config.toolSuccessMin)}`, measured: null, status: 'no_data', gap: '样本证据无工具调用记录' }
      : {
          key: 'tool_success',
          threshold: `≥ ${pct(config.toolSuccessMin)}`,
          measured: pct(toolRate),
          status: toolRate >= config.toolSuccessMin ? 'pass' : 'fail',
        },
  )

  // ② P99 ≤ 2×均值（attempt 级耗时分布；n<2 无统计意义）
  const durations = attempts.map((a) => a.efficiency?.durationMs).filter((v): v is number => typeof v === 'number')
  const p99 = p99Of(durations)
  const mean = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null
  const ratio = p99 !== null && mean !== null && mean > 0 ? p99 / mean : null
  checks.push(
    ratio === null
      ? { key: 'p99_ratio', threshold: `≤ ${config.p99RatioMax}×均值`, measured: null, status: 'no_data', gap: '耗时样本 <2 或均值为 0' }
      : {
          key: 'p99_ratio',
          threshold: `≤ ${config.p99RatioMax}×均值`,
          measured: `${ratio.toFixed(2)}×`,
          status: ratio <= config.p99RatioMax ? 'pass' : 'fail',
        },
  )

  // ③ 降级率 < 0.5%（口径：判定端离线走 fail-open 纯 S0 = 一次降级事件）
  const judged = attempts.filter((a) => a.judgeMeta !== undefined)
  const degraded = judged.filter((a) => a.judgeMeta?.online === false).length
  checks.push(
    judged.length === 0
      ? { key: 'degrade_rate', threshold: `< ${pct(config.degradeRateMax)}`, measured: null, status: 'no_data', gap: '样本无判定端元数据' }
      : {
          key: 'degrade_rate',
          threshold: `< ${pct(config.degradeRateMax)}`,
          measured: pct(degraded / judged.length),
          status: degraded / judged.length < config.degradeRateMax ? 'pass' : 'fail',
        },
  )

  // ④ TTFT ≤1.5s：trace 具备首 token 打点才有读数（挂账清偿轮接线接收端；
  //    当前 L2 轨迹普遍未打点 → 如实缺口，不硬凑代理值）
  const ttfts = attempts.map((a) => a.efficiency?.ttftMs).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const ttftWorst = ttfts.length > 0 ? Math.max(...ttfts) : null
  checks.push(
    ttftWorst === null
      ? { key: 'ttft', threshold: `≤ ${(config.ttftMaxMs / 1000).toFixed(1)}s`, measured: null, status: 'no_data', gap: '回放轨迹未采集首 token 时延（TTFT 需 live 打点）' }
      : {
          key: 'ttft',
          threshold: `≤ ${(config.ttftMaxMs / 1000).toFixed(1)}s`,
          measured: `${(ttftWorst / 1000).toFixed(2)}s（最差/${ttfts.length} 样本）`,
          status: ttftWorst <= config.ttftMaxMs ? 'pass' : 'fail',
        },
  )
  // ⑤⑥ 在线服务口径项（B7）：live 证据回填后转真判（口径对齐 mx-load-probe），否则如实缺口
  // （顺序契约：response_tier 在前、qps_headroom 在后——既有报告/测试按此序锁定）
  const tiers = live?.responseTiers ?? []
  const tierSimple = tiers.find((t) => t.tier === 'simple')
  const tierComplex = tiers.find((t) => t.tier === 'complex')
  if (tiers.length > 0) {
    const parts: string[] = []
    let tierOk = true
    if (tierSimple) {
      const ok = tierSimple.p95Ms <= 5000
      tierOk = tierOk && ok
      parts.push(`简单 p95 ${(tierSimple.p95Ms / 1000).toFixed(2)}s（${tierSimple.samples} 样本）${ok ? '' : '✗'}`)
    }
    if (tierComplex) {
      const ok = tierComplex.p95Ms <= 15000
      tierOk = tierOk && ok
      parts.push(`复杂 p95 ${(tierComplex.p95Ms / 1000).toFixed(2)}s（${tierComplex.samples} 样本）${ok ? '' : '✗'}`)
    }
    const src = tierSimple?.source ?? tierComplex?.source
    checks.push({
      key: 'response_tier',
      threshold: '简单 ≤5s / 复杂 ≤15s（p95）',
      measured: parts.join(' · '),
      status: tierOk ? 'pass' : 'fail',
      ...(src ? { source: src } : {}),
    })
  } else {
    checks.push({
      key: 'response_tier',
      threshold: '简单 ≤5s / 复杂 ≤15s（p95）',
      measured: null,
      status: 'no_data',
      gap: '交互响应分档属在线服务口径；实测后经 /runs/:id/live-evidence 回填',
    })
  }

  const qps = live?.qpsProbe
  if (qps) {
    const qpsOk = qps.achievedQps >= 0.9 * qps.targetQps && qps.errorRate < 0.01 && qps.p99ToP50 <= 2
    checks.push({
      key: 'qps_headroom',
      threshold: '峰值 QPS ×2 压测通过（达成≥90%、错误率<1%、p99≤2×p50）',
      measured: `${qps.achievedQps.toFixed(1)}/${qps.targetQps.toFixed(1)} QPS · 错误率 ${pct(qps.errorRate)} · p99/p50 ${qps.p99ToP50.toFixed(2)}×`,
      status: qpsOk ? 'pass' : 'fail',
      ...(qps.source ? { source: qps.source } : {}),
    })
  } else {
    checks.push({
      key: 'qps_headroom',
      threshold: '峰值 QPS ×2 压测通过',
      measured: null,
      status: 'no_data',
      gap: '容量压测属部署验收（回放判分零并发负载）；压测后经 /runs/:id/live-evidence 回填',
    })
  }

  const measured = checks.filter((c) => c.status !== 'no_data')
  const verdict = measured.some((c) => c.status === 'fail') ? 'fail' : measured.length > 0 ? 'pass' : 'no_data'
  const liveNote = qps || tiers.length > 0 ? '；线上项=live 证据回填' : ''
  return {
    verdict,
    checks,
    measuredCount: measured.length,
    gapKeys: checks.filter((c) => c.status === 'no_data').map((c) => c.key),
    basis: `${ttftWorst === null ? '降级率口径=判定端离线 fail-open 样本占比；TTFT 需 live 打点' : '降级率口径=判定端离线 fail-open 样本占比；TTFT=最差样本首 token 时延'}${liveNote}（缺口项见 gapKeys）`,
    numeric: { toolSuccessRate: toolRate, p99Ratio: ratio, degradeRate: judged.length === 0 ? null : degraded / judged.length },
  }
}
