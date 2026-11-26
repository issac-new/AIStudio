// overlay/custom/server/harness/workbench/evidence.ts
// 探测证据适配器：从 Eval Studio 的真实运行拉取读数。
// 纪律：找不到运行 / 没有聚合 → 返回 null，由服务层 400 拒绝；绝不接受手填指标。
import { getRun, getSet, getSetRevision } from '../../eval/store'
import { attemptPassed } from '../../eval/aggregate'
import { classifyRootCause } from '../../eval/badcase-distill'
import type { Attempt, EvalRun } from '../../eval/types'
import type { CaseFlips, FailureCluster, ProbeMetrics, RegressionEvidence } from './types'

/**
 * 评估条件指纹（2026-11-26 可信 RSI 正文级轮）：取评测运行起跑时冻结的试卷指纹与裁判指纹。
 * 运行没带的项记 null——比较时按无法比较处理，不按相同。
 */
export function evaluatorOfRun(run: Pick<EvalRun, 'setHash' | 'setRevision' | 'judgeFingerprint'>): NonNullable<ProbeMetrics['evaluator']> {
  return {
    setHash: run.setHash ?? null,
    setRevision: run.setRevision ?? null,
    judge: run.judgeFingerprint
      ? {
          models: [...run.judgeFingerprint.models],
          backend: run.judgeFingerprint.backend,
          tauYes: run.judgeFingerprint.tauYes,
          tauNo: run.judgeFingerprint.tauNo,
        }
      : null,
  }
}

export function readEvalEvidence(runId: string): ProbeMetrics | null {
  const id = String(runId ?? '').trim()
  if (!id) return null
  const run = getRun(id)
  if (!run || !run.aggregates) return null
  const a = run.aggregates
  return {
    evalRunId: run.id,
    setId: run.setId,
    setRevision: run.setRevision,
    evidenceMode: run.evidenceMode ?? 'explicit',
    evaluator: evaluatorOfRun(run),
    k: run.k,
    passAt1: a.passAt1,
    passAtK: a.passAtK,
    resultPassRate: a.byLayer.result,
    trajectoryPassRate: a.byLayer.trajectory,
    unknownRatio: a.unknownRatio,
    riskVeto: a.riskVeto,
    // Harmony 吸收轮：安全作为独立目标——风险断言保持率直接进探针证据（无 risk 断言时 null，不猜）
    safetyRate: a.riskRate,
    judgeOnline: a.judgeOnline,
    statisticallyInsufficient: a.statisticallyInsufficient,
    tokens: a.byLayer.efficiency.avgTokens,
    costUsd: a.byLayer.efficiency.avgCostUsd,
    steps: a.byLayer.efficiency.avgSteps,
    latencyMs: a.byLayer.efficiency.avgDurationMs,
    commandChecks: commandChecksOf(run),
  }
}

/** 一份运行里每道题的首样本（样本序号从 1 起）；运行或试卷取不到返回 null。 */
function firstSampleAttemptsOf(runId: string | null | undefined): { run: EvalRun; first: Map<string, Attempt> } | null {
  const id = String(runId ?? '').trim()
  if (!id) return null
  const run = getRun(id)
  if (!run || !getSet(run.setId)) return null
  const first = new Map<string, Attempt>()
  for (const a of run.attempts) {
    if (a.sampleIdx === 1 && !first.has(a.taskId)) first.set(a.taskId, a)
  }
  return { run, first }
}

/**
 * 失败根因分布（2026-11-26 Palantir 架构吸收轮）：首样本未通过的题逐题调用评测域的确定性分类，
 * 按根因计数并留至多三个题号作样例。判定端离线导致无法归类的题记 undecidable。
 * null=运行或试卷取不到（未采集）；空数组=采集过且没有失败题。
 */
export function failureClustersOf(runId: string): FailureCluster[] | null {
  const found = firstSampleAttemptsOf(runId)
  if (!found) return null
  const { run, first } = found
  const set = getSet(run.setId)!
  const buckets = new Map<string, { count: number; sampleTaskIds: string[] }>()
  for (const task of set.tasks) {
    const attempt = first.get(task.id)
    if (!attempt || attemptPassed(task, attempt)) continue
    const classified = classifyRootCause(set, run, task.id, 1)
    const rootCause = 'rootCause' in classified ? classified.rootCause : 'undecidable'
    const bucket = buckets.get(rootCause) ?? { count: 0, sampleTaskIds: [] }
    bucket.count += 1
    if (bucket.sampleTaskIds.length < 3) bucket.sampleTaskIds.push(task.id)
    buckets.set(rootCause, bucket)
  }
  return [...buckets.entries()]
    .map(([rootCause, b]) => ({ rootCause, count: b.count, sampleTaskIds: b.sampleTaskIds }))
    .sort((a, b) => b.count - a.count || (a.rootCause < b.rootCause ? -1 : a.rootCause > b.rootCause ? 1 : 0))
}

