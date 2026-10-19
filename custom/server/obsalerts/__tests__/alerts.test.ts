// 基线漂移告警守门（2026-10-19 观测层轮）：四类告警触发/跳过路径/阈值 env 覆盖/
// 严重度升档，全部纯函数判定。
import { describe, expect, it } from 'vitest'
import { buildObsAlerts, thresholdsFromEnv, DEFAULT_THRESHOLDS, type WindowInput } from '../alerts'

function window(over: Partial<WindowInput> = {}): WindowInput {
  return {
    llmCalls: 100,
    llmErrors: 1,
    toolCalls: 50,
    toolFailures: 1,
    totalTokens: 10_000,
    ttftP95: 1000,
    errorRate: 0.0133,
    ...over,
  }
}

function baseInput(over: Record<string, unknown> = {}) {
  return {
    current: window(),
    baseline: window({ totalTokens: 21_000 }), // 基线 3 天日均 7000
    baselineDays: 3,
    currentQualityMean: 0.8,
    baselineQualityMean: 0.85,
    baselineQualityRuns: 3,
    ...over,
  }
}

describe('buildObsAlerts 四类告警', () => {
  it('无漂移 → 零告警零跳过', () => {
    const r = buildObsAlerts(baseInput())
    expect(r.alerts).toEqual([])
    expect(r.skipped).toEqual([])
    expect(r.thresholds).toEqual(DEFAULT_THRESHOLDS)
  })

  it('成本尖峰：当日 token ≥ 基线日均 2x 触发，≥4x 升 critical', () => {
    const r = buildObsAlerts(baseInput({ current: window({ totalTokens: 15_000 }) }))
    const a = r.alerts.find((x) => x.kind === 'cost-spike')
    expect(a).toBeDefined()
    expect(a?.severity).toBe('warn')
    expect(a?.ratio).toBeCloseTo(15000 / 7000, 2)
    expect(a?.evidence).toContain('倍')
    const crit = buildObsAlerts(baseInput({ current: window({ totalTokens: 30_000 }) }))
    expect(crit.alerts.find((x) => x.kind === 'cost-spike')?.severity).toBe('critical')
  })

  it('延迟尖峰：TTFT p95 比率 ≥1.5x 触发', () => {
    const r = buildObsAlerts(baseInput({ current: window({ ttftP95: 1600 }) }))
    const a = r.alerts.find((x) => x.kind === 'latency-spike')
    expect(a).toBeDefined()
    expect(a?.ratio).toBeCloseTo(1.6, 2)
  })

  it('错误率：综合错误率较基线 +10pp 触发（差值口径非比率）', () => {
    const r = buildObsAlerts(baseInput({ current: window({ errorRate: 0.15 }) }))
    const a = r.alerts.find((x) => x.kind === 'error-rate')
    expect(a).toBeDefined()
    expect(a?.deltaPp).toBeCloseTo(13.67, 1)
    // 未达阈值不触发
    const calm = buildObsAlerts(baseInput({ current: window({ errorRate: 0.05 }) }))
    expect(calm.alerts.find((x) => x.kind === 'error-rate')).toBeUndefined()
  })

  it('质量漂移：pass@1 均值下跌 ≥10pp 触发', () => {
    const r = buildObsAlerts(baseInput({ currentQualityMean: 0.7 }))
    const a = r.alerts.find((x) => x.kind === 'quality-drift')
    expect(a).toBeDefined()
    expect(a?.deltaPp).toBeCloseTo(15, 1)
  })
})

describe('buildObsAlerts 跳过路径（如实不猜）', () => {
  it('基线天数不足 → 三项 no_baseline', () => {
    const r = buildObsAlerts(baseInput({ baselineDays: 1 }))
    const kinds = r.skipped.filter((s) => s.reason === 'no_baseline').map((s) => s.kind)
    expect(kinds).toContain('cost-spike')
    expect(kinds).toContain('latency-spike')
    expect(kinds).toContain('error-rate')
    expect(r.alerts).toEqual([])
  })

  it('当日无 LLM 调用 → cost-spike no_data', () => {
    const r = buildObsAlerts(baseInput({ current: window({ llmCalls: 0, totalTokens: 0 }) }))
    expect(r.skipped.find((s) => s.kind === 'cost-spike')?.reason).toBe('no_data')
  })

  it('基线 token 全零（旧 trace 缺 usage）→ cost-spike no_data', () => {
    const r = buildObsAlerts(baseInput({ baseline: window({ totalTokens: 0 }) }))
    expect(r.skipped.find((s) => s.kind === 'cost-spike')?.reason).toBe('no_data')
  })

  it('eval 基线运行不足 → quality-drift no_baseline；当日无运行 → no_data', () => {
    const r = buildObsAlerts(baseInput({ baselineQualityRuns: 1, baselineQualityMean: 0.9 }))
    expect(r.skipped.find((s) => s.kind === 'quality-drift')?.reason).toBe('no_baseline')
    const r2 = buildObsAlerts(baseInput({ currentQualityMean: null }))
    expect(r2.skipped.find((s) => s.kind === 'quality-drift')?.reason).toBe('no_data')
  })

  it('TTFT 缺打点 → latency-spike no_data', () => {
    const r = buildObsAlerts(baseInput({ current: window({ ttftP95: null }) }))
    expect(r.skipped.find((s) => s.kind === 'latency-spike')?.reason).toBe('no_data')
  })
})

describe('thresholdsFromEnv', () => {
  it('env 覆盖生效，非法值落默认', () => {
    const t = thresholdsFromEnv({ OBS_ALERT_COST_RATIO: '3.5', OBS_ALERT_ERROR_PP: 'abc', OBS_ALERT_LATENCY_RATIO: '-1' } as NodeJS.ProcessEnv)
    expect(t.costSpikeRatio).toBe(3.5)
    expect(t.errorRateDeltaPp).toBeUndefined()
    expect(t.latencySpikeRatio).toBeUndefined()
  })

  it('阈值可被 input 覆盖：调高后同漂移不触发', () => {
    const r = buildObsAlerts(baseInput({
      current: window({ totalTokens: 15_000 }),
      thresholds: { costSpikeRatio: 3.0 },
    }))
    expect(r.alerts.find((x) => x.kind === 'cost-spike')).toBeUndefined()
  })
})
