import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'

export type CockpitPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type CockpitStatusBucket = 'review' | 'blocked' | 'running' | 'todo' | 'done'

/** CockpitTask.status stores the raw 9 values; only filter chips use bucketStatus to merge into 5 buckets */
export type CockpitStatus = KanbanTaskStatus

export interface CockpitTask {
  id: string
  title: string
  priority: CockpitPriority
  status: CockpitStatus
  assignee: string
  workspace: string
  tenant: string | null
}

export function bucketPriority(p: number | null | undefined): CockpitPriority {
  if (p == null || p <= 0) return 'P3'
  if (p === 1) return 'P2'
  if (p === 2) return 'P1'
  return 'P0' // p >= 3
}

export function bucketStatus(s: KanbanTaskStatus): CockpitStatusBucket {
  switch (s) {
    case 'review': return 'review'
    case 'blocked': return 'blocked'
    case 'running': case 'ready': case 'scheduled': return 'running'
    case 'triage': case 'todo': return 'todo'
    case 'done': case 'archived': return 'done'
  }
}

export function toCockpitTask(t: KanbanTask): CockpitTask {
  return {
    id: t.id,
    title: t.title,
    priority: bucketPriority(t.priority),
    status: t.status,
    assignee: t.assignee ?? '未分配',
    workspace: t.workspace_path ?? '~',
    tenant: t.tenant,
  }
}
