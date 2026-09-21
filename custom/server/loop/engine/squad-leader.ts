// overlay/custom/server/loop/engine/squad-leader.ts
// squad leader 协调协议（R6，multica squad_briefing.go:14-160 语义）：
// @squad 触发时 leader 被注入操作协议——按 roster 选人、mention 委托、
// 每轮必录 action/no_action/failed 评估（会自省的协调者）。
// leader 不干活只协调：委托给名册中的 agent，回收结果给评估，dispatch 完即停。
import type { AgentRosterRow } from '@/custom/ia2/adapters/agents'

export type SquadAction = 'action' | 'no_action' | 'failed'

export interface SquadDelegatePlan {
  agentName: string
  task: string
}

export interface SquadEvaluation {
  action: SquadAction
  /** 评估理由（leader 自省记录：为什么派/为什么不派/为何失败） */
  reasoning: string
  plan?: SquadDelegatePlan
}

export interface SquadLeaderDeps {
  roster: () => AgentRosterRow[]
  delegate: (agentName: string, task: string) => Promise<string | null>
}

// multica 操作协议注入文本（leader 每轮决策必读）
const LEADER_BRIEFING = `你是 squad leader（协调者，不干活）。
协议：① 按名册选最合适的 agent（在跑/在线优先，离线不选）；② 用 @mention 委托任务；
③ 每轮必录评估（action=已委托 / no_action=无可派 / failed=委托失败）并给理由；
④ dispatch 完即停，不继续加工。`

/** leader 选人（roster 决策）：busy（相关）> online > idle；offline 不选 */
export function pickLeader(roster: readonly AgentRosterRow[], taskHint?: string): AgentRosterRow | null {
  const hint = (taskHint ?? '').toLowerCase()
  const score = (a: AgentRosterRow): number => {
    if (a.busyState === 'offline') return -1
    let s = a.busyState === 'busy' ? 100 : a.busyState === 'online' ? 60 : a.busyState === 'idle' ? 20 : 0
    if (hint && a.activeTask && a.activeTask.toLowerCase().includes(hint)) s += 40
    if (hint && a.name.toLowerCase().includes(hint)) s += 25
    return s
  }
  const ranked = roster.filter((a) => score(a) >= 0).sort((x, y) => score(y) - score(x))
  return ranked[0] ?? null
}

/** leader 协调一轮：选人→委托→评估（每轮必录 action/no_action/failed + 理由） */
export async function coordinateSquad(task: string, deps: SquadLeaderDeps): Promise<SquadEvaluation> {
  const roster = deps.roster()
  const picked = pickLeader(roster, task)
  if (!picked) {
    return {
      action: 'no_action',
      reasoning: `名册 ${roster.length} 人全部离线或无可派（${roster.map((a) => `${a.name}:${a.busyState}`).join(', ') || '空名册'}）`,
    }
  }
  try {
    const runId = await deps.delegate(picked.name, `${LEADER_BRIEFING}\n\n任务：${task}`)
    if (!runId) {
      return { action: 'failed', reasoning: `委托 ${picked.name} 失败（enqueue 返回空）`, plan: { agentName: picked.name, task } }
    }
    return {
      action: 'action',
      reasoning: `已委托 ${picked.name}（${picked.busyState}${picked.activeTask ? `，在跑 ${picked.activeTask.slice(0, 20)}` : ''}）执行「${task.slice(0, 40)}」→ ${runId.slice(0, 12)}`,
      plan: { agentName: picked.name, task },
    }
  } catch (err) {
    return {
      action: 'failed',
      reasoning: `委托 ${picked.name} 异常：${err instanceof Error ? err.message : String(err)}`,
      plan: { agentName: picked.name, task },
    }
  }
}
