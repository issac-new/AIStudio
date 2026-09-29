// overlay/custom/client/kanban/utils/accounts.ts
// 管理三账纯函数（调研落地轮 2026-09-29，《研发项目管理看板怎么搭》产品化）：
//   进度偏差账 —— 绿灯率 + 最劣偏差天数（黄/红单清单）
//   风险分布账 —— 偏差天数 Pareto 集中度（头部任务占全部偏差天数的比例）
//   资源结构账 —— 按受理人聚合未结负载、过载/闲置/结构性错配判定
//
// 口径诚实声明：看板任务无交付期限（due date）字段，偏差天数按**停滞时长**推算，
// 阈值与 KanbanTaskCard 停滞分级同源（ready/blocked 1h 琥珀·24h 红、running
// 10m·1h、todo 7d·30d）——本模块是这三组阈值的单一事实源，卡片组件的口径注释
// 指向这里；"关键路径偏差天数"取最劣任务偏差天数（无依赖图算法，界面标注推算口径）。
// 设计文档：docs/2026-09-29-change-gov-three-accounts-research.md §4.2。

/** 停滞阈值（秒；amber=琥珀阈值，red=红阈值）——与看板卡停滞环同源 */
export const STALE_THRESHOLDS: Readonly<Record<string, { amber: number; red: number }>> = {
  ready: { amber: 3600, red: 86400 },
  running: { amber: 600, red: 3600 },
  blocked: { amber: 3600, red: 86400 },
  todo: { amber: 604800, red: 2592000 },
}

export type HealthTier = 'green' | 'amber' | 'red'

export interface TaskHealth {
  tier: HealthTier
  /** 超出琥珀阈值的天数（向下取整；green 为 0）——偏差账/风险账的计量单位 */
  delayDays: number
}

/** 单任务健康度。running 用 started_at 年龄，其余用 created_at 年龄（与卡片逻辑一致）。 */
export function taskHealth(task: { status: string; created_at: number; started_at?: number | null }, nowSec: number): TaskHealth {
  const th = STALE_THRESHOLDS[task.status]
  if (!th) return { tier: 'green', delayDays: 0 } // triage/scheduled/review/done/archived 无停滞口径
  const base = task.status === 'running'
    ? (task.started_at ? nowSec - task.started_at : null)
    : nowSec - task.created_at
  if (base === null) return { tier: 'green', delayDays: 0 }
  if (base > th.red) return { tier: 'red', delayDays: Math.floor((base - th.amber) / 86400) }
  if (base > th.amber) return { tier: 'amber', delayDays: 0 }
  return { tier: 'green', delayDays: 0 }
}

/** 三账输入：跨板原始任务（workspace.rawTasks 的元素形态） */
export interface AccountsTask {
  id: string
  title: string
  status: string
  assignee?: string | null
  board: string
  created_at: number
  started_at?: number | null
}

export interface ProgressAccount {
  total: number
  green: number
  amber: number
  red: number
  /** 绿灯率 = green / total（0-1；无任务为 null——不做除零假数据） */
  greenRate: number | null
  /** 最劣偏差天数（全部 green 时为 0）——"关键路径偏差"的停滞推算口径 */
  worstDelayDays: number
}

export interface RiskItem {
  id: string
  title: string
  board: string
  status: string
  tier: HealthTier
  delayDays: number
}

export interface RiskAccount {
  /** 全部任务偏差天数合计（风险暴露总量） */
  totalDelayDays: number
  /** 头部 20% 任务占偏差天数比例（文章"少量高风险贡献近六成延期"的集中度口径；0-1 或 null） */
  paretoTopShare: number | null
  /** 高风险清单（偏差天数降序，红优先） */
  items: RiskItem[]
}

export interface AssigneeLoad {
  assignee: string
  open: number
  running: number
  blocked: number
  todoIsh: number
  done: number
  overloaded: boolean
}

