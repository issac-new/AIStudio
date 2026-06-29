/**
 * 中间件钩子链 — 对齐 AgentScope MiddlewareBase 洋葱模式理念。
 *
 * 每个 TraceMiddleware 处理一类事件，可独立测试和组合。
 * applyRunEvent 遍历中间件链，每个中间件有机会处理或传递事件。
 *
 * @see AgentScope src/agentscope/middleware/_base.py (MiddlewareBase)
 */
import type { TraceState, TraceNode, TraceEdge, TraceTimelineItem, SpanStatus } from './run-trace-adapter'
import type {
  TraceEvent,
  ReplyStartEvent,
  ReplyEndEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  ThinkingBlockDeltaEvent,
  TextBlockDeltaEvent,
  SubagentStartEvent,
  SubagentEndEvent,
  SubagentProgressEvent,
  UsageUpdatedEvent,
  StateUpdatedEvent,
} from './trace-event'

// ── 中间件接口 ──

/**
 * Trace 中间件接口。
 * 每个钩子是可选的，中间件只需实现它关心的事件类型。
 * 对齐 AgentScope MiddlewareBase 的 is_implemented 自动检测模式。
 */
export interface TraceMiddleware {
  onReplyStart?(state: TraceState, event: ReplyStartEvent): TraceState
  onReplyEnd?(state: TraceState, event: ReplyEndEvent): TraceState
  onToolCallStart?(state: TraceState, event: ToolCallStartEvent): TraceState
  onToolCallEnd?(state: TraceState, event: ToolCallEndEvent): TraceState
  onThinkingDelta?(state: TraceState, event: ThinkingBlockDeltaEvent): TraceState
  onTextBlockDelta?(state: TraceState, event: TextBlockDeltaEvent): TraceState
  onSubagentStart?(state: TraceState, event: SubagentStartEvent): TraceState
  onSubagentEnd?(state: TraceState, event: SubagentEndEvent): TraceState
  onSubagentProgress?(state: TraceState, event: SubagentProgressEvent): TraceState
  onUsageUpdated?(state: TraceState, event: UsageUpdatedEvent): TraceState
  onStateUpdated?(state: TraceState, event: StateUpdatedEvent): TraceState
}

// ── 辅助函数（从 adapter 提取，供中间件复用） ──

function upsertNode(nodes: TraceNode[], node: TraceNode): TraceNode[] {
  const idx = nodes.findIndex(n => n.id === node.id)
  if (idx < 0) return [...nodes, node]
  const next = nodes.slice()
  next[idx] = { ...next[idx], ...node }
  return next
}

function upsertEdge(edges: TraceEdge[], edge: TraceEdge): TraceEdge[] {
  return edges.some(e => e.id === edge.id) ? edges : [...edges, edge]
}

function currentRunNodeId(state: TraceState): string | null {
  return state.runId ? `run:${state.sessionId}:${state.runId}` : null
}

function appendChildToNode(nodes: TraceNode[], nodeId: string, item: TraceTimelineItem): TraceNode[] {
  return nodes.map(n => n.id === nodeId ? { ...n, children: [...(n.children ?? []), item] } : n)
}

function firstOpenToolId(state: TraceState, toolName?: string): string | null {
  const entries = Object.entries(state.openToolNodeIds)
  if (!entries.length) return null
  if (!toolName) return entries[0][0]
  return entries.find(([id]) => id.includes(`:${toolName}:`))?.[0] ?? entries[0][0]
}

// ── 1. Run 生命周期中间件 ──

export const runLifecycleMiddleware: TraceMiddleware = {
  onReplyStart(state, event) {
    const runId = event.runId || `local-${state.sequence + 1}`
    const ingressId = `ingress:${state.sessionId}`
    const runNodeId = `run:${state.sessionId}:${runId}`
    const startedAt = event.timestamp
    const ingress: TraceNode = {
      id: ingressId,
      kind: 'ingress',
      label: '外部消息',
      detail: state.sessionId,
      status: 'ok',
      startedAt,
      evidence: 'L1',
      ref: { sessionId: state.sessionId },
    }
    const runNode: TraceNode = {
      id: runNodeId,
      kind: 'workflow',
      label: `Run ${runId}`,
      detail: 'Workflow DAG',
      status: 'running',
      startedAt,
      evidence: 'L1',
      children: [],
      ref: { sessionId: state.sessionId, runId },
    }
    const edge: TraceEdge = {
      id: `edge:${ingressId}->${runNodeId}`,
      from: ingressId,
      to: runNodeId,
      kind: 'spawn',
      evidence: 'L1',
    }
    return {
      ...state,
      runId,
      nodes: upsertNode(upsertNode(state.nodes, ingress), runNode),
      edges: upsertEdge(state.edges, edge),
      focusedNodeId: runNodeId,
      openToolNodeIds: {},
      activeSkillNodeId: null,
      openSubagentNodeIds: {},
      outputText: '',
      usage: undefined,
      sequence: state.sequence + 1,
    }
  },

  onReplyEnd(state, event) {
    const runId = currentRunNodeId(state)
    if (!runId) return state
    const endedAt = event.timestamp
    const nodes = state.nodes.map(n => n.id === runId
      ? { ...n, status: event.status, endedAt, durationMs: Math.max(0, endedAt - n.startedAt), detail: event.error || n.detail }
      : n)
    return {
      ...state,
      nodes,
      usage: event.usage ?? state.usage,
      focusedNodeId: runId,
      openToolNodeIds: {},
      activeSkillNodeId: null,
      openSubagentNodeIds: {},
    }
  },
}

