// overlay[eval] 过程指标（腾讯评测体系轮，2026-10-13）。
//
// 范式来源：《腾讯 Agent 评测体系技术拆解》（specs/assets/wx-articles-2026-10-13/tencent-agent-eval.md）——
//   链路六环节独立门禁（意图/工具/参数/证据/状态/表达，任一环出问题单独报警）；
//   过程双指标 = Tool Head Accuracy（工具选择正确率，抓「碰巧答对」）+
//   Trajectory Match Score（轨迹编辑距离/最优路径长度，抓「绕冤枉路」）；
//   异常场景分桶（模糊意图/缺参数/权限不足/工具超时/知识冲突/用户改口）；
//   六维度量分面（信通院《云上 Agent 基准度量模型》）：未采集维 value=null 立账不造数。
//
// 全部为纯函数（输入 set/run，输出聚合面），不落库不判定——与 aggregate.ts 四层同层。
import type { Attempt, EvalLink, EvalRun, EvalSet, ExceptionType, RunAggregates } from './types'

/** 序列最长公共子序列长度（工具名序列比对，DP O(n·m)；工具序列长度实践 <100）。 */
export function lcsLength(a: string[], b: string[]): number {
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return 0
  let prev = new Array<number>(n + 1).fill(0)
  let cur = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    const swap = prev
    prev = cur
    cur = swap
    cur.fill(0)
  }
  return prev[n]
}

/** 序列编辑距离（Levenshtein，插入/删除/替换同价）。 */
export function levenshtein(a: string[], b: string[]): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let cur = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = cur
    cur = swap
  }
  return prev[n]
}

/**
 * Tool Head Accuracy（单样本）：期望工具序列中被正确按序选中的比例。
 * LCS 而非逐位比对——多一次冗余调用不应把后续全部判错。范围 [0,1]。
 */
export function toolHeadAccuracyOf(expected: string[], actual: string[]): number {
  if (expected.length === 0) return 0
  return Math.min(1, lcsLength(expected, actual) / expected.length)
}

/**
 * Trajectory Match Score（单样本，文章原口径）：编辑距离 / 最优路径长度。
 * 0=零绕路；1=完全跑偏（等长全换）或多绕一倍；可 >1（绕路超最优长度一倍以上）。
 */
export function trajectoryMatchOf(expected: string[], actual: string[]): number {
  if (expected.length === 0) return 1
  return levenshtein(expected, actual) / expected.length
}

/** 六环节键序（报告呈现固定顺序）。 */
export const EVAL_LINKS: EvalLink[] = ['intent', 'tool_choice', 'params', 'evidence', 'state', 'expression']

/** 链路六环节分段：任一断言标注 link 即产出；环节内按 attempt×断言逐条计（与 layerPassRate 同口径）。 */
export function byLinkOf(set: EvalSet, run: EvalRun): RunAggregates['byLink'] {
  const hasLink = set.tasks.some((t) => t.rubric.some((a) => a.link))
  if (!hasLink) return undefined
  const taskById = new Map(set.tasks.map((t) => [t.id, t]))
  const acc = new Map<EvalLink, { total: number; passed: number; unknown: number }>()
  for (const link of EVAL_LINKS) acc.set(link, { total: 0, passed: 0, unknown: 0 })
  for (const attempt of run.attempts) {
    const task = taskById.get(attempt.taskId)
    if (!task) continue
    for (const assertion of task.rubric) {
      if (!assertion.link) continue
      const verdict = attempt.verdicts.find((v) => v.assertionId === assertion.id)
      if (!verdict) continue
      const bucket = acc.get(assertion.link)
      if (!bucket) continue
      bucket.total += 1
      if (verdict.value === assertion.expect) bucket.passed += 1
      if (verdict.value === 'unknown') bucket.unknown += 1
    }
  }
  const out: NonNullable<RunAggregates['byLink']> = {}
  for (const [link, b] of acc) {
    if (b.total === 0) continue
    out[link] = { total: b.total, passed: b.passed, unknown: b.unknown, passRate: b.passed / b.total }
  }
  return out
}

