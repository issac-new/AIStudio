// overlay[delivery]: C×L 效能画像矩阵纯函数（2026-10-23 天猫数字员工两文吸收轮）。
// 文章口径（实践篇 §5.1）：需求分层 C1-C4（复杂度）× AI 交付深度 L1-L4（承接范围）
// 交叉画像，每格「需求数 + 平均介入次数」。
// SwarmStudio 代用口径（spec D4-D6，实测约束：estimate_days/task_links 全空为主、
// task_events 无 column_transition）：
//   C 档=estimate_days 与子任务数取高，信号全缺席=C0 未评估（如实降档，不伪精确）
//   L 档=看板生命周期：L0 未启动/L1 已认领/L2 执行中/L3 评审中(或完成无产物)/L4 完成有产物
//   avgInterventions=格内任务 commented 事件均值（板库实有锚点，不跨源硬 join）

export interface TaskLite {
  id: string
  title: string
  status: string
  board: string
  assignee: string | null
  /** epoch 秒（缺失 null） */
  createdAt: number | null
  startedAt: number | null
  completedAt: number | null
  lastHeartbeatAt: number | null
  result: string | null
  estimateDays: number | null
  childCount: number
  commentCount: number
}

export type CTier = 0 | 1 | 2 | 3 | 4
export type LTier = 0 | 1 | 2 | 3 | 4

// 文案=2026-10-23 说人话批（D20）：代码前缀保留供对账，描述用生活语言
export const C_LABELS: Record<CTier, string> = {
  0: 'C0 难度未知',
  1: 'C1 简单',
  2: 'C2 中等',
  3: 'C3 较难',
  4: 'C4 很难',
}

export const L_LABELS: Record<LTier, string> = {
  0: 'L0 还没动',
  1: 'L1 有人领了',
  2: 'L2 正在干',
  3: 'L3 在评审或没留成果',
  4: 'L4 干完有成果',
}

/** estimate_days → C 档（≤1=C1/≤3=C2/≤5=C3/>5=C4；null=无信号 0） */
export function cTierOfEstimate(days: number | null): CTier {
  if (days == null || !Number.isFinite(days) || days <= 0) return 0
  if (days <= 1) return 1
  if (days <= 3) return 2
  if (days <= 5) return 3
  return 4
}

/** 子任务数 → C 档（≥1=C2/≥3=C3/≥6=C4；0=无信号） */
export function cTierOfChildren(count: number): CTier {
  if (count >= 6) return 4
  if (count >= 3) return 3
  if (count >= 1) return 2
  return 0
}

/** 任务 → C 档（就高原则；信号全缺席=C0） */
export function cTierOf(task: Pick<TaskLite, 'estimateDays' | 'childCount'>): CTier {
  return Math.max(cTierOfEstimate(task.estimateDays), cTierOfChildren(task.childCount)) as CTier
}

const DONE_LIKE = new Set(['done', 'archived'])

/** 任务 → L 档（D5）：todo 族=0；已认领=1；running/blocked=2；review=3；
 *  done/archived：result 非空=4、空=3（完成无产物如实降档） */
export function lTierOf(task: Pick<TaskLite, 'status' | 'startedAt' | 'result'>): LTier {
  if (task.status === 'review') return 3
  if (task.status === 'running' || task.status === 'blocked') return 2
  if (DONE_LIKE.has(task.status)) {
    return task.result && task.result.trim() ? 4 : 3
  }
  // triage/todo/scheduled/ready：已认领（started_at 有值）记 L1，纯搁置记 L0
  return task.startedAt != null ? 1 : 0
}

export interface MatrixCell {
  c: CTier
  l: LTier
  count: number
  /** 格内任务 commented 事件均值（一位小数）；无任务为 null */
  avgInterventions: number | null
}

export interface DeliveryMatrix {
  rows: Array<{ tier: CTier; label: string }>
  cols: Array<{ tier: LTier; label: string }>
  cells: MatrixCell[]
  totals: { tasks: number; evaluatedC: number; avgInterventions: number | null }
  /** 口径注记（UI 直读，防误读） */
  note: string
}

/** 任务集 → C×L 矩阵（5×5 全格；空格 count=0） */
export function matrixOf(tasks: TaskLite[]): DeliveryMatrix {
  const buckets = new Map<string, { count: number; comments: number }>()
  for (const t of tasks) {
    const c = cTierOf(t)
    const l = lTierOf(t)
    const key = `${c}:${l}`
    const b = buckets.get(key) ?? { count: 0, comments: 0 }
    b.count += 1
    b.comments += t.commentCount
    buckets.set(key, b)
  }
  const rows: Array<{ tier: CTier; label: string }> = ([4, 3, 2, 1, 0] as CTier[]).map(tier => ({ tier, label: C_LABELS[tier] }))
  const cols: Array<{ tier: LTier; label: string }> = ([0, 1, 2, 3, 4] as LTier[]).map(tier => ({ tier, label: L_LABELS[tier] }))
  const cells: MatrixCell[] = []
  for (const r of rows) {
    for (const col of cols) {
      const b = buckets.get(`${r.tier}:${col.tier}`)
      cells.push({
        c: r.tier,
        l: col.tier,
        count: b?.count ?? 0,
        avgInterventions: b && b.count ? Math.round((b.comments / b.count) * 10) / 10 : null,
      })
    }
  }
  const totalComments = tasks.reduce((s, t) => s + t.commentCount, 0)
  return {
    rows,
    cols,
    cells,
    totals: {
      tasks: tasks.length,
      evaluatedC: tasks.filter(t => cTierOf(t) > 0).length,
      avgInterventions: tasks.length ? Math.round((totalComments / tasks.length) * 10) / 10 : null,
    },
    note: '难度按预估工时定档（没标=难度未知）；进度看板走到哪列；「被插话」按任务上的评论次数算',
  }
}
