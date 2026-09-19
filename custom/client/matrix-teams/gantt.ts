// overlay/custom/client/matrix-teams/gantt.ts
// M-D 甘特投影：dueAt/dependsOn 纯函数投影（spec v1.2 §5.1）。
// 无 dueAt 的任务回落列表视图（MVP 计划 M-D 验收门 3），不参与时间轴排布。
export interface GanttTask {
  taskId: string
  title: string
  status: string
  /** epoch 毫秒；缺省任务回落列表。 */
  dueAt?: number
  dependsOn?: string[]
}

export interface GanttRow {
  task: GanttTask
  /** 时间轴行（有 dueAt 才有）。 */
  dueAt: number
  overdue: boolean
}

export interface GanttEdge {
  from: string
  to: string
}

export interface GanttProjection {
  /** 按到期升序；逾期在前不重排（时间即序）。 */
  rows: GanttRow[]
  /** 依赖连线（仅两端都在时间轴上的边）。 */
  edges: GanttEdge[]
  /** 无 dueAt 任务：回落列表视图。 */
  listOnly: GanttTask[]
  now: number
}

export function projectGantt(tasks: readonly GanttTask[], now: number = Date.now()): GanttProjection {
  const timed = tasks.filter((t): t is GanttTask & { dueAt: number } => typeof t.dueAt === 'number')
  const rows: GanttRow[] = timed
    .map(t => ({ task: t, dueAt: t.dueAt, overdue: t.dueAt < now && t.status !== 'done' }))
    .sort((a, b) => a.dueAt - b.dueAt)
  const onAxis = new Set(rows.map(r => r.task.taskId))
  const edges: GanttEdge[] = []
  for (const t of timed) {
    for (const dep of t.dependsOn ?? []) {
      // 两端都在时间轴才画线；依赖指向不存在的任务忽略（容错，不抛）。
      if (onAxis.has(dep) && dep !== t.taskId) edges.push({ from: dep, to: t.taskId })
    }
  }
  const listOnly = tasks.filter(t => typeof t.dueAt !== 'number')
  return { rows, edges, listOnly, now }
}
