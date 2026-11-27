// capabilitypool/metrics.ts —— 三项能力指标读数（批二点五 Task 9）
//
// 只读派生：供给时效与复用率取 kanban 任务 skills 声明；人机团队成功率取结果域
// （OutcomeTeam × Settlement）的已结算结果。源缺席返回 unavailable 并写明原因，不写 0 或 100。
import { readdirSync } from 'node:fs'
import { collectDemands } from './collect'
import {
  CAPABILITY_REUSE_RATE_DEFINITION,
  CAPABILITY_SUPPLY_LEAD_TIME_DEFINITION,
  HUMAN_AI_TEAM_SUCCESS_DEFINITION,
} from './metric-defs'
import type { DerivedReading } from '../metricpolicy/types'
import {
  getTeam,
  listAllContracts,
  listEvents,
  outcomeStoreRoot,
  type OutcomeEvent,
} from '../outcome/outcome-store'
import type { OutcomeTeamMember } from '../outcome/types'

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

/** 人机团队成功率的样本下限：单支团队的 0%/100% 是单点误导，与复用率同一纪律。 */
const TEAM_SUCCESS_MIN_SAMPLE = 2

/** 团队是否同时含人与 Agent 成员——口径的进口条件。 */
function isHumanAiTeam(members: readonly OutcomeTeamMember[]): boolean {
  return members.some((m) => m.subjectKind === 'person') && members.some((m) => m.subjectKind === 'agent')
}

/** 一份合同当前有效的结算结论；没有结算或读不出结论时 null。
 *  合同修订后旧结算被 settlement_superseded 取代，只认没被取代的那条（取最新一条）。 */
function effectiveVerdict(outcomeId: string): 'achieved' | 'partial' | 'missed' | 'unknown' | null {
  const superseded = new Set(
    listEvents(outcomeId, 'settlement_superseded')
      .map((e: OutcomeEvent) => (e.payload as { settlementId?: unknown }).settlementId)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
  )
  let latest: string | null = null
  for (const e of listEvents(outcomeId, 'settlement_signed')) {
    const s = (e.payload as { settlement?: { settlementId?: unknown; verdict?: unknown } }).settlement
    const sid = s?.settlementId
    if (typeof sid !== 'string' || !sid.trim() || superseded.has(sid)) continue
    if (typeof s?.verdict === 'string') latest = s.verdict
  }
  return latest === 'achieved' || latest === 'partial' || latest === 'missed' || latest === 'unknown' ? latest : null
}

/** 人机团队成功率：同时含人与 Agent 成员的结果团队中，结算结论为「达成」的团队数 ÷ 同口径已结算团队数。
 *  只有「达成」算成功（部分达成不算，未知不是证据）；未知结算是一次已签署的结算，进分母。
 *  2026-11-28 之前恒返回「批三未落地」——批三的结果团队与结算当时已落地。 */
export function humanAiTeamSuccess(): DerivedReading {
  const base = {
    key: 'measure/human-ai-team-success' as const,
    title: '人机团队成功率',
    definition: HUMAN_AI_TEAM_SUCCESS_DEFINITION,
    sources: ['outcome/team', 'outcome/settlement'],
  }
  if (process.env.OUTCOME_WORKBENCH !== '1') {
    return {
      ...base, value: null, unit: '%', sample: 0, available: false,
      gap: '结果工作台未启用（OUTCOME_WORKBENCH≠1），结果团队与结算不产生，无样本',
    }
  }
  // 结果域的读取函数把读失败都吞掉了（列不出目录返回空、读不了文件返回 null）——不先探一下，
  // 「存储读不到」会被下面的循环看成「零份合同」，最后报成「没有已结算的团队」：读不到被说成没有。
  let storeReadable: boolean
  try {
    readdirSync(outcomeStoreRoot())
    storeReadable = true
  } catch {
    storeReadable = false
  }
  if (!storeReadable) {
    return {
      ...base, value: null, unit: '%', sample: 0, available: false,
      gap: '结果存储目录读不到，无法计算人机团队成功率',
    }
  }
  let settledTeams: number
  let achievedTeams: number
  try {
    settledTeams = 0
    achievedTeams = 0
    for (const contract of listAllContracts()) {
      const team = getTeam(contract.outcomeId)
      // 团队成员以事件账确认过的版本为准（team.json 是读侧权威，与控制器同一读法）
      const members = team?.members
      if (!members || !isHumanAiTeam(members)) continue
      const verdict = effectiveVerdict(contract.outcomeId)
      if (verdict === null) continue
      settledTeams += 1
      if (verdict === 'achieved') achievedTeams += 1
    }
  } catch (e) {
    return {
      ...base, value: null, unit: '%', sample: 0, available: false,
      gap: `结果存储读不到，无法计算：${e instanceof Error ? e.message : String(e)}`,
    }
  }
  if (settledTeams === 0) {
    return {
      ...base, value: null, unit: '%', sample: 0, available: false,
      gap: '没有已结算的人机团队（团队须同时含人与 Agent 成员且有有效结算）',
    }
  }
  if (settledTeams < TEAM_SUCCESS_MIN_SAMPLE) {
    return {
      ...base, value: null, unit: '%', sample: settledTeams, available: false,
      gap: `已结算的人机团队仅 ${settledTeams} 支，低于样本下限 ${TEAM_SUCCESS_MIN_SAMPLE}——单支 0%/100% 是单点误导`,
    }
  }
  return {
    ...base,
    // 与既有 % 读数约定一致：value 返回 0-1 分数，界面乘 100 显示。
    value: Number((achievedTeams / settledTeams).toFixed(4)),
    unit: '%',
    sample: settledTeams,
    available: true,
  }
}

/** 三项一次取齐（metricpolicy REST 用）。 */
export async function capabilityMetrics(): Promise<DerivedReading[]> {
  const [leadTime, reuse] = await Promise.all([capabilitySupplyLeadTime(), capabilityReuseRate()])
  return [leadTime, reuse, humanAiTeamSuccess()]
}
