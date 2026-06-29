import { formatWhen, kindToWhat } from './event-adapter'
import { toMs } from './task-adapter'

export interface HistoryItem {
  id: string
  when: string
  ts: number
  taskId: string
  source: 'event' | 'comment'
  action: string
  title: string
  archived: boolean
}

/** 聚合路由返回的原始 item（见 patch 079） */
export interface TimelineRawItem {
  source: 'event' | 'comment'
  id: string
  taskId: string
  taskTitle: string
  taskArchived: boolean
  ts: number
  // event 字段
  kind?: string
  payload?: Record<string, unknown> | null
  // comment 字段
  author?: string
  body?: string
}

export function deriveAction(source: 'event' | 'comment', item: { kind?: string; payload?: Record<string, unknown> | null }): string {
  if (source === 'comment') return '补充'
  const kind = item.kind ?? ''
  const to = item.payload?.to
  if (kind === 'status_changed' && to === 'done') return '决策'
  if (kind === 'status_changed' && to === 'review') return '审批'
  if (kind === 'commented') return '补充'
  if (kind === 'linked') return '关联'
  if (kind === 'assigned') return '委派'
  if (kind === 'completed') return '决策'
  return '评估'
}

export function mergeTimeline(items: TimelineRawItem[]): HistoryItem[] {
  return items
    .slice()
    .sort((a, b) => toMs(b.ts) - toMs(a.ts))
    .map(it => ({
      id: `h-${it.id}`,
      when: formatWhen(toMs(it.ts)),
      ts: toMs(it.ts),
      taskId: it.taskId,
      source: it.source,
      action: deriveAction(it.source, { kind: it.kind, payload: it.payload }),
      title: it.source === 'comment'
        ? (it.body ?? '')
        : kindToWhat(it.kind ?? '', it.payload ?? null),
      archived: it.taskArchived,
    }))
}
