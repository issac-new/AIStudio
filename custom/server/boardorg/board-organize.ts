// overlay/boardorg 域：看板组织面投影（multica §四 吸收，矩阵 §3.5 P2）。
//
// multica 语义（看板组织面：issue 父子/优先级五档/acceptance_criteria/gantt/swimlane
// 四视图）：看板不只列桶——**组织维度**：父子层级（issue 树）、优先级五档、
// 验收标准清单、四视图（gantt 时序/swimlane 泳道/board 列/list 表）。本模块=组织
// 投影纯函数（数据→四视图行），渲染层消费。
export type Priority = 'p0' | 'p1' | 'p2' | 'p3' | 'p4'

export interface BoardTask {
  taskId: string
  parentId: string | null
  title: string
  priority: Priority
  column: string
  assignee: string
  /** 验收标准清单（multica acceptance_criteria）。 */
  acceptance: string[]
  startAt: number | null
  endAt: number | null
}

export type BoardView = 'gantt' | 'swimlane' | 'board' | 'list'

/** 四视图投影（multica 语义：同一数据四种排布）。 */
export function projectView(tasks: readonly BoardTask[], view: BoardView): unknown {
  switch (view) {
    case 'gantt':
      // 时序视图：按 startAt 排（无 start 排尾）。
      return [...tasks].sort((a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity))
        .map((t) => ({ taskId: t.taskId, title: t.title, startAt: t.startAt, endAt: t.endAt, parentId: t.parentId }))
    case 'swimlane':
      // 泳道视图：按 assignee 分组（组内 priority 降序）。
      return groupBy(tasks, (t) => t.assignee, (a, b) => priorityRank(b.priority) - priorityRank(a.priority))
    case 'board':
      // 列视图：按 column 分组（组内 priority 降序）。
      return groupBy(tasks, (t) => t.column, (a, b) => priorityRank(b.priority) - priorityRank(a.priority))
    case 'list':
      // 表视图：priority 降序+父子缩进标记。
      return [...tasks]
        .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
        .map((t) => ({ ...t, indented: t.parentId !== null }))
  }
}

function priorityRank(p: Priority): number {
  return 5 - Number(p.slice(1))  // p0 最高
}

function groupBy(tasks: readonly BoardTask[], key: (t: BoardTask) => string, sort: (a: BoardTask, b: BoardTask) => number): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const t of [...tasks].sort(sort)) {
    const k = key(t)
    ;(out[k] ??= []).push(t)
  }
  return out
}

/** 父子树校验（acceptance 准备度：有验收标准才算 ready 立项）。 */
export function acceptanceReadiness(tasks: readonly BoardTask[]): { ready: string[]; missing: string[] } {
  const ready: string[] = []
  const missing: string[] = []
  for (const t of tasks) {
    if (t.acceptance.length > 0) ready.push(t.taskId)
    else missing.push(t.taskId)
  }
  return { ready, missing }
}
