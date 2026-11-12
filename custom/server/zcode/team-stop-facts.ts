// overlay[zcode]：团队停止事实采集（2026-11-12 handbook 吸收）。
//
// 只采能可靠推导的事实：派生派单数与返工轮次来自既有台账/评估记录；
// 委派深度与连续无进展没有可靠数据源时留空（不猜，交给调用方显式注入）。
import { readDispatchLedger } from '../governance/dispatch-ledger'
import { listEvaluations, isSquadEvaluationVerdict } from './squad-protocol'
import type { TeamStopFacts } from './team-stop'

export interface TeamStopFactOptions {
  teamId: string
  /** 统计窗口（默认 2 小时）。 */
  windowMs?: number
  now?: number
  /** 调用方显式提供的深度/无进展事实。 */
  depth?: number
  noProgressTurns?: number
}

export function collectTeamStopFacts(opts: TeamStopFactOptions): TeamStopFacts {
  const now = opts.now ?? Date.now()
  const windowMs = opts.windowMs ?? 2 * 60 * 60 * 1000
  const enforce = process.env.TEAM_STOP_ENFORCE === '1'

  let dispatched: number | undefined
  try {
    const entries = readDispatchLedger()
      .filter((e) => now - e.ts <= windowMs && e.target === opts.teamId)
    dispatched = entries.length
  } catch {
    dispatched = undefined
  }

  let reworkRounds: number | undefined
  try {
    const evals = listEvaluations(opts.teamId)
      .filter((e) => now - e.at <= windowMs && isSquadEvaluationVerdict(e.verdict) && e.verdict === 'failed')
    reworkRounds = evals.length
  } catch {
    reworkRounds = undefined
  }

  return {
    ...(typeof opts.depth === 'number' ? { depth: opts.depth } : {}),
    ...(typeof dispatched === 'number' ? { dispatched } : {}),
    ...(typeof reworkRounds === 'number' ? { reworkRounds } : {}),
    ...(typeof opts.noProgressTurns === 'number' ? { noProgressTurns: opts.noProgressTurns } : {}),
    enforce,
  }
}
