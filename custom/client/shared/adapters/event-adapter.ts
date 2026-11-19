import type {
  KanbanTaskDetail, KanbanEvent, KanbanRun, KanbanTaskMessage,
} from '@/api/hermes/kanban'
import { toMs } from '@/custom/shared/adapters/task-adapter'

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

/**
 * 事件 kind → 中文文案（单一实现，截断与全文两处共用，避免两份 case 表漂移）。
 *
 * kind 词表以 kernel `task_events` 实际写入为准（2026-11-19 对齐）：真实存在的是
 * `status` / `column_transition` / `review_requested` / `gate_blocked` 等，而不是
 * `status_changed` / `created` / `assigned` / `completed`——后者是本适配器早期假设的
 * 形态，kernel 从不写。`status_changed` 与另几个历史分支保留作旧投影兼容。
 */
function describeKind(kind: string, payload: Record<string, unknown> | null, truncate: boolean): string {
  const p = payload ?? {}
  const cut = (v: unknown, n = 80) => {
    const s = typeof v === 'string' ? v : ''
    if (!truncate) return s
    return s.length > n ? s.slice(0, n) + '…' : s
  }
  switch (kind) {
    case 'created': return '创建任务'
    // 真实 kind：直接状态写（plugin_api `INSERT ... 'status'`），payload {status, requested_status}
    case 'status': return `状态 → ${p.status ?? p.to ?? '?'}`
    // 真实 kind：列门通过后补记，payload {to, mode, results, actor?}
    case 'column_transition': {
      const mode = typeof p.mode === 'string' ? `（${p.mode}）` : ''
      return `流转 → ${p.to ?? '?'}${mode}`
    }
    // 历史/兼容形态：kernel 不写，旧投影可能产
    case 'status_changed': return `状态 → ${p.to ?? '?'}`
    case 'assigned': return `指派给 ${p.assignee ?? '?'}`
    case 'commented': return `评论：${cut(p.body)}`
    case 'linked': return `关联父任务 ${p.parent_id ?? p.parent ?? '?'}`
    case 'dispatched': case 'spawned': return '派发执行'
    case 'completed': return `完成：${cut(p.result)}`
    case 'blocked': return `标记阻塞：${cut(p.reason)}`
    case 'review_requested': return `请求评审：${cut(p.reason)}`
    case 'scheduled': return `排期${p.to ? ` → ${p.to}` : ''}`
    case 'archived': return '归档'
    case 'reclaimed': return `回收重派：${cut(p.reason)}`
    case 'gave_up': return `放弃：${cut(p.reason)}`
    case 'needs_decision': return `等待决策：${cut(p.reason)}`
    case 'gate_blocked': return `门禁拦截 → ${p.to ?? '?'}：${cut(p.reason)}`
    case 'gate_warning': return `门禁告警 → ${p.to ?? '?'}`
    case 'completion_blocked_contract': return `完成契约未通过：${cut(p.error ?? p.reason)}`
    case 'completion_contract_warning': return `完成契约告警：${cut(p.reason)}`
    case 'verification_level_result': return `验证等级结果：${cut(p.level ?? p.status)}`
    case 'edited': return '编辑任务'
    case 'attached': return `挂附件：${cut(p.filename)}`
    case 'attachment_removed': return `移除附件：${cut(p.filename)}`
    case 'promoted_manual': return '手动提升'
    case 'reprioritized': return `调整优先级：${cut(p.priority)}`
    case 'estimate_set': return `设置预估：${cut(p.estimate_days)}`
    case 'claim_rejected': return `认领被拒：${cut(p.reason)}`
    case 'skipped_nonspawnable': return `跳过（不可派发）：${cut(p.reason)}`
    case 'worker_registered': return `worker 注册：${cut(p.pid)}`
    case 'pr_acceptance': return `PR 验收：${cut(p.status ?? p.reason)}`
    case 'reconciled': return '状态对账'
    case 'parents_not_done': return `父任务未完成：${cut(p.parent ?? p.reason)}`
    case 'archive_worker_termination': return '归档时终止 worker'
    default:
      if (kind.endsWith('_failed')) return `失败：${cut(p.error)}`
      return kind
  }
}

/** 状态类事件是否代表「仍在等待」——用于轨迹条目的 pending 高亮。 */
function isPendingKind(kind: string): boolean {
  return kind.includes('pending') || kind === 'needs_decision'
}

export function kindToWhat(kind: string, payload: Record<string, unknown> | null): string {
  return describeKind(kind, payload, true)
}

/** 完整文案（不截断，用于双击弹窗） */
function kindToFullText(kind: string, payload: Record<string, unknown> | null): string {
  return describeKind(kind, payload, false)
}

function fromEvent(taskId: string, e: KanbanEvent): CockpitEvent {
  const actor = (e.payload && typeof e.payload.actor === 'string' && e.payload.actor) || 'system'
  return {
    id: `evt-event-${e.id}`,
    taskId, actor, kind: 'A2A',
    what: kindToWhat(e.kind, e.payload),
    fullText: kindToFullText(e.kind, e.payload),
    when: formatWhen(toMs(e.created_at)),
    pending: isPendingKind(e.kind),
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
function fromComment(taskId: string, c: { id: number | string; author: string; body: string; created_at: number }): CockpitEvent {
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
// 导出供 cockpit store 合并 worker log 事件（此前未导出，构建报 IMPORT_IS_UNDEFINED，
// 打开任务日志会抛 eventAdapter.fromLog is not a function）。
export function fromLog(taskId: string, log: { content: string; size_bytes: number; truncated: boolean }): CockpitEvent {
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
