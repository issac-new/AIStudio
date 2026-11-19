// overlay/modelcap：eval run → 能力观测的确定性投影（2026-11-19 调度智能批）。
//
// 口径：
// - 只认 status=done、target.model 非空、set 存在且 setHash 与当前集一致的 run；
// - 每个 task 取 sampleIdx=1 的 attempt，total=1、passed=0/1 —— 与 eval 的
//   passAt1 同口径，不拿 passAtK 或全局均值凑 cell；
// - 维度到能力类别的映射必须显式（DEFAULT_CATEGORY_MAP 或调用方覆盖）；
//   未标注/未映射/unclassified 一律跳过并计数，不猜；
// - 难度取 task.difficulty（P0-P3），未标注为 null；
// - provider 暂为 null：EvalRunTarget 没有 provider，不伪造。
import type { EvalDimension, EvalRun, EvalSet } from '../eval/types'
import type { CapabilityCategory, CapabilityObservation } from './types'

export const DEFAULT_CATEGORY_MAP: Record<EvalDimension, CapabilityCategory> = {
  task_completion: 'other',
  tool_params: 'ops',
  failure_recovery: 'ops',
  long_task_state: 'planning',
  privilege_injection: 'review',
  cost_loop: 'ops',
  human_escalation: 'review',
}

export interface RejectedObservation {
  runId: string
  taskId?: string
  reason: string
}

export interface EvalObservationOptions {
  runs: readonly EvalRun[]
  setOf: (setId: string) => EvalSet | undefined
  /** 覆盖默认维度映射；未命中的维度仍按默认表。 */
  categoryMap?: Partial<Record<EvalDimension, CapabilityCategory>>
  /** 只看该时间窗内的 run（毫秒）；缺省不限。 */
  maxAgeDays?: number
  now?: number
}

export interface EvalObservationResult {
  observations: CapabilityObservation[]
  rejected: RejectedObservation[]
  /** 参与投影的 run/set 标识（写入 matrix.sources）。 */
  sources: string[]
}

function isDimension(value: unknown): value is EvalDimension {
  return typeof value === 'string' && value in DEFAULT_CATEGORY_MAP
}

export function observationsFromEvalRuns(
  options: EvalObservationOptions,
): EvalObservationResult {
  const now = options.now ?? Date.now()
  const minCreatedAt = options.maxAgeDays && options.maxAgeDays > 0
    ? now - options.maxAgeDays * 24 * 3600_000
    : Number.NEGATIVE_INFINITY
  const categoryMap: Record<string, CapabilityCategory> = {
    ...DEFAULT_CATEGORY_MAP,
    ...(options.categoryMap ?? {}),
  }
  const observations: CapabilityObservation[] = []
  const rejected: RejectedObservation[] = []
  const sources = new Set<string>()

  for (const run of options.runs) {
    if (run.status !== 'done') {
      rejected.push({ runId: run.id, reason: 'run_not_done' })
      continue
    }
    if (run.createdAt < minCreatedAt) {
      rejected.push({ runId: run.id, reason: 'outside_window' })
      continue
    }
    const model = typeof run.target?.model === 'string' ? run.target.model.trim() : ''
    if (!model) {
      rejected.push({ runId: run.id, reason: 'model_missing' })
      continue
    }
    const set = options.setOf(run.setId)
    if (!set) {
      rejected.push({ runId: run.id, reason: 'set_missing' })
      continue
    }
    if (run.setHash && set.contentHash && run.setHash !== set.contentHash) {
      rejected.push({ runId: run.id, reason: 'stale_set_hash' })
      continue
    }
    const taskById = new Map(set.tasks.map((task) => [task.id, task]))
    const attemptsByTask = new Map<string, typeof run.attempts>()
    for (const attempt of run.attempts) {
      const list = attemptsByTask.get(attempt.taskId) ?? []
      list.push(attempt)
      attemptsByTask.set(attempt.taskId, list)
    }
    let contributed = 0
    for (const [taskId, attempts] of attemptsByTask) {
      const task = taskById.get(taskId)
      if (!task) {
        rejected.push({ runId: run.id, taskId, reason: 'task_missing' })
        continue
      }
      const dimension = task.dimension
      if (!isDimension(dimension)) {
        rejected.push({ runId: run.id, taskId, reason: 'dimension_unmapped' })
        continue
      }
      const category = categoryMap[dimension]
      if (!category) {
        rejected.push({ runId: run.id, taskId, reason: 'dimension_unmapped' })
        continue
      }
      const first = attempts.find((attempt) => attempt.sampleIdx === 1)
      if (!first) {
        rejected.push({ runId: run.id, taskId, reason: 'no_pass_sample' })
        continue
      }
      observations.push({
        model,
        provider: null,
        category,
        difficulty: task.difficulty ?? null,
        passed: first.passed === true ? 1 : 0,
        total: 1,
        setHash: run.setHash ?? set.contentHash ?? null,
        at: new Date(run.createdAt).toISOString(),
      })
      contributed += 1
    }
    if (contributed > 0) sources.add(`${run.id}@${set.id}`)
  }

  return { observations, rejected, sources: [...sources].sort() }
}
