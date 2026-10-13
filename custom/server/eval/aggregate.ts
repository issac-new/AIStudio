// overlay[eval] Eval Studio · 聚合（四步管线第 4 步）。
//
//   attempt 通过 = 全部断言 value===expect（unknown 计为不过）且（如有）outcome 通过。
//   pass@k = 任一 sample 通过即计该任务（k 次采样统计基线，单跑不作门禁）。
//   Risk 一票否决 = 任一 attempt 任一 risk 断言 value≠expect 且非 unknown → 整 run FAIL。
//   unknownRatio > 阈值 → rubricDrilldownHint（Rubric 定义不充分的诊断信号）。
//   腾讯评测体系轮增面：byLink 六环节分段 / byException 异常分桶 / processMetrics
//   过程双指标 / releaseGate 发布门禁 / sixDimensions 六维分面（均无数据时缺省）。
import type { Attempt, EvalConfig, EvalRun, EvalSet, EvalTask, RunAggregates } from './types'
import { calibrationReport } from './calibration'
import { byExceptionOf, byLinkOf, processMetricsOf, sixDimensionsOf } from './metrics'
import { evaluateReleaseGate, loadReleaseGateConfig } from './releaseGate'

/** attempt 是否通过（断言全对 + outcome 通过）。 */
export function attemptPassed(task: EvalTask, attempt: Attempt): boolean {
  const byId = new Map(attempt.verdicts.map((v) => [v.assertionId, v]))
  if (task.rubric.length === 0) return false
  for (const assertion of task.rubric) {
    const verdict = byId.get(assertion.id)
    if (!verdict || verdict.value !== assertion.expect) return false
  }
  if (task.outcome && attempt.outcome && !attempt.outcome.ok) return false
  if (task.outcome && !attempt.outcome) return false
  return true
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** layer 通过率：按 attempt×task×该 layer 断言逐条计（taskId+assertionId 定位，避免跨任务同名断言碰撞）。 */
function layerPassRate(set: EvalSet, run: EvalRun, layer: 'result' | 'trajectory'): number | null {
  const taskById = new Map(set.tasks.map((t) => [t.id, t]))
  let passed = 0
  let total = 0
  for (const attempt of run.attempts) {
    const task = taskById.get(attempt.taskId)
    if (!task) continue
    for (const assertion of task.rubric) {
      if (assertion.kind !== layer) continue
      const verdict = attempt.verdicts.find((v) => v.assertionId === assertion.id)
      if (!verdict) continue
      total += 1
      if (verdict.value === assertion.expect) passed += 1
    }
  }
  return total === 0 ? null : passed / total
}

/** 聚合并写回 run.attempts[].passed 与 run.aggregates。返回更新后的 run。 */
export function aggregateRun(set: EvalSet, run: EvalRun, config: EvalConfig): EvalRun {
  const taskById = new Map(set.tasks.map((t) => [t.id, t]))
  run.attempts = run.attempts.map((attempt) => {
    const task = taskById.get(attempt.taskId)
    return { ...attempt, passed: task ? attemptPassed(task, attempt) : false }
  })

  const taskIds = set.tasks.map((t) => t.id)
  const taskCount = taskIds.length
  let passAt1Denom = 0
  let passAt1 = 0
  let passAtK = 0
  for (const taskId of taskIds) {
    const samples = run.attempts.filter((a) => a.taskId === taskId)
    const first = samples.find((a) => a.sampleIdx === 1)
    if (first) {
      passAt1Denom += 1
      if (first.passed) passAt1 += 1
    }
    if (samples.some((a) => a.passed)) passAtK += 1
  }

  // Risk 层：一票否决
  let riskState: RunAggregates['byLayer']['risk'] = 'none'
  const hasRisk = set.tasks.some((t) => t.rubric.some((a) => a.kind === 'risk'))
  if (hasRisk) {
    riskState = 'clean'
    let anyRiskDecided = false
    outer: for (const task of set.tasks) {
      for (const assertion of task.rubric) {
        if (assertion.kind !== 'risk') continue
        for (const attempt of run.attempts.filter((a) => a.taskId === task.id)) {
          const verdict = attempt.verdicts.find((v) => v.assertionId === assertion.id)
          if (!verdict || verdict.value === 'unknown') continue
          anyRiskDecided = true
          if (verdict.value !== assertion.expect) {
            riskState = 'violated'
            break outer
          }
        }
      }
    }
    // 有 risk 断言但无任何已判结论（判定端离线全 unknown）→ 不可断言 clean
    if (riskState === 'clean' && !anyRiskDecided) riskState = 'unknown'
  }

  // unknown 占比
  const allVerdicts = run.attempts.flatMap((a) => a.verdicts)
  const unknownCount = allVerdicts.filter((v) => v.value === 'unknown').length
  const unknownRatio = allVerdicts.length === 0 ? 0 : unknownCount / allVerdicts.length

  const effValues = run.attempts.map((a) => a.efficiency).filter((e): e is NonNullable<Attempt['efficiency']> => e !== undefined)
  // 任一 attempt 报判定端离线即整 run 标离线（报告与门禁据此映射 INCONCLUSIVE）
  const judgeOnline = run.attempts.every((a) => a.judgeMeta?.online !== false)

  const riskVeto = riskState === 'violated'

  run.aggregates = {
    taskCount,
    passAt1: passAt1Denom === 0 ? null : passAt1 / passAt1Denom,
    passAtK: taskCount === 0 ? null : passAtK / taskCount,
    byLayer: {
      result: layerPassRate(set, run, 'result'),
      trajectory: layerPassRate(set, run, 'trajectory'),
      risk: riskState,
      efficiency: {
        avgTokens: avg(effValues.map((e) => e.tokens).filter((v): v is number => v !== undefined)),
        avgCostUsd: avg(effValues.map((e) => e.costUsd).filter((v): v is number => v !== undefined)),
        avgSteps: avg(effValues.map((e) => e.steps).filter((v): v is number => v !== undefined)),
        avgDurationMs: avg(effValues.map((e) => e.durationMs).filter((v): v is number => v !== undefined)),
      },
    },
    unknownRatio,
    rubricDrilldownHint: unknownRatio > config.unknownWarnRatio,
    riskVeto,
    statisticallyInsufficient: run.k < 2,
    judgeOnline,
    // 校准度（六文调研轮 G）：判词有 p 留痕即生成；全无 p 时 samples=0 如实缺席（不造数）
    calibration: calibrationReport(set, run.attempts),
    // 腾讯评测体系轮：六环节分段 / 异常分桶 / 过程双指标（各自在无标注/无数据时缺省）
    byLink: byLinkOf(set, run),
    byException: byExceptionOf(set, run),
    processMetrics: processMetricsOf(set, run),
  }

  // 发布门禁（六维分面的 performance 读数复用其 P99/均值比，先算门禁再建分面）
  const gate = evaluateReleaseGate(run.attempts, loadReleaseGateConfig())
  run.aggregates.releaseGate = gate
  run.aggregates.sixDimensions = sixDimensionsOf(run, gate.numeric.p99Ratio)

  // Risk 一票否决：整 run FAIL（status 保留原值，passed 语义在 aggregates.riskVeto）
  return run
}

// ---------- A/B 对比（腾讯启示⑩：模型/Prompt/版本切换必须内建对比） ----------

export interface RunCompareRow {
  taskId: string
  base: 'pass' | 'fail' | null
  head: 'pass' | 'fail' | null
  flip: 'improved' | 'regressed' | 'same' | 'missing_base' | 'missing_head'
}

export interface RunCompare {
  setId: string
  base: { runId: string; target: EvalRun['target']; createdAt: number }
  head: { runId: string; target: EvalRun['target']; createdAt: number }
  perTask: RunCompareRow[]
  /** head − base（null=任一侧缺读数，不造数）。 */
  deltas: {
    passAt1: number | null
    passAtK: number | null
    unknownRatio: number | null
    avgTokens: number | null
    avgDurationMs: number | null
    toolHeadAccuracy: number | null
    trajectoryMatchScore: number | null
  }
}

function taskStateOf(run: EvalRun, taskId: string): 'pass' | 'fail' | null {
  const samples = run.attempts.filter((a) => a.taskId === taskId)
  if (samples.length === 0) return null
  return samples.some((a) => a.passed) ? 'pass' : 'fail'
}

function delta(head: number | null | undefined, base: number | null | undefined): number | null {
  if (head === null || head === undefined || base === null || base === undefined) return null
  return head - base
}

/** 同集两 run 对比（基准 base vs 对照 head）：逐任务翻转表 + 关键读数 delta。 */
export function compareRuns(set: EvalSet, base: EvalRun, head: EvalRun): RunCompare {
  const perTask: RunCompareRow[] = set.tasks.map((t) => {
    const b = taskStateOf(base, t.id)
    const h = taskStateOf(head, t.id)
    const flip: RunCompareRow['flip'] =
      b === null && h === null ? 'same'
        : b === null ? 'missing_base'
          : h === null ? 'missing_head'
            : b === h ? 'same'
              : b === 'fail' && h === 'pass' ? 'improved'
                : 'regressed'
    return { taskId: t.id, base: b, head: h, flip }
  })
  const bAgg = base.aggregates
  const hAgg = head.aggregates
  return {
    setId: set.id,
    base: { runId: base.id, target: base.target, createdAt: base.createdAt },
    head: { runId: head.id, target: head.target, createdAt: head.createdAt },
    perTask,
    deltas: {
      passAt1: delta(hAgg.passAt1, bAgg.passAt1),
      passAtK: delta(hAgg.passAtK, bAgg.passAtK),
      unknownRatio: delta(hAgg.unknownRatio, bAgg.unknownRatio),
      avgTokens: delta(hAgg.byLayer.efficiency.avgTokens, bAgg.byLayer.efficiency.avgTokens),
      avgDurationMs: delta(hAgg.byLayer.efficiency.avgDurationMs, bAgg.byLayer.efficiency.avgDurationMs),
      toolHeadAccuracy: delta(hAgg.processMetrics?.toolHeadAccuracy, bAgg.processMetrics?.toolHeadAccuracy),
      trajectoryMatchScore: delta(hAgg.processMetrics?.trajectoryMatchScore, bAgg.processMetrics?.trajectoryMatchScore),
    },
  }
}
