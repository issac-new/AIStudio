// overlay/custom/client/kanban/utils/task-status-filter.ts
// 视图级状态过滤（2026-10-19 阶段看板）：与看板工具栏的单状态筛选、搜索、
// “我的待办”等既有过滤链叠加，不写入 store（避免污染全量看板）。
export function filterTasksByStatuses<T extends { status: string }>(
  tasks: readonly T[],
  statuses: readonly string[] | undefined | null,
): T[] {
  if (!statuses || statuses.length === 0) return [...tasks]
  const allow = new Set(statuses)
  return tasks.filter((task) => allow.has(task.status))
}
