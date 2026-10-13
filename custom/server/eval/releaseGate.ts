// overlay[eval] 发布门禁（腾讯评测体系轮，2026-10-13）。
//
// 范式来源：《腾讯 Agent 评测体系技术拆解》§08 Pre-Launch 清单——把「上线就绪」从
// 主观判断转成可机械执行的 gate。阈值照抄文章：TTFT ≤1.5s、P99 ≤2×均值、
// 工具调用成功率 ≥99%、降级率 <0.5%（env 可调）。
//
// 诚实契约：回放判分证据里没有的指标（TTFT/响应分档/QPS 压测）不硬凑代理值，
// 如实标 no_data + 证据缺口说明——缺口清单本身就是评测覆盖度的产品面。
import type { Attempt } from './types'
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

/** 发布门禁评估（纯函数）：从 attempt 证据面机械执行阈值清单。 */
export function evaluateReleaseGate(attempts: Attempt[], config: ReleaseGateConfig): ReleaseGateSummary {
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
  // ⑤⑥ 在线服务口径项：回放判分不产生（如实缺口，不硬凑代理值）
  checks.push({
    key: 'response_tier',
    threshold: '简单 ≤5s / 复杂 ≤15s',
    measured: null,
    status: 'no_data',
    gap: '交互响应分档属在线服务口径（回放样本为长任务会话）',
  })
  checks.push({
    key: 'qps_headroom',
    threshold: '峰值 QPS ×2 压测通过',
    measured: null,
    status: 'no_data',
    gap: '容量压测属部署验收（回放判分零并发负载）',
  })

  const measured = checks.filter((c) => c.status !== 'no_data')
  const verdict = measured.some((c) => c.status === 'fail') ? 'fail' : measured.length > 0 ? 'pass' : 'no_data'
  return {
    verdict,
    checks,
    measuredCount: measured.length,
    gapKeys: checks.filter((c) => c.status === 'no_data').map((c) => c.key),
    basis: ttftWorst === null
      ? '降级率口径=判定端离线 fail-open 样本占比；TTFT/响应分档/QPS 为证据缺口项（见 gapKeys）'
      : '降级率口径=判定端离线 fail-open 样本占比；TTFT=最差样本首 token 时延；响应分档/QPS 为证据缺口项',
    numeric: { toolSuccessRate: toolRate, p99Ratio: ratio, degradeRate: judged.length === 0 ? null : degraded / judged.length },
  }
}
