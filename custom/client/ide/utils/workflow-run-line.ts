// overlay：工作流运行行模型（workflow 集成轮重写）。
//
// 语义移植锚点（upstream/zcode packages/ui/src/lib/workflowRunLine.ts）：
// 输入 = sessions-index 下发的 workflowActivity 摘要（服务端 normalizeWorkflowActivity
// 已归一化），输出 =「画哪几行、每行几盏灯」。无时钟、无 DOM：已结束的行何时折叠
// 只看调用方传入的已确认集合（confirmed runId 集），不看时间。
//
// 与旧版（自造事件流投影 run.started/node.done…）不兼容：本版直接消费协议摘要，
// 词汇对齐 zcode 五态（pending/running/completed/errored/stopped）+ 站点四态。
import type {
  ZcodeWorkflowActivity,
  ZcodeWorkflowPhase,
  ZcodeWorkflowRunStatus,
  ZcodeWorkflowRunSummary,
} from '../../zcode/store/zcode-projection'

/** 一个会话最多画的运行行数（zcode WORKFLOW_RUN_LINE_MAX_LINES）；其余折成 +n。 */
export const RUN_LINE_MAX_LINES = 2
/** 迷你轨道最多画的站点数；更多时折到运行站 ±2 并带 +n 尾。 */
export const RAIL_MAX_STATIONS = 6
/** 折叠时保留在运行站两侧的站点数。 */
export const RAIL_FOLD_RADIUS = 2

export interface RunRailStation {
  name: string
  status: ZcodeWorkflowPhase['status']
  /** 控制流到过本站（running/done/failed；pending=未到）。 */
  reached: boolean
  /** 本站与前一站并行（声明表 alongside）：进入段画双线。 */
  twin?: true
}

export interface RunRail {
  stations: RunRailStation[]
  /** 被折叠掉、不画的站点数（+n 尾）；0 不画尾。 */
  hidden: number
  /** 脚本没有阶段词汇表：画一个隐含站点「Workflow」。 */
  implicit: boolean
}

export interface RunLineView {
  runId: string
  /** 展示名：后台工作标题，缺省 'Workflow'。 */
  label: string
  status: ZcodeWorkflowRunStatus
  /** 仍在跑（pending/running）——行高亮、不折叠。 */
  live: boolean
  /** 终态且已被调用方确认（确认集合命中）——渲染端据此折叠行。 */
  settled: boolean
  rail: RunRail
  currentPhase?: string
  agentsWorking: number
  startedAt?: number
}

/** 控制流是否到过这一站。 */
function reached(status: ZcodeWorkflowPhase['status']): boolean {
  return status !== 'pending'
}

/**
 * 迷你轨道折叠（移植 foldWorkflowRunRail）：≤6 站全画；更多时以运行站为中心
 * （无运行站取最后一个到过的站，再没有取首站）保留 ±2，其余合「+n」尾。
 * 固定窗口不滚动（侧栏无横向手势）。并行的双线标志随站走，活过窗口折叠。
 */
export function foldRunRail(phases: readonly ZcodeWorkflowPhase[]): RunRail {
  if (phases.length === 0) return { stations: [], hidden: 0, implicit: true }
  const stationsAll: RunRailStation[] = phases.map((p) => ({
    name: p.name,
    status: p.status,
    reached: reached(p.status),
    ...(p.alongside?.some((i) => i >= 0 && i < phases.length) ? { twin: true as const } : {}),
  }))
  if (stationsAll.length <= RAIL_MAX_STATIONS) return { stations: stationsAll, hidden: 0, implicit: false }
  // 运行站中心：第一个 running；没有则最后一个 reached；再没有取首站。
  let center = stationsAll.findIndex((s) => s.status === 'running')
  if (center < 0) {
    for (let i = stationsAll.length - 1; i >= 0; i--) {
      if (stationsAll[i].reached) { center = i; break }
    }
  }
  if (center < 0) center = 0
  const start = Math.max(0, Math.min(center - RAIL_FOLD_RADIUS, stationsAll.length - (RAIL_FOLD_RADIUS * 2 + 1)))
  const stations = stationsAll.slice(start, start + RAIL_FOLD_RADIUS * 2 + 1)
  return { stations, hidden: stationsAll.length - stations.length, implicit: false }
}

export function isRunLive(status: ZcodeWorkflowRunStatus): boolean {
  return status === 'pending' || status === 'running'
}

/**
 * workflowActivity 摘要 → 运行行视图。
 * 行序：live 在前（启动序），其后未确认的终态行（confirmed 集合命中的终态行
 * 调用方视为已折叠，不进结果）；上限 RUN_LINE_MAX_LINES 行，其余计 hiddenRuns。
 */
export function buildRunLineViews(
  activity: ZcodeWorkflowActivity | undefined,
  opts: { confirmedRunIds?: ReadonlySet<string> } = {},
): { lines: RunLineView[]; hiddenRuns: number } {
  const runs = activity?.runs ?? []
  if (runs.length === 0) return { lines: [], hiddenRuns: 0 }
  const confirmed = opts.confirmedRunIds ?? new Set<string>()
  const live: RunLineView[] = []
  const settledPending: RunLineView[] = []
  for (const run of runs) {
    const view = toRunLineView(run, confirmed)
    if (view.live) live.push(view)
    else if (!view.settled) settledPending.push(view)
  }
  const lines = [...live, ...settledPending].slice(0, RUN_LINE_MAX_LINES)
  const shownIds = new Set(lines.map((l) => l.runId))
  const hiddenRuns = runs.filter((r) => !shownIds.has(r.runId)).length
  return { lines, hiddenRuns }
}

function toRunLineView(run: ZcodeWorkflowRunSummary, confirmed: ReadonlySet<string>): RunLineView {
  return {
    runId: run.runId,
    label: run.name?.trim() || 'Workflow',
    status: run.status,
    live: isRunLive(run.status),
    settled: !isRunLive(run.status) && confirmed.has(run.runId),
    rail: foldRunRail(run.phases),
    currentPhase: run.currentPhase,
    agentsWorking: run.agentsWorking,
    startedAt: run.startedAt,
  }
}
