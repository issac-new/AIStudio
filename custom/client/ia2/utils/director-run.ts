// overlay/custom/client/ia2/utils/director-run.ts
// 导演 run 识别与改道单一事实源（2026-10-20 W3 两体系贯通批，spec=
// docs/superpowers/specs/2026-10-20-cockpit-residual-fixes.md D4/D5）。
// 导演台以 spec.id=`sim-director-*` 起跑（custom/server/loop/graph/graph-rest.ts），
// runId 形如 `run-sim-director-*`。26 步旧体系（run-state/journal/deliverables/issues/
// branches）读不到这类运行——与其逐端点 404 刷噪音，不如在 API 层即时拒答并指往
// 导演台（导演运行数据走图运行时 API：/api/graph/runs/*）。

export const DIRECTOR_RUN_PREFIX = 'run-sim-director-'

export function isDirectorRun(runId: string): boolean {
  return runId.startsWith(DIRECTOR_RUN_PREFIX)
}

/** 旧体系 API 守卫：导演 run 返回改道错误（调用方即时 reject，零网络探测）；否则 null。 */
export function directorRunGuideError(runId: string): Error | null {
  return isDirectorRun(runId)
    ? new Error('这是导演台发起的运行，不适用按 26 步流程组织的视图；运行详情请到「导演台」查看')
    : null
}

// ── 导演运行详情投影（2026-10-21 战线A：按 run 类型分流的只读面）──────────
// 图运行时 replay 事件是详情页唯一事实源：节点/步骤、人工闸、最近事件都由纯函数
// 从事件流投影，组件不猜状态；原始 payload 只进 <details>/title，主视图说人话。

/** 图运行状态中文标签（与 DirectorPanel 同一词表，抽到 util 供详情页复用） */
const DIRECTOR_STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  'awaiting-input': '等待人工闸',
  completed: '已完成',
  failed: '失败',
  paused: '已暂停',
  idle: '未开始',
  unknown: '未知',
}

export function directorStatusLabel(status: string): string {
  return DIRECTOR_STATUS_LABEL[status] ?? status
}

/** 事件日志 kind → 人话（未知 kind 原样展示，不吞事件） */
const DIRECTOR_EVENT_LABEL: Record<string, string> = {
  'run.started': '运行开始',
  'run.progress': '运行进度',
  'run.completed': '运行完成',
  'run.failed': '运行失败',
  'node.started': '节点开始',
  'node.completed': '节点完成',
  'node.failed': '节点失败',
  'interrupt.raised': '等待人工闸',
  'graph.interrupt': '等待人工闸',
  'interrupt.resumed': '人工闸已处理',
  'graph.resume': '人工闸已处理',
  'checkpoint.saved': '检查点已保存',
  'graph.step-start': '步骤开始',
  'graph.step-complete': '步骤完成',
  'cost.recorded': '成本记账',
  'edge.guard-exceeded': '循环次数触顶',
  'edge.break': '循环提前结束',
  'node.starved': '节点未被调度',
}

export function directorEventLabel(kind: string): string {
  return DIRECTOR_EVENT_LABEL[kind] ?? kind
}

/** 事件时刻（epoch ms 或 ISO）→ HH:mm:ss；不可解析返回空串，不编造时间。 */
export function directorEventTime(ts: string | number | undefined): string {
  const n = typeof ts === 'number' ? ts : Date.parse(String(ts ?? ''))
  if (!Number.isFinite(n)) return ''
  const d = new Date(n)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export interface DirectorGraphLikeEvent {
  kind?: string
  type?: string
  nodeId?: string
  step?: number
  superStep?: number
  ts?: string | number
  [k: string]: unknown
}

export type DirectorNodeState = 'running' | 'done' | 'failed'

export interface DirectorNodeRow {
  nodeId: string
  step: number | null
  state: DirectorNodeState
  ts: string
}

const NODE_EVENT_STATE: Record<string, DirectorNodeState> = {
  'node.started': 'running',
  'node.completed': 'done',
  'node.failed': 'failed',
}

/**
 * 节点行投影：同一 nodeId 以最后一条节点事件为准（重入/重试不重复计数），
 * 按首次出现顺序返回尾部 limit 行。无节点事件的 run 返回空数组。
 */
export function directorNodeRows(events: DirectorGraphLikeEvent[], limit = 200): DirectorNodeRow[] {
  const rows: DirectorNodeRow[] = []
  const index = new Map<string, number>()
  for (const e of events) {
    const kind = String(e.kind ?? e.type ?? '')
    const state = NODE_EVENT_STATE[kind]
    const nodeId = String(e.nodeId ?? '')
    if (!state || !nodeId) continue
    const step = typeof e.superStep === 'number' ? e.superStep : typeof e.step === 'number' ? e.step : null
    const row: DirectorNodeRow = { nodeId, step, state, ts: String(e.ts ?? '') }
    const at = index.get(nodeId)
    if (at === undefined) {
      index.set(nodeId, rows.length)
      rows.push(row)
    } else {
      rows[at] = row
    }
  }
  return rows.slice(-limit)
}

/**
 * 状态收敛：实例 status 在等待/恢复期间可能滞留；以事件流尾部为准——
 * 只有未应答人工闸才显示「等待人工闸」，终态粘滞（completed/failed 不被回摆）。
 */
export function directorRunStatus(
  instanceStatus: string,
  events: DirectorGraphLikeEvent[],
  pendingGateCount = 0,
): string {
  const inst = String(instanceStatus || '')
  if (inst === 'completed' || inst === 'failed') return inst
  if (pendingGateCount > 0) return 'awaiting-input'
  const kindOf = (e: DirectorGraphLikeEvent) => String(e.kind ?? e.type ?? '')
  const last = [...events].reverse().find(e => /^(run\.(completed|failed|started)|node\.(started|completed|failed)|interrupt\.(raised|resumed))$/.test(kindOf(e)))
  if (last) {
    const kind = kindOf(last)
    if (kind === 'run.completed') return 'completed'
    if (kind === 'run.failed') return 'failed'
    if (kind === 'interrupt.raised') return 'awaiting-input'
    if (kind === 'interrupt.resumed') return 'running'
    return 'running'
  }
  if (inst === 'paused') return 'paused'
  return inst || 'unknown'
}
