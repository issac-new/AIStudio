// overlay/custom/client/ia2/adapters/agents.ts
// R7-C agent 名册统一面（multica roster / routa lane agents 语义）：
// 分布式 agent 组织的「在线/忙闲/在跑」同屏投影——agent 身份 = matrix 账号下
// 的子身份（matrix_user_id 之下，agent 是执行面）。
// 数据源三源合并（零新表）：
//   ① 在线态：ia2-platforms /agent-health/detailed 的 loaded_platforms（state）
//   ② 在跑：kanban task assignee（谁在跑什么任务）
//   ③ 活跃会话：chatStore.sessions（agent 当前挂靠会话）
// 名册投影不替代 ide 子代理名册（ide 管「会话内子代理」，本投影管「组织级 agent」）。
import type { PlatformInfo } from '../store/platforms'

export type AgentBusyState = 'online' | 'busy' | 'idle' | 'offline'

export interface AgentRosterRow {
  /** agent 名（platform key 或 assignee 名归一） */
  name: string
  /** 在线/忙闲/离线（state 归一：online=在线可跑/busy=在跑/idle=在线无活/offline=离线） */
  busyState: AgentBusyState
  /** 在跑任务标题（assignee 命中 running 任务；空=无活） */
  activeTask?: string
  /** 挂靠会话数（assignee 命中会话数） */
  sessionCount: number
  /** 来源（platform 探针 / assignee 归并） */
  source: 'platform' | 'assignee'
}

export interface AgentRosterTask {
  id: string
  title: string
  assignee: string | null
  status: string
}

export interface AgentRosterSession {
  id: string
  agent?: string | null
}

function normalizeName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase()
}

/**
 * 名册投影：
 * - platform 探针有的 agent → 以探针在线态为准（running/loaded=online，其余 offline）
 * - assignee 有 running 任务 → busy（叠加 platform/assignee 两边）
 * - 仅 assignee 无 running 任务 → idle（有历史但当前无活）
 * - 既无探针又无 assignee → 不入册
 */
export function buildAgentRoster(
  platforms: readonly PlatformInfo[],
  tasks: readonly AgentRosterTask[],
  sessions: readonly AgentRosterSession[],
): AgentRosterRow[] {
  const byName = new Map<string, AgentRosterRow>()

  const runningTaskByAgent = new Map<string, string>()
  for (const t of tasks) {
    const agent = normalizeName(t.assignee)
    if (!agent || t.status !== 'running') continue
    if (!runningTaskByAgent.has(agent)) runningTaskByAgent.set(agent, t.title)
  }
  const sessionCountByAgent = new Map<string, number>()
  for (const s of sessions) {
    const agent = normalizeName(s.agent)
    if (!agent) continue
    sessionCountByAgent.set(agent, (sessionCountByAgent.get(agent) ?? 0) + 1)
  }

  // platform 探针源
  for (const p of platforms) {
    const name = normalizeName(p.name)
    if (!name) continue
    const running = runningTaskByAgent.get(name)
    const online = p.state === 'running' || p.state === 'loaded' || p.state === 'online'
    byName.set(name, {
      name: p.name,
      busyState: running ? 'busy' : online ? (runningTaskByAgent.has(name) ? 'busy' : 'online') : 'offline',
      activeTask: running,
      sessionCount: sessionCountByAgent.get(name) ?? 0,
      source: 'platform',
    })
  }

  // assignee 归并源（补充 platform 未覆盖的 agent）
  for (const agent of new Set([...runningTaskByAgent.keys(), ...sessionCountByAgent.keys()])) {
    if (byName.has(agent)) continue
    const running = runningTaskByAgent.get(agent)
    byName.set(agent, {
      name: agent,
      busyState: running ? 'busy' : 'idle',
      activeTask: running,
      sessionCount: sessionCountByAgent.get(agent) ?? 0,
      source: 'assignee',
    })
  }

  return [...byName.values()].sort((a, b) => {
    const rank = (s: AgentBusyState): number => (s === 'busy' ? 0 : s === 'online' ? 1 : s === 'idle' ? 2 : 3)
    return rank(a.busyState) - rank(b.busyState) || a.name.localeCompare(b.name)
  })
}