/**
 * 逐题对错翻转（2026-11-26 Palantir 架构吸收轮）：与基线运行逐题比首样本的通过与失败。
 * 只比两份运行都有首样本的题；评测运行不保存逐题输出文本，所以不比输出内容。
 * null=基线或候选运行取不到，或没有可比较的题。
 */
export function caseFlipsOf(baselineRunId: string | null | undefined, candidateRunId: string): CaseFlips | null {
  const base = firstSampleAttemptsOf(baselineRunId)
  const cand = firstSampleAttemptsOf(candidateRunId)
  if (!base || !cand) return null
  const basePassed = new Map<string, boolean>()
  for (const [taskId, attempt] of base.first) {
    const task = getSet(base.run.setId)!.tasks.find((t) => t.id === taskId)
    if (task) basePassed.set(taskId, attemptPassed(task, attempt))
  }
  const flips: CaseFlips = { compared: 0, fixed: [], broken: [], bothPassed: 0, bothFailed: 0 }
  for (const [taskId, attempt] of cand.first) {
    const before = basePassed.get(taskId)
    if (before === undefined) continue
    const task = getSet(cand.run.setId)!.tasks.find((t) => t.id === taskId)
    if (!task) continue
    const after = attemptPassed(task, attempt)
    flips.compared += 1
    if (before && after) flips.bothPassed += 1
    else if (!before && !after) flips.bothFailed += 1
    else if (!before && after) flips.fixed.push(taskId)
    else flips.broken.push(taskId)
  }
  return flips.compared > 0 ? flips : null
}

/**
 * 命令式验收器读数（W6，2026-11-05）。
 * 判据是结构性声明而不是 verifier 名字：任务声明了 `outcome.argv` 才算命令验收，
 * attempt 的 outcome 记录真实退出结果。没有声明或没有 attempt → null（不猜）。
 */
function commandChecksOf(run: ReturnType<typeof getRun>): { total: number; passed: number } | null {
  if (!run) return null
  const set = getSet(run.setId)
  if (!set) return null
  const commandTaskIds = new Set(
    set.tasks
      .filter((t) => Array.isArray(t.outcome?.argv) && (t.outcome?.argv?.length ?? 0) > 0)
      .map((t) => t.id),
  )
  if (commandTaskIds.size === 0) return null
  let total = 0
  let passed = 0
  for (const attempt of run.attempts) {
    if (attempt.sampleIdx !== 1) continue
    if (!commandTaskIds.has(attempt.taskId)) continue
    if (!attempt.outcome) continue
    total += 1
    if (attempt.outcome.ok) passed += 1
  }
  return total > 0 ? { total, passed } : null
}

/**
 * 历史回归：给定「回归样本库」的一次运行，统计首样本未通过的任务。
 * 任务在运行中缺席也计失败（回归要求全覆盖，不能用漏跑冒充通过）。
 */
export function readRegressionEvidence(runId: string): RegressionEvidence | null {
  const id = String(runId ?? '').trim()
  if (!id) return null
  const run = getRun(id)
  if (!run) return null
  // origin/mixed 是原事故复现或混合诊断，不能冒充候选的新鲜回归证据。
  if ((run.evidenceMode ?? 'explicit') !== 'explicit') return null
  const current = getSet(run.setId)
  if (!current) return null
  let set = current
  if (run.setRevision !== undefined) {
    const frozen = getSetRevision(run.setId, run.setRevision)
    if (!frozen) return null
    set = { ...current, revision: frozen.revision, contentHash: frozen.contentHash, tasks: frozen.tasks }
  }
  if (run.setHash && set.contentHash !== run.setHash) return null
  const failedTaskIds: string[] = []
  for (const task of set.tasks) {
    const first = run.attempts.find((att) => att.taskId === task.id && att.sampleIdx === 1)
    if (!first || !first.passed) failedTaskIds.push(task.id)
  }
  return {
    runId: run.id,
    suiteName: set.name,
    total: set.tasks.length,
    failed: failedTaskIds.length,
    failedTaskIds: failedTaskIds.slice(0, 50),
    passAt1: run.aggregates?.passAt1 ?? null,
  }
}

/** 把回归证据并入探测指标（覆盖式，重录可纠正更早的错误绑定）。 */
export function attachRegression(metrics: ProbeMetrics, regression: RegressionEvidence): ProbeMetrics {
  return { ...metrics, regression }
}
