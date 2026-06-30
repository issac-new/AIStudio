// overlay/custom/client/cockpit/composables/sessionTaskId.ts
// 从会话标题提取 kanban 任务 ID 的纯工具函数。
// 独立成模块，便于 useRunTrace 与 useRunTraceOverview 共享，且不受 composable mock 影响。

/**
 * 从会话标题提取 kanban 任务 ID（支持多种格式，含宽泛 fallback）。
 * 仅用于 UI 显示等容忍误匹配的场景；聚合匹配请用 matchSessionTaskId。
 */
export function extractKanbanTaskId(title: string): string | null {
  if (!title) return null
  // 格式 1: "work kanban task t_xxx" (原有格式)
  let m = title.match(/work kanban task (t_\w+)/i)
  if (m) return m[1]
  // 格式 2: "task t_xxx" 或 "Task: t_xxx"
  m = title.match(/(?:^|\s)task[:\s]+(t_\w+)/i)
  if (m) return m[1]
  // 格式 3: 直接包含 "t_xxx" (任务 ID 在标题任意位置) —— 低置信度，仅 fallback
  m = title.match(/(t_[a-zA-Z0-9_]+)/i)
  if (m) return m[1]
  return null
}

/**
 * 精确匹配 worker 会话标题 → 任务 ID。
 * 仅匹配标题 === "work kanban task <task_id>"（trim + 大小写不敏感）。
 * 置信度 100%：_default_spawn 用 f"work kanban task {task.id}" 固定生成标题。
 */
export function matchSessionTaskId(title: string): string | null {
  if (!title) return null
  const m = title.trim().match(/^work kanban task (t_\w+)$/i)
  return m ? m[1] : null
}
