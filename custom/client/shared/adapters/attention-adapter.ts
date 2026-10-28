import type { KanbanTask } from '@/api/hermes/kanban'
import { bucketPriority, toMs, type CockpitPriority, type CockpitTask } from '@/custom/shared/adapters/task-adapter'

const PRIORITY_ORDER: readonly CockpitPriority[] = ['P0', 'P1', 'P2', 'P3']

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
export function toAttention(task: KanbanTask | CockpitTask): AttentionItem | null {
  // Kanban priority 是数值，CockpitTask 是 P0-P3；输出沿用原始数值语义。
  const priority = typeof task.priority === 'string'
    ? 3 - PRIORITY_ORDER.indexOf(task.priority)
    : task.priority ?? 0
  const createdAt = 'created_at' in task ? toMs(task.created_at) : task.createdAt
  const base = { taskId: task.id, createdAt, priority, status: task.status }
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

/** 梯队内排序：数值越大优先级越高，与 P0→P3 一致。 */
export function attentionPriorityRank(priority: number): number {
  return PRIORITY_ORDER.indexOf(bucketPriority(priority))
}

/** 梯队排序权重：blocked=0, review=1, triage=2 */
export function attentionTier(status: string): number {
  if (status === 'blocked') return 0
  if (status === 'review') return 1
  return 2 // triage
}
