import type { KanbanTask } from '@/api/hermes/kanban'

export type AttentionSeverity = 'high' | 'medium' | 'low'

export interface AttentionItem {
  id: string
  severity: AttentionSeverity
  title: string
  taskId: string
  createdAt: number
  priority: number
  /** 原始 kanban 状态，用于颜色区分 */
  status: string
}

/** 按 status 派生注意力项：triage/blocked→high、review→medium，其余不进注意力条 */
export function toAttention(task: KanbanTask): AttentionItem | null {
  const base = { taskId: task.id, createdAt: (task.created_at ?? 0) * 1000, priority: task.priority ?? 3, status: task.status }
  if (task.status === 'triage') {
    return { ...base, id: `att-${task.id}`, severity: 'high', title: `待分类 · ${task.title}` }
  }
  if (task.status === 'blocked') {
    return { ...base, id: `att-${task.id}`, severity: 'high', title: `阻塞 · ${task.title}` }
  }
  if (task.status === 'review') {
    return { ...base, id: `att-${task.id}`, severity: 'medium', title: `待审 · ${task.title}` }
  }
  return null
}

/** 梯队排序权重：blocked=0, review=1, triage=2 */
export function attentionTier(status: string): number {
  if (status === 'blocked') return 0
  if (status === 'review') return 1
  return 2 // triage
}
