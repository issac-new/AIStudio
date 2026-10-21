// overlay/custom/server/harness/workbench/evidence.ts
// 探测证据适配器：从 Eval Studio 的真实运行拉取读数。
// 纪律：找不到运行 / 没有聚合 → 返回 null，由服务层 400 拒绝；绝不接受手填指标。
import { getRun, getSet, getSetRevision } from '../../eval/store'
import type { ProbeMetrics, RegressionEvidence } from './types'

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
    k: run.k,
    passAt1: a.passAt1,
    passAtK: a.passAtK,
    resultPassRate: a.byLayer.result,
    trajectoryPassRate: a.byLayer.trajectory,
    unknownRatio: a.unknownRatio,
    riskVeto: a.riskVeto,
    judgeOnline: a.judgeOnline,
    statisticallyInsufficient: a.statisticallyInsufficient,
    tokens: a.byLayer.efficiency.avgTokens,
    costUsd: a.byLayer.efficiency.avgCostUsd,
    steps: a.byLayer.efficiency.avgSteps,
    latencyMs: a.byLayer.efficiency.avgDurationMs,
  }
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
  }
}

/** 把回归证据并入探测指标（覆盖式，重录可纠正更早的错误绑定）。 */
export function attachRegression(metrics: ProbeMetrics, regression: RegressionEvidence): ProbeMetrics {
  return { ...metrics, regression }
}
