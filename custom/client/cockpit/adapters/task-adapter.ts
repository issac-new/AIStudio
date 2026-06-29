import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'

export type CockpitPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type CockpitStatusBucket = KanbanTaskStatus // 'triage' | 'todo' | 'scheduled' | 'ready' | 'running' | 'blocked' | 'review' | 'done' | 'archived'

/** CockpitTask.status stores the raw 9 values; filter chips now expose all 9 individually */
export type CockpitStatus = KanbanTaskStatus

export interface CockpitTask {
  id: string
  title: string
  priority: CockpitPriority
  status: CockpitStatus
  assignee: string
  workspace: string
  tenant: string | null
  boardSlug: string         // 来源看板 slug（跨 board 聚合标记）
  createdAt: number         // 创建时间戳（日期筛选用）
}

export function bucketPriority(p: number | null | undefined): CockpitPriority {
  if (p == null || p <= 0) return 'P3'
  if (p === 1) return 'P2'
  if (p === 2) return 'P1'
  return 'P0' // p >= 3
}

/** 筛选使用全部 9 种状态，不再合并为桶 */
export function bucketStatus(s: KanbanTaskStatus): CockpitStatusBucket {
  return s
}

export function toCockpitTask(t: KanbanTask, boardSlug: string = 'default'): CockpitTask {
  return {
    id: t.id,
    title: t.title,
    priority: bucketPriority(t.priority),
    status: t.status,
    assignee: t.assignee ?? '未分配',
    workspace: t.workspace_path ?? '',
    tenant: t.tenant,
    boardSlug,
    // kanban created_at 是秒级时间戳，统一转为毫秒（与 JS Date 一致）
    createdAt: toMs(t.created_at),
  }
}

/** kanban 时间戳可能是秒或毫秒，统一为毫秒（启发式：< 1e12 视为秒） */
export function toMs(ts: number | null | undefined): number {
  if (ts == null) return 0
  return ts < 1e12 ? ts * 1000 : ts
}
