// overlay/taskgroups 域：任务组语义（antigravity §四 P0-3 吸收，矩阵 §3.1 antigravity P2）。
//
// antigravity 语义（Task Groups：每组 edited-files 清单+待批步骤专区）：任务不止
// 单卡——**组**聚合一组相关改动：每组带 edited-files 清单（改了哪些文件）+ 待批
// 步骤专区（人须过目的步骤）。衔接 413 证据台账（工件）与 399 门禁（批准）。
export interface TaskGroupStep {
  stepId: string
  description: string
  /** 待批（antigravity 待批步骤专区语义）。 */
  needsApproval: boolean
  approved: boolean
}

export interface TaskGroup {
  groupId: string
  title: string
  /** edited-files 清单（组内改动的文件）。 */
  editedFiles: string[]
  steps: TaskGroupStep[]
}

export interface GroupSummary {
  groupId: string
  pendingApprovals: number
  editedFileCount: number
}

/** 建组（幂等 groupId；重定义改标题/清单/步骤全替换）。 */
export function defineGroup(groups: readonly TaskGroup[], group: TaskGroup): TaskGroup[] {
  const existing = groups.find((g) => g.groupId === group.groupId)
  if (existing) return groups.map((g) => (g.groupId === group.groupId ? group : g))
  return [...groups, group]
}

/** 批步骤（待批专区逐条过目；幂等 approved）。 */
export function approveStep(groups: readonly TaskGroup[], groupId: string, stepId: string, approved: boolean): TaskGroup[] {
  return groups.map((g) => (g.groupId === groupId
    ? { ...g, steps: g.steps.map((s) => (s.stepId === stepId ? { ...s, approved } : s)) }
    : g))
}

/** 组汇总（面板：待批数/改动文件数）。 */
export function groupSummary(groups: readonly TaskGroup[]): GroupSummary[] {
  return groups.map((g) => ({
    groupId: g.groupId,
    pendingApprovals: g.steps.filter((s) => s.needsApproval && !s.approved).length,
    editedFileCount: g.editedFiles.length,
  }))
}