export interface ResourceAccount {
  loads: AssigneeLoad[]
  /** 过载阈值 = max(3, 2×人均未结) */
  overloadThreshold: number
  /** 历史出现但当前零未结（"通用产能闲置"的诚实代理口径） */
  idle: string[]
  /** 最大未结负载 / 人均未结负载 ≥ 2 → 结构性错配 */
  structuralMismatch: boolean
}

export interface ThreeAccounts {
  progress: ProgressAccount
  risk: RiskAccount
  resource: ResourceAccount
}

const OPEN_STATUSES = new Set(['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review'])
const isDone = (s: string) => s === 'done' || s === 'archived'

/** 空受理人的聚合桶名（展示与判定共用；不随 locale 变——仓库先例容忍 zh 字面量） */
export const UNASSIGNED_BUCKET = '未指派'

export function computeAccounts(tasks: AccountsTask[], nowSec: number): ThreeAccounts {
  // ── 进度偏差账 ──
  let green = 0, amber = 0, red = 0
  const risks: RiskItem[] = []
  for (const t of tasks) {
    const h = taskHealth(t, nowSec)
    if (isDone(t.status) || h.tier === 'green') green++
    else if (h.tier === 'amber') amber++
    else red++
    if (h.tier !== 'green' && !isDone(t.status)) {
      risks.push({ id: t.id, title: t.title, board: t.board, status: t.status, tier: h.tier, delayDays: h.delayDays })
    }
  }
  const total = tasks.length
  const progress: ProgressAccount = {
    total,
    green, amber, red,
    greenRate: total ? green / total : null,
    worstDelayDays: risks.reduce((m, r) => Math.max(m, r.delayDays), 0),
  }

  // ── 风险分布账 ──
  risks.sort((a, b) => b.delayDays - a.delayDays || (a.tier === 'red' ? -1 : 1))
  const totalDelayDays = risks.reduce((s, r) => s + r.delayDays, 0)
  const paretoCount = Math.max(1, Math.ceil(risks.length * 0.2))
  const topDelay = risks.slice(0, paretoCount).reduce((s, r) => s + r.delayDays, 0)
  const risk: RiskAccount = {
    totalDelayDays,
    paretoTopShare: totalDelayDays > 0 ? topDelay / totalDelayDays : null,
    items: risks.slice(0, 20),
  }

  // ── 资源结构账 ──
  const byAssignee = new Map<string, AssigneeLoad>()
  const nameOf = (a?: string | null) => (a && a.trim() ? a.trim() : UNASSIGNED_BUCKET)
  for (const t of tasks) {
    const key = nameOf(t.assignee)
    let row = byAssignee.get(key)
    if (!row) {
      row = { assignee: key, open: 0, running: 0, blocked: 0, todoIsh: 0, done: 0, overloaded: false }
      byAssignee.set(key, row)
    }
    if (isDone(t.status)) { row.done++; continue }
    row.open++
    if (t.status === 'running') row.running++
    else if (t.status === 'blocked') row.blocked++
    else row.todoIsh++
  }
  const loads = [...byAssignee.values()]
  const assigneeCount = loads.length
  const totalOpen = loads.reduce((s, l) => s + l.open, 0)
  const meanOpen = assigneeCount ? totalOpen / assigneeCount : 0
  const overloadThreshold = Math.max(3, Math.ceil(meanOpen * 2))
  for (const l of loads) l.overloaded = l.open > overloadThreshold
  const maxOpen = loads.reduce((m, l) => Math.max(m, l.open), 0)
  const resource: ResourceAccount = {
    loads: loads.sort((a, b) => b.open - a.open || a.assignee.localeCompare(b.assignee)),
    overloadThreshold,
    idle: loads.filter((l) => l.open === 0).map((l) => l.assignee),
    structuralMismatch: meanOpen > 0 && maxOpen / meanOpen >= 2,
  }

  return { progress, risk, resource }
}
