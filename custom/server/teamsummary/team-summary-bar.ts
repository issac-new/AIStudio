// overlay/teamsummary 域：agent-team 状态汇总条（minimax agent-team 汇总条吸收，矩阵 §3.2 minimax P2）。
//
// minimax 语义（agent team 顶部汇总条——团队状态一眼可读）：
// - **五态计数**：pending/running/done/failed/stale（同 worker-abstraction 五态）；
// - **健康色**：green（零 failed 且无 stale）/ amber（有 stale 无 failed）/ red（有 failed）；
// - **摘要条**：「n agents · x running · y done · z failed」。
// 衔接 manager-hub 驾驶视图聚合：本层=汇总条投影纯函数。
export type WorkerState = 'pending' | 'running' | 'done' | 'failed' | 'stale'

export interface TeamMember {
  memberId: string
  state: WorkerState
}

export interface TeamSummaryBar {
  total: number
  counts: Record<WorkerState, number>
  health: 'green' | 'amber' | 'red'
  /** 摘要条：「n agents · x running · y done · z failed」（零值段省略）。 */
  bar: string
}

/** 团队成员集 → 汇总条投影（minimax 语义）。 */
export function teamSummaryBar(members: readonly TeamMember[]): TeamSummaryBar {
  const counts: Record<WorkerState, number> = {
    pending: 0, running: 0, done: 0, failed: 0, stale: 0,
  }
  for (const m of members) counts[m.state] += 1
  const health: TeamSummaryBar['health'] =
    counts.failed > 0 ? 'red' : counts.stale > 0 ? 'amber' : 'green'
  const parts = [`${members.length} agents`]
  if (counts.running) parts.push(`${counts.running} running`)
  if (counts.done) parts.push(`${counts.done} done`)
  if (counts.failed) parts.push(`${counts.failed} failed`)
  return { total: members.length, counts, health, bar: parts.join(' · ') }
}
