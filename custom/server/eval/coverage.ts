// overlay[eval] 能力维度与评测集覆盖度（百度评测范式轮 §6：数据集当资产管）。
//
// 纪律：覆盖度只认显式标注（EvalTask.dimension），不从断言结构猜维度。
// 未标注任务计入 untagged 并在产品面如实显示——假覆盖比低覆盖更危险。
import type { EvalDimension, EvalSet } from './types'

export interface DimensionDef {
  key: EvalDimension
  zh: string
  en: string
}

/** 七维单一事实源（顺序即产品展示顺序）。 */
export const EVAL_DIMENSIONS: DimensionDef[] = [
  { key: 'task_completion', zh: '任务完成', en: 'Task completion' },
  { key: 'tool_params', zh: '工具与参数', en: 'Tools & parameters' },
  { key: 'failure_recovery', zh: '失败恢复', en: 'Failure recovery' },
  { key: 'long_task_state', zh: '长任务状态', en: 'Long-task state' },
  { key: 'privilege_injection', zh: '越权与注入', en: 'Overreach & injection' },
  { key: 'cost_loop', zh: '成本与无效循环', en: 'Cost & loops' },
  { key: 'human_escalation', zh: '人工升级', en: 'Human escalation' },
]

const DIMENSION_KEYS = new Set(EVAL_DIMENSIONS.map((d) => d.key))

export function isEvalDimension(value: unknown): value is EvalDimension {
  return typeof value === 'string' && DIMENSION_KEYS.has(value as EvalDimension)
}

export interface DimensionCoverageRow {
  key: EvalDimension
  zh: string
  en: string
  /** 显式标注该维度的任务数（跨集累计）。 */
  taskCount: number
  /** 覆盖该维度的评测集数。 */
  setCount: number
}

export interface EvalCoverage {
  /** 七维逐行读数（taskCount=0 即未覆盖）。 */
  dimensions: DimensionCoverageRow[]
  /** 已覆盖维度数（0-7）。 */
  covered: number
  total: number
  /** 未标注任务数——覆盖度的诚实缺口。 */
  untaggedTasks: number
  /** 参与统计的任务总数。 */
  taskTotal: number
  /** 参与统计的评测集数。 */
  setTotal: number
}

/** 计算覆盖度（纯函数，供九层体检与产品面共用）。 */
export function coverageOfSets(sets: EvalSet[]): EvalCoverage {
  const perDim = new Map<EvalDimension, { tasks: number; sets: number }>()
  for (const def of EVAL_DIMENSIONS) perDim.set(def.key, { tasks: 0, sets: 0 })
  let untaggedTasks = 0
  let taskTotal = 0
  for (const set of sets) {
    const dimsInSet = new Set<EvalDimension>()
    for (const task of set.tasks) {
      taskTotal += 1
      if (!task.dimension) {
        untaggedTasks += 1
        continue
      }
      const row = perDim.get(task.dimension)
      if (!row) {
        untaggedTasks += 1
        continue
      }
      row.tasks += 1
      dimsInSet.add(task.dimension)
    }
    for (const dim of dimsInSet) {
      const row = perDim.get(dim)
      if (row) row.sets += 1
    }
  }
  const dimensions = EVAL_DIMENSIONS.map((def) => {
    const row = perDim.get(def.key) ?? { tasks: 0, sets: 0 }
    return { ...def, taskCount: row.tasks, setCount: row.sets }
  })
  return {
    dimensions,
    covered: dimensions.filter((d) => d.taskCount > 0).length,
    total: EVAL_DIMENSIONS.length,
    untaggedTasks,
    taskTotal,
    setTotal: sets.length,
  }
}