// ── 2. Tool 追踪中间件 ──

export const toolTraceMiddleware: TraceMiddleware = {
  onToolCallStart(state, event) {
    const startedAt = event.timestamp
    const toolName = event.toolName
    const seq = state.sequence + 1
    const toolId = `tool:${state.sessionId}:${toolName}:${seq}`
    const parentId = state.activeSkillNodeId ?? currentRunNodeId(state)
    const node: TraceNode = {
      id: toolId,
      kind: 'tool',
      label: toolName,
      detail: event.preview,
      status: 'running',
      startedAt,
      evidence: 'L1',
      ref: { sessionId: state.sessionId, runId: state.runId ?? undefined, toolCallId: toolId },
    }
    let nodes = upsertNode(state.nodes, node)
    let edges = state.edges
    if (parentId) {
      edges = upsertEdge(edges, { id: `edge:${parentId}->${toolId}`, from: parentId, to: toolId, kind: 'call', evidence: 'L1' })
      if (state.activeSkillNodeId) {
        nodes = appendChildToNode(nodes, state.activeSkillNodeId, {
          id: `timeline:${toolId}`,
          kind: 'tool',
          ts: startedAt,
          toolName,
          toolArgs: event.preview,
          status: 'running',
          attribution: 'inferred',
        })
      }
    }
    return { ...state, nodes, edges, openToolNodeIds: { ...state.openToolNodeIds, [toolId]: toolId }, sequence: seq, focusedNodeId: toolId }
  },

  onToolCallEnd(state, event) {
    const endedAt = event.timestamp
    const toolId = firstOpenToolId(state, event.toolName)
    if (!toolId) return state
    const existing = state.nodes.find(n => n.id === toolId)
    if (!existing) return state
    const status: SpanStatus = event.error ? 'error' : 'ok'
    const durationMs = Math.max(0, endedAt - existing.startedAt)
    const nodes = state.nodes.map(n => {
      if (n.id === toolId) return { ...n, status, endedAt, durationMs, detail: event.output || event.error || n.detail }
      if (n.id === state.activeSkillNodeId) {
        return {
          ...n,
          children: (n.children ?? []).map(item => item.id === `timeline:${toolId}`
            ? { ...item, status, durationMs, toolResult: event.output || event.error }
            : item),
        }
      }
      return n
    })
    const openToolNodeIds = { ...state.openToolNodeIds }
    delete openToolNodeIds[toolId]
    return { ...state, nodes, openToolNodeIds, focusedNodeId: toolId }
  },
}

// ── 3. 思维链追踪中间件 ──

export const thinkingTraceMiddleware: TraceMiddleware = {
  onThinkingDelta(state, event) {
    const parentId = state.activeSkillNodeId ?? currentRunNodeId(state)
    if (!parentId || !event.text) return state
    const item: TraceTimelineItem = {
      id: `thinking:${state.sessionId}:${state.sequence + 1}`,
      kind: 'thinking',
      ts: event.timestamp,
      text: event.text,
      attribution: state.activeSkillNodeId ? 'inferred' : 'accurate',
    }
    return { ...state, nodes: appendChildToNode(state.nodes, parentId, item), sequence: state.sequence + 1 }
  },

  onTextBlockDelta(state, event) {
    return { ...state, outputText: state.outputText + event.text }
  },
}

// ── 4. Subagent 追踪中间件 ──

export const subagentTraceMiddleware: TraceMiddleware = {
  onSubagentStart(state, event) {
    return upsertSubagentNode(state, event.label, 'running', event.timestamp, event.preview)
  },

  onSubagentEnd(state, event) {
    return upsertSubagentNode(state, event.label, event.status, event.timestamp, undefined)
  },

  onSubagentProgress(state, event) {
    let next = upsertSubagentNode(state, event.label, 'running', event.timestamp, event.preview)
    // Phase 3: 如果携带 tasksContext，产生 STATE_UPDATED
    if (event.tasksContext) {
      next = stateChangeMiddleware.onStateUpdated?.(next, {
        type: 'STATE_UPDATED',
        id: `state-${next.sequence}`,
        created_at: new Date(event.timestamp).toISOString(),
        session_id: event.session_id,
        timestamp: event.timestamp,
        tasksContext: event.tasksContext,
      }) ?? next
    }
    return next
  },
}

