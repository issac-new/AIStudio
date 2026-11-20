// capabilitypool/metrics.ts —— 三项能力指标读数（批二点五 Task 9）
//
// 只读派生：供给时效与复用率取 kanban 任务 skills 声明；人机团队成功率依赖批三
// OutcomeTeam/Settlement，未落地前 available:false，不写 0 或 100。
import { collectDemands } from './collect'
import {
  CAPABILITY_REUSE_RATE_DEFINITION,
  CAPABILITY_SUPPLY_LEAD_TIME_DEFINITION,
  HUMAN_AI_TEAM_SUCCESS_DEFINITION,
} from './metric-defs'
import type { DerivedReading } from '../metricpolicy/types'

export {
  CAPABILITY_REUSE_RATE_DEFINITION,
  CAPABILITY_SUPPLY_LEAD_TIME_DEFINITION,
  HUMAN_AI_TEAM_SUCCESS_DEFINITION,
} from './metric-defs'

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median: 空样本（调用方须先做 length 守卫）')
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/** 复用率样本下限：分母标签数 <2 时 0%/100% 都是单点误导，按既有指标纪律报 unavailable。 */
const REUSE_MIN_SAMPLE = 2

/** 能力供给时效：创建 → 首次 run started 的中位时长。分母=同口径任务数。 */
export async function capabilitySupplyLeadTime(): Promise<DerivedReading> {
  const demands = await collectDemands()
  const leadTimes = demands
    .filter((task) => task.firstRunStartedAt !== null && task.firstRunStartedAt >= task.createdAt)
    .map((task) => (task.firstRunStartedAt as number) - task.createdAt)
  if (leadTimes.length === 0) {
    return {
      key: 'measure/capability-supply-lead-time',
      title: '能力供给时效',
      value: null,
      unit: 'ms',
      sample: 0,
      available: false,
      gap: '无带 skills 声明且已起跑的任务',
      definition: CAPABILITY_SUPPLY_LEAD_TIME_DEFINITION,
      sources: ['kanban tasks.skills', 'kanban task_runs.started_at'],
    }
  }
  return {
    key: 'measure/capability-supply-lead-time',
    title: '能力供给时效',
    value: median(leadTimes),
    unit: 'ms',
    sample: leadTimes.length,
    available: true,
    definition: CAPABILITY_SUPPLY_LEAD_TIME_DEFINITION,
    sources: ['kanban tasks.skills', 'kanban task_runs.started_at'],
  }
}

/** 能力复用率：同一标签被多少个看板调用；分子=被 ≥2 板调用的标签数。 */
export async function capabilityReuseRate(): Promise<DerivedReading> {
  const demands = await collectDemands()
  const boardsByTag = new Map<string, Set<string>>()
  for (const task of demands) {
    for (const tag of task.tags) {
      const boards = boardsByTag.get(tag) ?? new Set<string>()
      boards.add(task.board)
      boardsByTag.set(tag, boards)
    }
  }
  const usedTags = boardsByTag.size
  const reusedTags = [...boardsByTag.values()].filter((boards) => boards.size >= 2).length
  if (usedTags === 0) {
    return {
      key: 'measure/capability-reuse-rate',
      title: '能力复用率',
      value: null,
      unit: '%',
      sample: 0,
      available: false,
      gap: '未找到带 skills 声明的任务',
      definition: CAPABILITY_REUSE_RATE_DEFINITION,
      sources: ['kanban tasks.skills', 'kanban boards'],
    }
  }
  if (usedTags < REUSE_MIN_SAMPLE) {
    return {
      key: 'measure/capability-reuse-rate',
      title: '能力复用率',
      value: null,
      unit: '%',
      sample: usedTags,
      available: false,
      gap: `有需求的标签仅 ${usedTags} 个，低于样本下限 ${REUSE_MIN_SAMPLE}——单标签 0%/100% 是单点误导`,
      definition: CAPABILITY_REUSE_RATE_DEFINITION,
      sources: ['kanban tasks.skills', 'kanban boards'],
    }
  }
  return {
    key: 'measure/capability-reuse-rate',
    title: '能力复用率',
    // 与既有 % 读数约定一致：value 返回 0-1 分数，界面乘 100 显示。
    value: Number((reusedTags / usedTags).toFixed(4)),
    unit: '%',
    sample: usedTags,
    available: true,
    definition: CAPABILITY_REUSE_RATE_DEFINITION,
    sources: ['kanban tasks.skills', 'kanban boards'],
  }
}

/** 人机团队成功率：待批三 OutcomeTeam/Settlement；未落地前明确 unknown。 */
export function humanAiTeamSuccess(): DerivedReading {
  return {
    key: 'measure/human-ai-team-success',
    title: '人机团队成功率',
    value: null,
    unit: '%',
    sample: 0,
    available: false,
    gap: '批三 OutcomeTeam/Settlement 未落地，尚无 success 判定',
    definition: HUMAN_AI_TEAM_SUCCESS_DEFINITION,
    sources: ['outcome/team', 'outcome/settlement'],
  }
}

/** 三项一次取齐（metricpolicy REST 用）。 */
export async function capabilityMetrics(): Promise<DerivedReading[]> {
  const [leadTime, reuse] = await Promise.all([capabilitySupplyLeadTime(), capabilityReuseRate()])
  return [leadTime, reuse, humanAiTeamSuccess()]
}
