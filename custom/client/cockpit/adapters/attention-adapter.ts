import type { KanbanTask } from '@/api/hermes/kanban'

export type AttentionSeverity = 'high' | 'medium' | 'low'

export interface AttentionItem {
  id: string
  severity: AttentionSeverity
  title: string
  taskId: string
}

/** 仅按 status 派生（决策 #4）：blocked→high、review→medium，其余不进注意力条 */
export function toAttention(task: KanbanTask): AttentionItem | null {
  if (task.status === 'blocked') {
    return { id: `att-${task.id}`, taskId: task.id, severity: 'high', title: `阻塞 · ${task.title}` }
  }
  if (task.status === 'review') {
    return { id: `att-${task.id}`, taskId: task.id, severity: 'medium', title: `待审 · ${task.title}` }
  }
  return null
}