function upsertSubagentNode(
  state: TraceState,
  label: string,
  status: SpanStatus,
  eventTs: number,
  preview?: string,
): TraceState {
  const existingId = state.openSubagentNodeIds[label]
  const nodeId = existingId ?? `agent:${state.sessionId}:${label}:${state.sequence + 1}`
  const parentId = currentRunNodeId(state)
  const existing = state.nodes.find(n => n.id === nodeId)
  const node: TraceNode = {
    id: nodeId,
    kind: 'agent',
    label,
    detail: preview ?? existing?.detail,
    status,
    startedAt: existing?.startedAt ?? eventTs,
    endedAt: status === 'ok' ? eventTs : existing?.endedAt,
    durationMs: status === 'ok' && existing ? Math.max(0, eventTs - existing.startedAt) : existing?.durationMs,
    evidence: 'L1',
    ref: { sessionId: state.sessionId, runId: state.runId ?? undefined },
  }
  let edges = state.edges
  if (parentId && !existing) {
    edges = upsertEdge(edges, { id: `edge:${parentId}->${nodeId}`, from: parentId, to: nodeId, kind: 'delegate', evidence: 'L1' })
  }
  const openSubagentNodeIds = { ...state.openSubagentNodeIds }
  if (status === 'ok') delete openSubagentNodeIds[label]
  else openSubagentNodeIds[label] = nodeId
  return {
    ...state,
    nodes: upsertNode(state.nodes, node),
    edges,
    openSubagentNodeIds,
    focusedNodeId: nodeId,
    sequence: existing ? state.sequence : state.sequence + 1,
  }
}

// ── 5. Usage 中间件 ──

export const usageMiddleware: TraceMiddleware = {
  onUsageUpdated(state, event) {
    return { ...state, usage: event.usage ?? state.usage }
  },
}

// ── 6. 状态变更中间件（Phase 3） ──

export const stateChangeMiddleware: TraceMiddleware = {
  onStateUpdated(state, event) {
    if (!event.tasksContext && !event.permissionContext) return state
    const taskIdCount = event.tasksContext?.tasks.length ?? 0
    const nodeId = `state:${state.sessionId}:${state.sequence + 1}`
    const node: TraceNode = {
      id: nodeId,
      kind: 'memory', // 复用 memory 类型；Phase 3 扩展为 'state'
      label: 'State Update',
      detail: `${taskIdCount} tasks`,
      status: 'ok',
      startedAt: event.timestamp,
      evidence: 'L1',
      ref: { sessionId: state.sessionId, runId: state.runId ?? undefined },
      children: event.tasksContext?.tasks.map((t, i) => ({
        id: `state-task:${nodeId}:${i}`,
        kind: 'memory' as const,
        ts: event.timestamp,
        text: `${t.title} [${t.status}]`,
        attribution: 'accurate' as const,
      })),
    }
    const parentId = currentRunNodeId(state)
    let edges = state.edges
    if (parentId) {
      edges = upsertEdge(edges, { id: `edge:${parentId}->${nodeId}`, from: parentId, to: nodeId, kind: 'call', evidence: 'L1' })
    }
    return { ...state, nodes: upsertNode(state.nodes, node), edges, sequence: state.sequence + 1 }
  },
}

// ── 默认中间件链 ──

export const defaultMiddlewares: TraceMiddleware[] = [
  runLifecycleMiddleware,
  toolTraceMiddleware,
  thinkingTraceMiddleware,
  subagentTraceMiddleware,
  stateChangeMiddleware,
  usageMiddleware,
]

// ── 事件类型 → 钩子名映射 ──

const HOOK_MAP: Record<string, keyof TraceMiddleware> = {
  REPLY_START: 'onReplyStart',
  REPLY_END: 'onReplyEnd',
  TOOL_CALL_START: 'onToolCallStart',
  TOOL_CALL_END: 'onToolCallEnd',
  THINKING_BLOCK_DELTA: 'onThinkingDelta',
  TEXT_BLOCK_DELTA: 'onTextBlockDelta',
  SUBAGENT_START: 'onSubagentStart',
  SUBAGENT_END: 'onSubagentEnd',
  SUBAGENT_PROGRESS: 'onSubagentProgress',
  USAGE_UPDATED: 'onUsageUpdated',
  STATE_UPDATED: 'onStateUpdated',
}

/**
 * 遍历中间件链处理事件。
 * 每个中间件有机会处理事件，reduce 保证顺序执行。
 */
export function applyTraceEvent(
  state: TraceState,
  event: TraceEvent,
  middlewares: TraceMiddleware[] = defaultMiddlewares,
): TraceState {
  const hookName = HOOK_MAP[event.type]
  if (!hookName) return state
  return middlewares.reduce((s, mw) => {
    const hook = mw[hookName]
    return hook ? hook(s, event as any) : s
  }, state)
}
