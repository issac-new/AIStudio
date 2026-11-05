import { describe, expect, it } from 'vitest'
import { auditRegistry, inspectMetric, isDecorative, namespaceOfKey, validateMetricInput } from '../policy'
import { BUILTIN_METRICS } from '../store'
import type { MetricDef } from '../types'

function def(patch: Partial<MetricDef> = {}): MetricDef {
  return {
    key: 'measure/example-rate',
    namespace: 'measure',
    title: '示例率',
    definition: '命中数 / 总数',
    sources: ['kanban tasks'],
    consumers: [{ decisionRef: '2026-11-05-org-governance-metric-discipline.md', changedAt: 1 }],
    version: 1,
    ...patch,
  }
}

describe('namespaceOfKey：前缀即命名空间', () => {
  it('识别两条轨', () => {
    expect(namespaceOfKey('measure/a')).toBe('measure')
    expect(namespaceOfKey('settle/a')).toBe('settle')
  })

  it('无前缀返回 null（而不是默认落到 measure）', () => {
    expect(namespaceOfKey('a-rate')).toBeNull()
    expect(namespaceOfKey('Measure/a')).toBeNull()
  })
})

describe('isDecorative：装饰化判据', () => {
  it('无消费者即装饰', () => {
    expect(isDecorative({ consumers: [] })).toBe(true)
  })

  it('有消费者不是装饰', () => {
    expect(isDecorative({ consumers: [{ decisionRef: 'x', changedAt: 1 }] })).toBe(false)
  })
})

describe('inspectMetric：三条判定', () => {
  it('合规指标无问题', () => {
    expect(inspectMetric(def())).toEqual([])
  })

  it('key 前缀缺失报 error', () => {
    const issues = inspectMetric(def({ key: 'example-rate' }))
    expect(issues).toContainEqual(expect.objectContaining({ code: 'namespace-mismatch', severity: 'error' }))
  })

  it('namespace 与 key 前缀不一致报 error', () => {
    const issues = inspectMetric(def({ key: 'settle/x', namespace: 'measure' }))
    expect(issues.some((i) => i.code === 'namespace-mismatch')).toBe(true)
  })

  it('结算指标派生自测量指标报 error（双轨隔离的核心）', () => {
    const issues = inspectMetric(def({
      key: 'settle/payout-rate', namespace: 'settle',
      derivedFrom: ['measure/autonomy-rate'],
    }))
    expect(issues).toContainEqual(expect.objectContaining({ code: 'cross-track-reference', severity: 'error' }))
  })

  it('测量指标派生自结算指标不报错（单向允许）', () => {
    const issues = inspectMetric(def({ derivedFrom: ['settle/payout-rate'] }))
    expect(issues.some((i) => i.code === 'cross-track-reference')).toBe(false)
  })

  it('无消费者报 warn 且带文章判据句', () => {
    const issues = inspectMetric(def({ consumers: [] }))
    const hit = issues.find((i) => i.code === 'empty-consumers')!
    expect(hit.severity).toBe('warn')
    expect(hit.detail).toContain('哪个决策')
  })

  it('口径无分母特征报 warn', () => {
    const issues = inspectMetric(def({ definition: '整体情况良好' }))
    expect(issues.some((i) => i.code === 'missing-denominator')).toBe(true)
  })

  it('结算口径变更未升版本报 error', () => {
    const prev = def({ key: 'settle/x', namespace: 'settle', definition: 'A / B', version: 1 })
    const next = def({ key: 'settle/x', namespace: 'settle', definition: 'A / C', version: 1 })
    expect(inspectMetric(next, prev).some((i) => i.code === 'settle-version-bump')).toBe(true)
  })

  it('结算口径变更且升版本通过', () => {
    const prev = def({ key: 'settle/x', namespace: 'settle', definition: 'A / B', version: 1 })
    const next = def({ key: 'settle/x', namespace: 'settle', definition: 'A / C', version: 2 })
    expect(inspectMetric(next, prev).some((i) => i.code === 'settle-version-bump')).toBe(false)
  })

  it('测量指标改口径不要求升版本（学习口径应当能调）', () => {
    const prev = def({ definition: 'A / B', version: 1 })
    const next = def({ definition: 'A / D', version: 1 })
    expect(inspectMetric(next, prev).some((i) => i.code === 'settle-version-bump')).toBe(false)
  })
})

describe('auditRegistry：批量体检', () => {
  it('统计错误数与装饰数', () => {
    const r = auditRegistry([
      def({ key: 'measure/ok' }),
      def({ key: 'measure/deco', consumers: [] }),
      def({ key: 'bad-key' }),
    ])
    expect(r.errorCount).toBe(1)
    expect(r.decorativeCount).toBe(1)
    expect(r.rows).toHaveLength(3)
  })
})

describe('validateMetricInput：结构校验', () => {
  const ok = {
    key: 'measure/x-rate',
    namespace: 'measure',
    title: 'T',
    definition: 'A / B',
    sources: ['kanban tasks'],
  }

  it('合法输入无问题', () => {
    expect(validateMetricInput(ok)).toEqual([])
  })

  it('拒绝无前缀 key、非法 namespace、缺 title/definition/sources', () => {
    expect(validateMetricInput({ ...ok, key: 'x-rate' }).join()).toContain('key')
    expect(validateMetricInput({ ...ok, namespace: 'other' }).join()).toContain('namespace')
    expect(validateMetricInput({ ...ok, title: '' }).join()).toContain('title')
    expect(validateMetricInput({ ...ok, definition: '' }).join()).toContain('definition')
    expect(validateMetricInput({ ...ok, sources: [] }).join()).toContain('sources')
  })

  it('consumers 条目须带 decisionRef', () => {
    expect(validateMetricInput({ ...ok, consumers: [{ changedAt: 1 }] }).join()).toContain('decisionRef')
  })
})

describe('内置登记簿：口径完整且全部如实标为装饰', () => {
  it('六个内置指标都以 measure/ 开头、带 sources（除接口数占位）', () => {
    expect(BUILTIN_METRICS.length).toBe(6)
    for (const m of BUILTIN_METRICS) {
      expect(m.key.startsWith('measure/')).toBe(true)
      expect(m.namespace).toBe('measure')
      expect(m.builtin).toBe(true)
      if (m.key !== 'measure/interface-count') expect(m.sources.length).toBeGreaterThan(0)
    }
  })

  it('内置指标 consumers 全为空——这是如实登记，不是遗漏', () => {
    expect(BUILTIN_METRICS.every((m) => m.consumers.length === 0)).toBe(true)
    expect(auditRegistry(BUILTIN_METRICS).decorativeCount).toBe(BUILTIN_METRICS.length)
  })

  it('内置指标口径全部通过分母检查', () => {
    const issues = BUILTIN_METRICS.flatMap((m) => inspectMetric(m))
    expect(issues.some((i) => i.code === 'missing-denominator')).toBe(false)
    expect(issues.some((i) => i.code === 'namespace-mismatch')).toBe(false)
  })
})
