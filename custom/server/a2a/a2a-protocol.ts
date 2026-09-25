// overlay/a2a 域：A2A 协议面（routa §七#13 P2 吸收，矩阵 §3.6 P2）。
//
// routa 语义（a2a-outbound-client.ts:1-11,50-56 + A2A v0.3）：跨系统 agent 互调——
// - **Agent Card**：远端 agent 发现卡（name/skills/endpoint）；
// - **SendMessage / GetTask**：发任务+轮询终态（submitted/working/completed/…）；
// - **externalTaskId**：A2A 任务 id 落本地 laneSessions（跨系统任务归属）。
// 本模块=协议契约纯函数（卡片校验/终态判定/externalTaskId 映射）。
export const A2A_TASK_STATES = ['submitted', 'working', 'input-required', 'completed', 'canceled', 'failed'] as const
export type A2ATaskState = (typeof A2A_TASK_STATES)[number]
const TERMINAL: readonly A2ATaskState[] = ['completed', 'canceled', 'failed']

export interface AgentCard {
  name: string
  skills: string[]
  endpoint: string
}

export interface A2ATask {
  externalTaskId: string
  state: A2ATaskState
  /** 本地任务归属（externalTaskId→laneSessions 语义）。 */
  localTaskId?: string
}

/** Agent Card 校验（发现面：名/技能/端点齐全才可调）。 */
export function validateAgentCard(card: AgentCard): string[] {
  const issues: string[] = []
  if (!card.name?.trim()) issues.push('缺 name')
  if (!Array.isArray(card.skills) || card.skills.length === 0) issues.push('skills 须非空数组')
  if (!/^https?:\/\//.test(card.endpoint ?? '')) issues.push('endpoint 须 http(s) URL')
  return issues
}

/** 终态判定（routa 终态集：completed/canceled/failed——轮询停止点）。 */
export function isTerminal(state: A2ATaskState): boolean {
  return TERMINAL.includes(state)
}

/** externalTaskId→本地归属（跨系统落账映射；同 external 幂等）。 */
export function bindExternalTask(tasks: readonly A2ATask[], externalTaskId: string, localTaskId: string): A2ATask[] {
  const existing = tasks.find((t) => t.externalTaskId === externalTaskId)
  if (existing) return tasks.map((t) => (t.externalTaskId === externalTaskId ? { ...t, localTaskId } : t))
  return [...tasks, { externalTaskId, state: 'submitted', localTaskId }]
}
