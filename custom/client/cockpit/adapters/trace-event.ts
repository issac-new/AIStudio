/**
 * 统一事件契约 — 对齐 AgentScope AgentEvent 设计理念。
 *
 * 将弱类型的 RunEvent 提升为判别联合 TraceEvent，
 * 每个事件有统一基类（id/created_at/session_id/metadata）。
 *
 * @see AgentScope src/agentscope/event/_event.py (AgentEvent 判别联合)
 */
import type { RunEvent } from '@/api/hermes/chat'

// ── 统一事件基类 ──

/** 所有 trace 事件的共同字段，对齐 AgentScope EventBase */
export interface TraceEventBase {
  /** 自动生成的事件 ID（对齐 AgentScope EventBase.id） */
  id: string
  /** ISO 8601 时间戳（对齐 AgentScope EventBase.created_at） */
  created_at: string
  /** 会话 ID */
  session_id: string
  /** Run ID（可选，部分事件不携带） */
  run_id?: string
  /** 扩展字段，供中间件使用（对齐 AgentScope EventBase.metadata） */
  metadata?: Record<string, unknown>
  /** 原始 unix 毫秒时间戳，用于 reducer 计算 */
  timestamp: number
}

// ── 12 种事件类型（映射 AgentScope 27 种 → 我们的核心子集） ──

export interface ReplyStartEvent extends TraceEventBase {
  type: 'REPLY_START'
  runId: string
  model?: string
  provider?: string
}

export interface ReplyEndEvent extends TraceEventBase {
  type: 'REPLY_END'
  runId: string
  status: 'ok' | 'error'
  error?: string
  usage?: RunEvent['usage']
}

export interface ModelCallStartEvent extends TraceEventBase {
  type: 'MODEL_CALL_START'
  apiRequestId: string
  model?: string
  provider?: string
}

export interface ModelCallEndEvent extends TraceEventBase {
  type: 'MODEL_CALL_END'
  apiRequestId: string
  model?: string
  provider?: string
  durationMs?: number
  finishReason?: string
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
}

export interface TextBlockDeltaEvent extends TraceEventBase {
  type: 'TEXT_BLOCK_DELTA'
  text: string
}

export interface ThinkingBlockDeltaEvent extends TraceEventBase {
  type: 'THINKING_BLOCK_DELTA'
  text: string
}

export interface ToolCallStartEvent extends TraceEventBase {
  type: 'TOOL_CALL_START'
  toolName: string
  preview?: string
}

export interface ToolCallEndEvent extends TraceEventBase {
  type: 'TOOL_CALL_END'
  toolName?: string
  output?: string
  error?: string
}

export interface SubagentStartEvent extends TraceEventBase {
  type: 'SUBAGENT_START'
  label: string
  preview?: string
}

export interface SubagentEndEvent extends TraceEventBase {
  type: 'SUBAGENT_END'
  label: string
  status: 'ok' | 'error'
}

export interface SubagentProgressEvent extends TraceEventBase {
  type: 'SUBAGENT_PROGRESS'
  label: string
  preview?: string
  /** Phase 3: task plan 变更（对齐 AgentScope tasks_context） */
  tasksContext?: { tasks: Array<{ id: string; title: string; status: string }> }
}

export interface UsageUpdatedEvent extends TraceEventBase {
  type: 'USAGE_UPDATED'
  usage: RunEvent['usage']
}

export interface StateUpdatedEvent extends TraceEventBase {
  type: 'STATE_UPDATED'
  tasksContext?: { tasks: Array<{ id: string; title: string; status: string }> }
  permissionContext?: { rules: unknown[] }
}

/** 判别联合：所有 trace 事件 */
export type TraceEvent =
  | ReplyStartEvent
  | ReplyEndEvent
  | ModelCallStartEvent
  | ModelCallEndEvent
  | TextBlockDeltaEvent
  | ThinkingBlockDeltaEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | SubagentStartEvent
  | SubagentEndEvent
  | SubagentProgressEvent
  | UsageUpdatedEvent
  | StateUpdatedEvent

/** 事件类型字面量集合，用于 exhaustiveness 检查 */
export type TraceEventType = TraceEvent['type']

// ── RunEvent → TraceEvent 归一化 ──

let _eventCounter = 0

function genEventId(): string {
  _eventCounter += 1
  return `evt-${Date.now().toString(36)}-${_eventCounter.toString(36)}`
}

function toIso(ms: number): string {
  return new Date(ms).toISOString()
}

/**
 * 将弱类型 RunEvent 归一化为判别联合 TraceEvent。
 *
 * 这是唯一的"脏"边界：所有后续 reducer/中间件只消费强类型的 TraceEvent。
 */
export function normalizeRunEvent(raw: RunEvent): TraceEvent {
  const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : Date.now()
  const base: TraceEventBase = {
    id: genEventId(),
    created_at: toIso(timestamp),
    session_id: raw.session_id,
    run_id: raw.run_id,
    timestamp,
  }

  switch (raw.event) {
    case 'run.started':
      return { ...base, type: 'REPLY_START', runId: raw.run_id || '', model: raw.model, provider: raw.provider }

    case 'run.completed':
      return { ...base, type: 'REPLY_END', runId: raw.run_id || '', status: 'ok', usage: raw.usage }

    case 'run.failed':
      return { ...base, type: 'REPLY_END', runId: raw.run_id || '', status: 'error', error: raw.error, usage: raw.usage }

    case 'tool.started':
      return { ...base, type: 'TOOL_CALL_START', toolName: raw.tool || raw.name || 'tool', preview: raw.preview }

    case 'tool.completed':
      return { ...base, type: 'TOOL_CALL_END', toolName: raw.tool || raw.name, output: raw.output, error: raw.error }

    case 'reasoning.delta':
    case 'thinking.delta':
    case 'reasoning.available':
      return { ...base, type: 'THINKING_BLOCK_DELTA', text: raw.text || raw.delta || '' }

    case 'message.delta':
      return { ...base, type: 'TEXT_BLOCK_DELTA', text: raw.delta || raw.text || '' }

    case 'usage.updated':
      return { ...base, type: 'USAGE_UPDATED', usage: raw.usage }

    case 'subagent.start':
      return { ...base, type: 'SUBAGENT_START', label: raw.name || raw.tool || raw.preview || raw.event, preview: raw.preview }

    case 'subagent.complete':
      return { ...base, type: 'SUBAGENT_END', label: raw.name || raw.tool || raw.preview || raw.event, status: 'ok' }

    case 'subagent.progress':
    case 'subagent.tool':
      return { ...base, type: 'SUBAGENT_PROGRESS', label: raw.name || raw.tool || raw.preview || raw.event, preview: raw.preview, tasksContext: raw.tasks_context as SubagentProgressEvent['tasksContext'] }

    default:
      // 未知事件归一化为 TEXT_BLOCK_DELTA（保持向后兼容）
      return { ...base, type: 'TEXT_BLOCK_DELTA', text: '' }
  }
}

/** 批量归一化 */
export function normalizeRunEvents(raws: RunEvent[]): TraceEvent[] {
  return raws.map(normalizeRunEvent)
}
