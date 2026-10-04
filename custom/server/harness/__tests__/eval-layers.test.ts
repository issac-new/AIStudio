// eval-layers 域单测：四层分类、instrumented/gap 立账、五治理口径原文在档、
// 源缺席不造数（2026-10-04 九源调研落地项②）。
import { describe, expect, it } from 'vitest'
import { buildEvalLayers, GOVERNANCE_METRIC_DEFINITIONS, type EvalLayersInputs } from '../eval-layers'

const base: EvalLayersInputs = {
  days: 7,
  dispatch: { dispatched: 42, deliveredRate: 0.9, failedRate: 0.05 },
  tokenTotal: 1_234_567,
  waitP95Seconds: 320,
  reworkHours: 2.5,
  interventionsCount: 6,
}

describe('buildEvalLayers 四层分类', () => {
  it('四层齐备且 key 固定', () => {
    const r = buildEvalLayers(base)
    expect(r.layers.map((l) => l.key)).toEqual(['result', 'execution', 'resource', 'governance'])
  })

  it('instrumented 指标取到真实输入值', () => {
    const r = buildEvalLayers(base)
    const byKey = new Map(r.layers.flatMap((l) => l.metrics).map((m) => [m.key, m]))
    expect(byKey.get('dispatchDeliveredRate')).toMatchObject({ status: 'instrumented', value: 0.9 })
    expect(byKey.get('tokenTotal')).toMatchObject({ status: 'instrumented', value: 1_234_567 })
    expect(byKey.get('waitP95Seconds')).toMatchObject({ status: 'instrumented', value: 320 })
    expect(byKey.get('reworkHours')).toMatchObject({ status: 'instrumented', value: 2.5 })
    expect(byKey.get('humanInterventions')).toMatchObject({ status: 'instrumented', value: 6 })
  })

  it('源缺席置 null 不造数（fail-soft）', () => {
    const r = buildEvalLayers({ ...base, dispatch: null, tokenTotal: null, waitP95Seconds: null, reworkHours: null, interventionsCount: null })
    for (const m of r.layers.flatMap((l) => l.metrics)) {
      if (m.status === 'instrumented') expect(m.value).toBeNull()
    }
  })
})

describe('五治理指标 gap 立账', () => {
  it('五指标全在、全 gap、value=null、definition 为原文口径', () => {
    const r = buildEvalLayers(base)
    const gapKeys = r.layers.flatMap((l) => l.metrics).filter((m) => m.status === 'gap').map((m) => m.key)
    expect(gapKeys).toEqual([
      'escapedDefectRate',
      'routeViolationRate',
      'budgetStopAccuracy',
      'duplicateSideEffectRate',
      'recoverySuccessRate',
      'humanTakeoverRate',
    ])
    // 五治理口径（ escapedDefectRate 是本仓补充，非源文五指标之一）
    for (const key of ['routeViolationRate', 'budgetStopAccuracy', 'duplicateSideEffectRate', 'recoverySuccessRate', 'humanTakeoverRate']) {
      const m = r.layers.flatMap((l) => l.metrics).find((x) => x.key === key)
      expect(m, key).toBeDefined()
      expect(m!.value).toBeNull()
      expect(m!.definition).toBe(GOVERNANCE_METRIC_DEFINITIONS[key])
      expect(m!.definition!.length).toBeGreaterThan(10)
    }
  })

  it('GOVERNANCE_METRIC_DEFINITIONS 口径含分母语义（可执行口径而非口号）', () => {
    for (const [key, def] of Object.entries(GOVERNANCE_METRIC_DEFINITIONS)) {
      expect(def, key).toMatch(/\//)
    }
  })

  it('counts 与 metric 状态一致', () => {
    const r = buildEvalLayers(base)
    const all = r.layers.flatMap((l) => l.metrics)
    expect(r.counts.instrumented).toBe(all.filter((m) => m.status === 'instrumented').length)
    expect(r.counts.gap).toBe(all.filter((m) => m.status === 'gap').length)
  })
})
