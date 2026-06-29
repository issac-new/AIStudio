import type {
  KanbanTaskDetail, KanbanEvent, KanbanRun, KanbanTaskMessage,
} from '@/api/hermes/kanban'
import { toMs } from './task-adapter'

export type EventActorKind = 'A2H' | 'A2A'

export interface CockpitEvent {
  id: string
  taskId: string
  actor: string
  kind: EventActorKind
  what: string         // 截断版（UI 单行显示）
  fullText: string     // 完整原文（双击弹窗显示）
  when: string
  pending: boolean
  ts: number
  source: 'event' | 'run' | 'comment' | 'log' | 'message'  // 轨迹类型
}

function trunc(s: string | null | undefined, n = 80): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function formatWhen(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameDay) return hm
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`
}

export function kindToWhat(kind: string, payload: Record<string, unknown> | null): string {
  const p = payload ?? {}
  switch (kind) {
    case 'created': return '创建任务'
    case 'status_changed': return `状态 → ${p.to ?? '?'}`
    case 'assigned': return `指派给 ${p.assignee ?? '?'}`
    case 'commented': return `评论：${trunc(typeof p.body === 'string' ? p.body : '')}`
    case 'linked': return `关联父任务 ${p.parent_id ?? '?'}`
    case 'dispatched': return '派发执行'
    case 'completed': return `完成：${trunc(typeof p.result === 'string' ? p.result : '')}`
    case 'blocked': return `标记阻塞：${trunc(typeof p.reason === 'string' ? p.reason : '')}`
    default:
      if (kind.endsWith('_failed')) return `失败：${trunc(typeof p.error === 'string' ? p.error : '')}`
      return kind
  }
}

/** 完整文案（不截断，用于双击弹窗） */
function kindToFullText(kind: string, payload: Record<string, unknown> | null): string {
  const p = payload ?? {}
  switch (kind) {
    case 'created': return '创建任务'
    case 'status_changed': return `状态 → ${p.to ?? '?'}`
    case 'assigned': return `指派给 ${p.assignee ?? '?'}`
    case 'commented': return `评论：${typeof p.body === 'string' ? p.body : ''}`
    case 'linked': return `关联父任务 ${p.parent_id ?? '?'}`
    case 'dispatched': return '派发执行'
    case 'completed': return `完成：${typeof p.result === 'string' ? p.result : ''}`
    case 'blocked': return `标记阻塞：${typeof p.reason === 'string' ? p.reason : ''}`
    default:
      if (kind.endsWith('_failed')) return `失败：${typeof p.error === 'string' ? p.error : ''}`
      return kind
  }
}

function fromEvent(taskId: string, e: KanbanEvent): CockpitEvent {
  const actor = (e.payload && typeof e.payload.actor === 'string' && e.payload.actor) || 'system'
  return {
    id: `evt-event-${e.id}`,
    taskId, actor, kind: 'A2A',
    what: kindToWhat(e.kind, e.payload),
    fullText: kindToFullText(e.kind, e.payload),
    when: formatWhen(toMs(e.created_at)),
    pending: e.kind.includes('pending'),
    ts: toMs(e.created_at),
    source: 'event',
  }
}

function fromRun(taskId: string, r: KanbanRun): CockpitEvent {
  // what 显示：status + outcome + summary（截断），让节点信息更丰富
  const parts: string[] = [`[${r.status}]`]
  if (r.outcome) parts.push(r.outcome)
  if (r.summary) parts.push(trunc(r.summary, 60))
  const whatText = parts.join(' ')
  return {
    id: `evt-run-${r.id}`,
    taskId, actor: r.profile ?? 'system', kind: 'A2A',
    what: whatText,
    fullText: [
      `状态：${r.status}`,
      r.outcome ? `结果：${r.outcome}` : '',
      r.summary ? `摘要：${r.summary}` : '',
      r.error ? `错误：${r.error}` : '',
      r.ended_at ? `耗时：${Math.round((toMs(r.ended_at) - toMs(r.started_at)) / 1000)}秒` : '',
    ].filter(Boolean).join('\n'),
    when: formatWhen(toMs(r.started_at)),
    pending: r.status === 'running',
    ts: toMs(r.started_at),
    source: 'run',
  }
}

function fromMessage(taskId: string, assignee: string | null, m: KanbanTaskMessage): CockpitEvent {
  const isUser = m.role === 'user'
  return {
    id: `evt-msg-${m.id}`,
    taskId, actor: isUser ? (assignee ?? 'user') : (m.role || 'assistant'),
    kind: isUser ? 'A2H' : 'A2A',
    what: trunc(m.content), fullText: m.content,
    when: formatWhen(toMs(m.timestamp)),
    pending: false, ts: toMs(m.timestamp),
    source: 'message',
  }
}

// 评论 → CockpitEvent
function fromComment(taskId: string, c: { id: number; author: string; body: string; created_at: number }): CockpitEvent {
  return {
    id: `evt-comment-${c.id}`,
    taskId, actor: c.author || 'unknown', kind: 'A2H',
    what: `评论：${trunc(c.body)}`, fullText: c.body,
    when: formatWhen(toMs(c.created_at)),
    pending: false, ts: toMs(c.created_at),
    source: 'comment',
  }
}

// worker log → CockpitEvent（单个节点，ts 用当前时间——log 是最新执行日志）
function fromLog(taskId: string, log: { content: string; size_bytes: number; truncated: boolean }): CockpitEvent {
  return {
    id: `evt-log-${taskId}`,
    taskId, actor: 'worker', kind: 'A2A',
    what: `Worker Log（${log.size_bytes} bytes${log.truncated ? ', 截断' : ''}）`,
    fullText: log.content,
    when: '现在',
    pending: false,
    ts: Date.now(),  // 当前时间（排最新位置）
    source: 'log',
  }
}

export function mergeDetail(d: KanbanTaskDetail): CockpitEvent[] {
  const taskId = d.task.id
  const assignee = d.task.assignee
  const events = (d.events ?? []).map(e => fromEvent(taskId, e))
  const runs = (d.runs ?? []).map(r => fromRun(taskId, r))
  const msgs = (d.session?.messages ?? []).map(m => fromMessage(taskId, assignee, m))
  const comments = (d.comments ?? []).map(c => fromComment(taskId, c))
  return [...events, ...runs, ...msgs, ...comments].sort((a, b) => a.ts - b.ts)
}
