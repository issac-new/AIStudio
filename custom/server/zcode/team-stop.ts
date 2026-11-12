// overlay[zcode]：团队级停止条件（2026-11-12 ai-agent-handbook 吸收）。
//
// 手册第 11 章：单 Agent 重试上限挡不住多 Agent 互相派生。停止条件要按团队看：
// 委派深度、派生任务数、返工轮次、连续无进展。本模块是纯判定，不读存储；
// 事实由 team-stop-facts 采集或调用方显式注入。缺的事实不猜（不因为缺数据就停/放）。

export type TeamStopCode = 'delegation_depth' | 'derived_tasks' | 'rework_rounds' | 'no_progress'

export interface TeamStopFacts {
  /** 当前委派深度；只有调用方能可靠给出时才注入（本仓台账无 parent 链时不给）。 */
  depth?: number
  maxDepth?: number
  /** 同一团队/根任务下已派生派单数。 */
  dispatched?: number
  maxDispatched?: number
  /** 返工轮次（评估 failed/被退回）。 */
  reworkRounds?: number
  maxReworkRounds?: number
  /** 连续无进展回合（同任务无新产物/同状态重复）。 */
  noProgressTurns?: number
  maxNoProgressTurns?: number
  /** 是否拦截；false=只记录（默认）。 */
  enforce?: boolean
}

export interface TeamStopResult {
  stop: boolean
  code?: TeamStopCode
  reason?: string
}

export const DEFAULT_TEAM_STOP_LIMITS = {
  maxDepth: 3,
  maxDispatched: 12,
  maxReworkRounds: 2,
  maxNoProgressTurns: 3,
} as const

export function evaluateTeamStop(facts: TeamStopFacts): TeamStopResult {
  const maxDepth = facts.maxDepth ?? DEFAULT_TEAM_STOP_LIMITS.maxDepth
  const maxDispatched = facts.maxDispatched ?? DEFAULT_TEAM_STOP_LIMITS.maxDispatched
  const maxRework = facts.maxReworkRounds ?? DEFAULT_TEAM_STOP_LIMITS.maxReworkRounds
  const maxNoProgress = facts.maxNoProgressTurns ?? DEFAULT_TEAM_STOP_LIMITS.maxNoProgressTurns

  if (typeof facts.depth === 'number' && facts.depth >= maxDepth) {
    return { stop: true, code: 'delegation_depth', reason: `委派深度 ${facts.depth} ≥ ${maxDepth}` }
  }
  if (typeof facts.dispatched === 'number' && facts.dispatched >= maxDispatched) {
    return { stop: true, code: 'derived_tasks', reason: `派生派单数 ${facts.dispatched} ≥ ${maxDispatched}` }
  }
  if (typeof facts.reworkRounds === 'number' && facts.reworkRounds >= maxRework) {
    return { stop: true, code: 'rework_rounds', reason: `返工轮次 ${facts.reworkRounds} ≥ ${maxRework}` }
  }
  if (typeof facts.noProgressTurns === 'number' && facts.noProgressTurns >= maxNoProgress) {
    return { stop: true, code: 'no_progress', reason: `连续无进展 ${facts.noProgressTurns} 回合 ≥ ${maxNoProgress}` }
  }
  return { stop: false }
}
