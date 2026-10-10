/**
 * 按任务的研发进度聚合（纯函数，容量分析 capacity-analytics 同款只读风格）。
 *
 * 输入：①派发台账（含 taskId 的条目——任务卡与引擎 run 的关联键）；
 *      ②会话进度存储（投影事件流维护的 sessionId → ProjectionSession）。
 * 输出：每个任务卡的进度快照——阶段时间线（引擎 workflow 站点）、当前阶段、
 *      会话六态、最近活跃，以及全局摘要（活跃数/会话面待恢复数）。
 *
 * 口径如实：会话面缺席（服务重启后事件未回流）时 sessionKnown=false 呈现
 * 「已派发·会话面暂缺」，不编造阶段；台账是文件真值，重启不丢。
 */
import type { DispatchLedgerEntry } from '../governance/dispatch-ledger'
import type { ProjectionSession } from '../zcode/session-projection'
import type { MilestoneEntry } from './task-progress-store'

export interface TaskPhaseTimelineItem {
  name: string
  status: 'pending' | 'running' | 'done' | 'failed'
}

export interface TaskProgress {
  taskId: string
  /** 派发目标（agent/squad 名）。 */
  target: string
  workspaceId?: string
  sessionId?: string
  /** 派发次数（含打回重试），成功派发（queued/coalesced）单列。 */
  dispatchCount: number
  dispatchOkCount: number
  lastDispatchAt: number
  /** 引擎会话六态（draft/prewarming/running/completedSuccess/completedInterrupted/error）。 */
  sessionPhase?: string
  /** 引擎目标状态六态（active/paused/verifying/verified/notSatisfied/failed）。 */
  goalStatus?: string
  /** 引擎 workflow 站点时间线（来自 workflowActivity 最近一条 run）。 */
  phases: TaskPhaseTimelineItem[]
  currentPhase?: string
  /** 进行中的 workflow run 数。 */
  activeRuns: number
  lastActivityAt?: number
  sessionEnded?: boolean
  /** 台账有 taskId 但会话存储查不到（重启冷窗/未 watch）——如实标注不编造。 */
  sessionKnown: boolean
  /** 会话在跑（running/prewarming/有后台工作且未结束）。 */
  active: boolean
  /** 技能侧里程碑（--milestone --task 归本卡的条目；无引擎站点面时的进度回退源）。 */
  milestones: Array<{ ts: string; milestone: string; status?: string; note?: string }>
}

export interface TaskProgressSummary {
  tasks: TaskProgress[]
  total: number
  activeCount: number
  /** 会话面恢复中（sessionKnown=false 的任务数）。 */
  sessionPendingCount: number
}

const OK_REASONS = new Set(['queued', 'coalesced'])

/** 聚合入口：ledger 条目 + 会话存储 → 按任务分组的时间线与摘要。 */
export function taskProgressOverview(
  ledger: DispatchLedgerEntry[],
  sessions: Map<string, ProjectionSession>,
  opts: { activeOnly?: boolean; limit?: number; milestonesByWorkspace?: Map<string, MilestoneEntry[]> } = {},
): TaskProgressSummary {
  const byTask = new Map<string, DispatchLedgerEntry[]>()
  for (const e of ledger) {
    if (!e.taskId) continue
    const list = byTask.get(e.taskId)
    if (list) list.push(e)
    else byTask.set(e.taskId, [e])
  }
  const tasks: TaskProgress[] = []
  for (const [taskId, entries] of byTask) {
    entries.sort((a, b) => a.ts - b.ts)
    const last = entries[entries.length - 1]
    // 会话关联键：最近一条带 sessionId 的成功派发（重试/并入都指向同一任务）。
    const withSession = [...entries].reverse().find((e) => e.sessionId && OK_REASONS.has(e.reason))
    const session = withSession?.sessionId ? sessions.get(withSession.sessionId) : undefined
    const runs = session?.workflowActivity?.runs ?? []
    // 站点时间线：取最近一条 run（任务卡粒度一次派一个 run；多 run 时最新者为准）。
    const run = runs[runs.length - 1]
    const phases: TaskPhaseTimelineItem[] = (run?.phases ?? []).map((p) => ({ name: p.name, status: p.status }))
    // 技能侧里程碑联合（消费侧接线补全）：--task 归本卡的条目进任务时间线；引擎站点面
    // 缺席时以最近一条里程碑作为 currentPhase 回退（手工/非引擎任务也有进度可读）。
    const wsMilestones = (withSession?.workspaceId ?? last.workspaceId)
      ? (opts.milestonesByWorkspace?.get((withSession?.workspaceId ?? last.workspaceId) as string) ?? []).filter((m) => m.task === taskId)
      : []
    tasks.push({
      taskId,
      target: last.target,
      workspaceId: last.workspaceId ?? undefined,
      sessionId: withSession?.sessionId,
      dispatchCount: entries.length,
      dispatchOkCount: entries.filter((e) => OK_REASONS.has(e.reason)).length,
      lastDispatchAt: last.ts,
      sessionPhase: session?.phase,
      goalStatus: session?.goalStatus,
      phases,
      currentPhase: run?.currentPhase ?? phases.find((p) => p.status === 'running')?.name ?? wsMilestones[wsMilestones.length - 1]?.milestone,
      activeRuns: runs.filter((r) => r.status === 'running' || r.status === 'pending').length,
      lastActivityAt: session?.lastActivityAt,
      sessionEnded: session?.sessionEnded,
      sessionKnown: Boolean(session),
      active: session ? isSessionActive(session) : false,
      milestones: wsMilestones.map((m) => ({ ts: m.ts, milestone: m.milestone, status: m.status, note: m.note })),
    })
  }
  // 活跃优先，其次最近派发。
  tasks.sort((a, b) => (Number(b.active) - Number(a.active)) || (b.lastDispatchAt - a.lastDispatchAt))
  const filtered = opts.activeOnly ? tasks.filter((t) => t.active) : tasks
  const limited = opts.limit ? filtered.slice(0, opts.limit) : filtered
  return {
    tasks: limited,
    total: filtered.length,
    activeCount: filtered.filter((t) => t.active).length,
    sessionPendingCount: filtered.filter((t) => !t.sessionKnown).length,
  }
}

function isSessionActive(session: ProjectionSession): boolean {
  if (session.sessionEnded) return false
  return session.phase === 'running' || session.phase === 'prewarming' || Boolean(session.hasBackgroundWork)
}
