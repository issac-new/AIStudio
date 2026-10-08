// overlay[eval] Eval Studio · 聚合（四步管线第 4 步）。
//
//   attempt 通过 = 全部断言 value===expect（unknown 计为不过）且（如有）outcome 通过。
//   pass@k = 任一 sample 通过即计该任务（k 次采样统计基线，单跑不作门禁）。
//   Risk 一票否决 = 任一 attempt 任一 risk 断言 value≠expect 且非 unknown → 整 run FAIL。
//   unknownRatio > 阈值 → rubricDrilldownHint（Rubric 定义不充分的诊断信号）。
import type { Attempt, EvalConfig, EvalRun, EvalSet, EvalTask, RunAggregates } from './types'
import { calibrationReport } from './calibration'

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
  }

  // Risk 一票否决：整 run FAIL（status 保留原值，passed 语义在 aggregates.riskVeto）
  return run
}
