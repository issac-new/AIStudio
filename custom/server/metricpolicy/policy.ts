/**
 * 度量纪律判定纯函数（C 组）——无 IO。
 *
 * 三条：双轨隔离、装饰化判据、结算稳定性。
 */
import type { MetricDef, MetricIssue, MetricNamespace } from './types'

/** 从 key 前缀解析命名空间；前缀非法返回 null（写入时即报错）。 */
export function namespaceOfKey(key: string): MetricNamespace | null {
  if (key.startsWith('measure/')) return 'measure'
  if (key.startsWith('settle/')) return 'settle'
  return null
}

export function isDecorative(def: Pick<MetricDef, 'consumers'>): boolean {
  return !Array.isArray(def.consumers) || def.consumers.length === 0
}

/**
 * 单条指标体检。返回问题清单（空=通过）。
 *
 * `prev` 提供时额外做结算口径稳定性检查：`settle/*` 的 definition 变更必须升 version。
 */
export function inspectMetric(def: MetricDef, prev?: MetricDef | null): MetricIssue[] {
  const issues: MetricIssue[] = []

  const ns = namespaceOfKey(def.key)
  if (ns === null) {
    issues.push({
      severity: 'error',
      code: 'namespace-mismatch',
      detail: `key 须以 measure/ 或 settle/ 开头（当前：${def.key}）——没有命名空间的指标无法进双轨`,
    })
  } else if (ns !== def.namespace) {
    issues.push({
      severity: 'error',
      code: 'namespace-mismatch',
      detail: `namespace=${def.namespace} 与 key 前缀（${ns}）不一致`,
    })
  }

  // 双轨隔离：结算指标不得派生自测量指标（反之允许——学习可以引用分配事实）
  if (def.namespace === 'settle' && Array.isArray(def.derivedFrom)) {
    const crossed = def.derivedFrom.filter((k) => k.startsWith('measure/'))
    if (crossed.length) {
      issues.push({
        severity: 'error',
        code: 'cross-track-reference',
        detail: `结算指标不得派生自测量指标（${crossed.join(', ')}）——测量口径一旦进考核就会失真`,
      })
    }
  }

  if (isDecorative(def)) {
    issues.push({
      severity: 'warn',
      code: 'empty-consumers',
      detail: '无消费者决策——「过去一个季度，有哪个决策因为这个数字而改变？」答不出即装饰',
    })
  }

  // 口径须带分母特征：出现 / ÷ 或「每」「率」「比」「占比」「中位」之一
  const hasDenominator = /(\/|÷|每|率|比|占比|中位|均值|分布)/.test(def.definition)
  if (!hasDenominator) {
    issues.push({
      severity: 'warn',
      code: 'missing-denominator',
      detail: '口径未写清分子分母——写不出分母的指标不是指标，是感受',
    })
  }

  if (def.namespace === 'settle' && prev && prev.definition !== def.definition) {
    if (!(def.version > prev.version)) {
      issues.push({
        severity: 'error',
        code: 'settle-version-bump',
        detail: `结算指标口径变更未升版本（${prev.version} → ${def.version}）——分配口径漂移会让历史不可比`,
      })
    }
  }

  return issues
}

/** 批量体检（登记簿页签数据源）。 */
export function auditRegistry(defs: MetricDef[], previous: Map<string, MetricDef> = new Map()): {
  rows: { key: string; decorative: boolean; issues: MetricIssue[] }[]
  errorCount: number
  decorativeCount: number
} {
  const rows = defs.map((d) => {
    const issues = inspectMetric(d, previous.get(d.key) ?? null)
    return { key: d.key, decorative: isDecorative(d), issues }
  })
  return {
    rows,
    errorCount: rows.filter((r) => r.issues.some((i) => i.severity === 'error')).length,
    decorativeCount: rows.filter((r) => r.decorative).length,
  }
}

/** 写入前校验：结构层（不含语义判定，语义判定在 inspectMetric）。 */
export function validateMetricInput(v: {
  key?: unknown
  namespace?: unknown
  title?: unknown
  definition?: unknown
  sources?: unknown
  consumers?: unknown
  derivedFrom?: unknown
}): string[] {
  const problems: string[] = []
  if (typeof v.key !== 'string' || !/^(measure|settle)\/[a-z0-9][a-z0-9._-]{1,80}$/.test(v.key)) {
    problems.push('key 须形如 measure/<name> 或 settle/<name>（小写字母数字点划线下划线）')
  }
  if (v.namespace !== 'measure' && v.namespace !== 'settle') {
    problems.push('namespace 须为 measure|settle')
  }
  if (typeof v.title !== 'string' || !v.title.trim()) problems.push('title 必填')
  if (typeof v.definition !== 'string' || !v.definition.trim()) problems.push('definition 必填（口径一句话，含分子分母）')
  if (!Array.isArray(v.sources) || v.sources.length === 0 || v.sources.some((s) => typeof s !== 'string' || !s.trim())) {
    problems.push('sources 须为非空字符串数组（数据源锚）')
  }
  if (v.consumers !== undefined) {
    if (!Array.isArray(v.consumers)) problems.push('consumers 须为数组')
    else if (v.consumers.some((c) => !c || typeof (c as { decisionRef?: unknown }).decisionRef !== 'string')) {
      problems.push('consumers 每条须含 decisionRef 字符串')
    }
  }
  if (v.derivedFrom !== undefined && (!Array.isArray(v.derivedFrom) || v.derivedFrom.some((k) => typeof k !== 'string'))) {
    problems.push('derivedFrom 须为字符串数组')
  }
  return problems
}
