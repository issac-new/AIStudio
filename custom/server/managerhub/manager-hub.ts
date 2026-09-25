// overlay/managerhub 域：指挥中心聚合（antigravity §三差距表 P2 吸收，矩阵 §3.1 antigravity P2）。
//
// antigravity 语义（Manager 指挥中心聚合视图+Inbox 异步通知）：多 agent 作战的
// **驾驶视图**——各 agent 状态聚合（谁在跑/谁闲/谁要人）+ Inbox 异步通知汇总
// （要人处理的事项队列）。衔接 presence-two-axis（在场两维）与 inbox（三档）：
// 本层=聚合投影纯函数。
export interface AgentStatusCard {
  agentId: string
  availability: 'online' | 'unstable' | 'offline'
  workload: 'working' | 'queued' | 'idle'
  /** 要人事项数（inbox action_required 量）。 */
  needsHuman: number
}

export interface HubSummary {
  agents: AgentStatusCard[]
  working: number
  idle: number
  /** 要人总数（Inbox 异步通知汇总——驾驶舱红点语义）。 */
  needsHumanTotal: number
}

/** 多 agent 聚合（驾驶视图：working>idle>needsHuman 降序）。 */
export function managerHub(cards: readonly AgentStatusCard[]): HubSummary {
  const agents = [...cards].sort((a, b) => {
    const score = (c: AgentStatusCard) => (c.workload === 'working' ? 0 : c.workload === 'queued' ? 1 : 2) * 100 - c.needsHuman
    return score(a) - score(b)
  })
  return {
    agents,
    working: cards.filter((c) => c.workload === 'working').length,
    idle: cards.filter((c) => c.workload === 'idle').length,
    needsHumanTotal: cards.reduce((s, c) => s + c.needsHuman, 0),
  }
}
