// custom/server/orchestrator/summarizer.ts
// 人类交互汇总（2026-10-31 C 批 C1，spec D4/D5）。
// 上游语义：Worker 不直接与人交互，由上层汇总后统一回复（docs/003-execution.md）。
// 本模块只做确定性模板，不调模型；输入是订阅者游标之后的增量事件。
//
// 规则（spec §4.1）：
// 1) 同一 Thread、时间窗（默认 5 分钟）内的增量事件合并为一条；
// 2) 按事件 kind 分组计数；
// 3) 终态/阻塞类事件保留任务标题；纯列变更只给计数；
// 4) 全部是列变更且无终态事件时不生成消息（静默）；
// 5) 结果写 digest 表，投递由既有渠道消费（本模块不推送）。
import type { Digest, Trigger } from './types'

/** 视为需要人知道的终态/异常事件：这些事件不允许被聚合成计数后消失。 */
const NOTABLE_KINDS = new Set([
  'completed', 'failed', 'crashed', 'timed_out', 'gave_up', 'blocked',
  'review_requested', 'changes_requested', 'block_loop_detected',
])

const KIND_LABELS: Record<string, string> = {
  claimed: '认领',
  completed: '完成',
  blocked: '阻塞',
  unblocked: '解除阻塞',
  review_requested: '待评审',
  changes_requested: '要求修改',
  crashed: '崩溃',
  timed_out: '超时',
  failed: '失败',
  gave_up: '放弃',
  column_transition: '列变更',
  review_reopened: '重开评审',
  block_loop_detected: '阻塞循环',
}

export interface SummarizeOptions {
  /** 时间窗（毫秒）：只合并距最后一条事件这么久之内的事件。 */
  windowMs?: number
  /** 单条摘要最多列出的具体任务数（超出折叠为「还有 N 个」）。 */
  maxListed?: number
}

function newDigestId(): string {
  const t = Date.now().toString(36).padStart(9, '0')
  const r = Math.random().toString(36).slice(2, 10).padStart(8, '0')
  return `dig_${t}${r}`
}

function kindOf(trigger: Trigger): string {
  const payload = trigger.payload
  if (payload && typeof payload === 'object') {
    const kind = (payload as { kind?: unknown }).kind
    if (typeof kind === 'string' && kind.trim()) return kind.trim()
  }
  return 'unknown'
}

function taskOf(trigger: Trigger): string {
  const payload = trigger.payload
  if (payload && typeof payload === 'object') {
    const taskId = (payload as { taskId?: unknown }).taskId
    if (typeof taskId === 'string' && taskId.trim()) return taskId.trim()
  }
  return trigger.threadKey.split(':').pop() ?? trigger.threadKey
}

function labelOf(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}

/**
 * 生成一条汇总；返回 null 表示应当静默（没有值得人看的内容）。
 * 纯函数：不读盘、不写盘，便于测试与复用。
 */
export function summarize(
  threadId: string,
  subscriber: string,
  triggers: Trigger[],
  opts: SummarizeOptions = {},
): Digest | null {
  if (!triggers.length) return null
  const windowMs = opts.windowMs ?? 5 * 60_000
  const maxListed = Math.max(1, opts.maxListed ?? 5)
  const ordered = triggers.slice().sort((a, b) => a.receivedAt - b.receivedAt)
  const latest = ordered[ordered.length - 1]!.receivedAt
  const inWindow = ordered.filter(t => latest - t.receivedAt <= windowMs)

  const notable = inWindow.filter(t => NOTABLE_KINDS.has(kindOf(t)))
  const counts = new Map<string, number>()
  for (const t of inWindow) {
    const kind = kindOf(t)
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  // 规则 4：只有列变更、没有终态事件 → 静默。
  const onlyColumnTransitions = inWindow.every(t => kindOf(t) === 'column_transition')
  if (onlyColumnTransitions) return null

  const parts: string[] = []
  if (notable.length) {
    const listed = notable.slice(-maxListed)
    const items = listed.map(t => `${taskOf(t)} ${labelOf(kindOf(t))}`)
    const rest = notable.length - listed.length
    parts.push(rest > 0 ? `${items.join('、')} 等 ${notable.length} 项有结果` : items.join('、'))
  }
  const others = [...counts.entries()]
    .filter(([kind]) => kind !== 'column_transition' && !NOTABLE_KINDS.has(kind))
    .map(([kind, n]) => `${labelOf(kind)} ${n} 条`)
  if (others.length) parts.push(others.join('、'))
  const transitions = counts.get('column_transition') ?? 0
  if (transitions) parts.push(`另 ${transitions} 条列变更`)

  const body = parts.join('；')
  return { id: newDigestId(), threadId, subscriber, body, eventCount: inWindow.length, delivered: false, createdAt: latest }
}