/** 异常场景分桶：按任务 exceptionType 分桶出任务数与桶内 pass@k；全 'none' 时缺省不产噪。 */
export function byExceptionOf(set: EvalSet, run: EvalRun): RunAggregates['byException'] {
  const hasException = set.tasks.some((t) => (t.exceptionType ?? 'none') !== 'none')
  if (!hasException) return undefined
  const buckets = new Map<ExceptionType, { taskCount: number; passed: number }>()
  for (const task of set.tasks) {
    const type = task.exceptionType ?? 'none'
    const bucket = buckets.get(type) ?? { taskCount: 0, passed: 0 }
    bucket.taskCount += 1
    const samples = run.attempts.filter((a) => a.taskId === task.id)
    if (samples.some((a) => a.passed)) bucket.passed += 1
    buckets.set(type, bucket)
  }
  return [...buckets.entries()].map(([type, b]) => ({
    type,
    taskCount: b.taskCount,
    passAtK: b.taskCount === 0 ? null : b.passed / b.taskCount,
  }))
}

/**
 * 过程双指标（run 级）：对「声明了期望工具序列 且 提供了实际工具序列证据」的 attempt 求均值。
 * 任务未声明 expectedToolCalls → 该 attempt 不参与（不是 0 分，是未测——诚实缺席）。
 */
export function processMetricsOf(set: EvalSet, run: EvalRun): RunAggregates['processMetrics'] {
  const taskById = new Map(set.tasks.map((t) => [t.id, t]))
  const accuracies: number[] = []
  const detours: number[] = []
  for (const attempt of run.attempts) {
    const task = taskById.get(attempt.taskId)
    if (!task?.expectedToolCalls?.length) continue
    if (!attempt.toolCalls) continue
    const expected = task.expectedToolCalls
    const actual = attempt.toolCalls.map((c) => c.name)
    accuracies.push(toolHeadAccuracyOf(expected, actual))
    detours.push(trajectoryMatchOf(expected, actual))
  }
  if (accuracies.length === 0) return undefined
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  return {
    toolHeadAccuracy: mean(accuracies),
    trajectoryMatchScore: mean(detours),
    attemptsCompared: accuracies.length,
  }
}

/** 最近邻秩 P99（n<2 无统计意义 → null）。 */
export function p99Of(values: number[]): number | null {
  if (values.length < 2) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.99 * sorted.length) - 1))
  return sorted[idx]
}

/** 六维度量分面（信通院口径）：能从现有四层读出的给读数，未采集的 null 立账——不造数。 */
export interface SixDimensionRow {
  dim: 'functionality' | 'security' | 'reliability' | 'ux' | 'performance' | 'cost'
  /** 读数语义随维度不同（见 basis）；null=该维未接入采集。 */
  value: number | null
  /** 口径说明：读数怎么算的，或为何缺席。 */
  basis: string
  instrumented: boolean
}

export function sixDimensionsOf(run: EvalRun, p99Ratio: number | null): SixDimensionRow[] {
  const agg = run.aggregates
  const risk = agg.byLayer.risk
  const p99RatioValue = p99Ratio ?? null
  return [
    {
      dim: 'functionality',
      value: agg.passAtK,
      basis: 'pass@k（任一样本通过即计）',
      instrumented: agg.passAtK !== null,
    },
    {
      dim: 'security',
      value: risk === 'clean' ? 1 : risk === 'violated' ? 0 : null,
      basis: 'Risk 红线层（clean=1 / violated=0；none/unknown=未测）',
      instrumented: risk === 'clean' || risk === 'violated',
    },
    {
      dim: 'reliability',
      value: null,
      basis: '记忆串扰率/行为可追溯率未采集（回放证据不含该打点）',
      instrumented: false,
    },
    {
      dim: 'ux',
      value: null,
      basis: '满意度/转人工率未采集（回放证据不含该打点）',
      instrumented: false,
    },
    {
      dim: 'performance',
      value: p99RatioValue,
      basis: 'P99/均值耗时比（目标 ≤2，越小越好）',
      instrumented: p99RatioValue !== null,
    },
    {
      dim: 'cost',
      value: agg.byLayer.efficiency.avgCostUsd ?? null,
      basis: '单任务均成本 USD（越小越好；evidence 未取数则缺席）',
      instrumented: agg.byLayer.efficiency.avgCostUsd !== null && agg.byLayer.efficiency.avgCostUsd !== undefined,
    },
  ]
}

/** attempt 工具调用成功率（发布门禁数据源）；无任何工具调用记录 → null。 */
export function toolSuccessRateOf(attempts: Attempt[]): number | null {
  const calls = attempts.flatMap((a) => a.toolCalls ?? [])
  if (calls.length === 0) return null
  return calls.filter((c) => c.ok).length / calls.length
}
