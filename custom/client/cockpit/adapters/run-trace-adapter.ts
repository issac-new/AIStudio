import type { RunEvent } from '@/api/hermes/chat'
import { request } from '@/api/client'
import { normalizeRunEvent, type TraceEvent } from './trace-event'
import { applyTraceEvent, type TraceMiddleware, defaultMiddlewares } from './trace-middlewares'

export type EvidenceTier = 'L1' | 'L2' | 'L3'
export type TraceNodeKind = 'ingress' | 'workflow' | 'agent' | 'skill' | 'tool' | 'memory' | 'service' | 'peer' | 'approval'
export type SpanStatus = 'running' | 'ok' | 'error' | 'cancelled'
export type EdgeKind = 'spawn' | 'call' | 'recall' | 'converge' | 'delegate'
export type TraceTimelineItemKind = 'thinking' | 'tool' | 'memory' | 'message'
export type TraceAttribution = 'inferred' | 'accurate'

export interface TraceTimelineItem {
  id: string
  kind: TraceTimelineItemKind
  ts: number
  text?: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  durationMs?: number
  status?: SpanStatus
  attribution: TraceAttribution
}

export interface TraceNode {
  id: string
  kind: TraceNodeKind
  label: string
  detail?: string
  status: SpanStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  evidence: EvidenceTier
  children?: TraceTimelineItem[]
  ref?: {
    sessionId?: string
    runId?: string
    toolCallId?: string
    workflowNodeId?: string
  }
  /** 聚类键：节点所属的 kanban 任务 ID（用于力导向图谱按任务聚类） */
  cluster?: string
  /** 节点所属 agent profile（orchestrator/worker-coder/worker-researcher，用于着色） */
  profile?: string
}

export interface TraceEdge {
  id: string
  from: string
  to: string
  kind: EdgeKind
  evidence: EvidenceTier
}

export interface TraceState {
  sessionId: string
  runId: string | null
  nodes: TraceNode[]
  edges: TraceEdge[]
  focusedNodeId: string | null
  openToolNodeIds: Record<string, string>
  activeSkillNodeId: string | null
  /** 活跃 subagent 标签 → 节点 id,用于 .progress/.complete 闭合而非新建 */
  openSubagentNodeIds: Record<string, string>
  sequence: number
  outputText: string
  usage?: RunEvent['usage']
  /** 关联会话 ID 集合（含主会话）；用于多会话聚合时放宽 run_id/session_id 过滤 */
  relatedSessionIds?: Set<string>
}

function ts(event: RunEvent): number {
  return typeof event.timestamp === 'number' ? event.timestamp : Date.now()
}

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

function isActiveRunEvent(state: TraceState, event: RunEvent): boolean {
  // 原：仅允许当前活跃 run_id 的事件
  // 新：如果事件来自关联会话（relatedSessionIds），也放行——支持多会话聚合
  if (!event.run_id || !state.runId || event.run_id === state.runId) return true
  if (state.relatedSessionIds && event.session_id && state.relatedSessionIds.has(event.session_id)) return true
  return false
}

export function createTraceState(sessionId: string, relatedSessionIds?: Set<string>): TraceState {
  return {
    sessionId,
    runId: null,
    nodes: [],
    edges: [],
    focusedNodeId: null,
    openToolNodeIds: {},
    activeSkillNodeId: null,
    openSubagentNodeIds: {},
    sequence: 0,
    outputText: '',
    relatedSessionIds,
  }
}

export function getFocusedNode(state: TraceState): TraceNode | null {
  return state.nodes.find(n => n.id === state.focusedNodeId) ?? null
}

function handleRunStarted(state: TraceState, event: RunEvent): TraceState {
  const runId = event.run_id || `local-${state.sequence + 1}`
  const ingressId = `ingress:${state.sessionId}`
  const runNodeId = `run:${state.sessionId}:${runId}`
  const startedAt = ts(event)
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
    // 新 run 开始时清掉上一 run 的瞬时状态,避免 skill/tool/subagent 归因泄漏。
    openToolNodeIds: {},
    activeSkillNodeId: null,
    openSubagentNodeIds: {},
    outputText: '',
    usage: undefined,
    sequence: state.sequence + 1,
  }
}

function handleToolStarted(state: TraceState, event: RunEvent): TraceState {
  const startedAt = ts(event)
  const toolName = event.tool || event.name || 'tool'
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
}

function handleToolCompleted(state: TraceState, event: RunEvent): TraceState {
  const endedAt = ts(event)
  const toolName = event.tool || event.name
  const toolId = firstOpenToolId(state, toolName)
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
}

function handleReasoning(state: TraceState, event: RunEvent): TraceState {
  const parentId = state.activeSkillNodeId ?? currentRunNodeId(state)
  const text = event.text || event.delta || ''
  if (!parentId || !text) return state
  const item: TraceTimelineItem = {
    id: `thinking:${state.sessionId}:${state.sequence + 1}`,
    kind: 'thinking',
    ts: ts(event),
    text,
    attribution: state.activeSkillNodeId ? 'inferred' : 'accurate',
  }
  return { ...state, nodes: appendChildToNode(state.nodes, parentId, item), sequence: state.sequence + 1 }
}

function handleMessageDelta(state: TraceState, event: RunEvent): TraceState {
  return { ...state, outputText: state.outputText + (event.delta || event.text || '') }
}

function handleRunFinished(state: TraceState, event: RunEvent, status: SpanStatus): TraceState {
  const runId = currentRunNodeId(state)
  if (!runId) return state
  const endedAt = ts(event)
  const nodes = state.nodes.map(n => n.id === runId
    ? { ...n, status, endedAt, durationMs: Math.max(0, endedAt - n.startedAt), detail: event.error || n.detail }
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
}

function handleSubagent(state: TraceState, event: RunEvent): TraceState {
  const eventTs = ts(event)
  const label = event.name || event.tool || event.preview || event.event
  const existingId = state.openSubagentNodeIds[label]
  const nodeId = existingId ?? `agent:${state.sessionId}:${label}:${state.sequence + 1}`
  const parentId = currentRunNodeId(state)
  const status: SpanStatus = event.event.endsWith('.complete') ? 'ok' : 'running'
  const existing = state.nodes.find(n => n.id === nodeId)
  const node: TraceNode = {
    id: nodeId,
    kind: 'agent',
    label,
    detail: event.preview ?? existing?.detail,
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

export function activateSkill(state: TraceState, input: { skillName: string; ts: number; detail?: string }): TraceState {
  const skillId = `skill:${state.sessionId}:${input.skillName}:${state.sequence + 1}`
  const parentId = currentRunNodeId(state)
  const node: TraceNode = {
    id: skillId,
    kind: 'skill',
    label: input.skillName,
    detail: input.detail,
    status: 'running',
    startedAt: input.ts,
    evidence: 'L1',
    children: [],
    ref: { sessionId: state.sessionId, runId: state.runId ?? undefined },
  }
  let nodes = upsertNode(state.nodes, node)
  let edges = state.edges
  if (parentId) {
    edges = upsertEdge(edges, { id: `edge:${parentId}->${skillId}`, from: parentId, to: skillId, kind: 'call', evidence: 'L1' })
  }
  return { ...state, nodes, edges, activeSkillNodeId: skillId, focusedNodeId: skillId, sequence: state.sequence + 1 }
}

/**
 * 处理一个 RunEvent（向后兼容入口）。
 *
 * 内部先 normalize 为强类型 TraceEvent，再通过中间件链处理。
 * 这让旧的 useRunTrace 调用无需改动即可获得中间件架构的全部能力。
 */
export function applyRunEvent(state: TraceState, event: RunEvent, middlewares: TraceMiddleware[] = defaultMiddlewares): TraceState {
  // run.started 用于初始化/切换 run，需放行同会话的事件以支持多 run 切换；
  // 但在多会话聚合视图下，需过滤来自无关会话的 run.started，避免污染：
  //  - 主会话（state.sessionId）的 run.started 始终放行；
  //  - 关联会话（relatedSessionIds）的 run.started 放行；
  //  - 其余会话的 run.started 丢弃。
  if (event.event === 'run.started') {
    const sid = event.session_id
    const isPrimary = !sid || sid === state.sessionId
    const isRelated = !!(state.relatedSessionIds && sid && state.relatedSessionIds.has(sid))
    if (!isPrimary && !isRelated) return state
  } else if (!isActiveRunEvent(state, event)) {
    return state
  }
  const traceEvent = normalizeRunEvent(event)
  return applyTraceEvent(state, traceEvent, middlewares)
}

/**
 * 处理一个已归一化的 TraceEvent（新入口，供直接消费 TraceEvent 的场景）。
 */
export function applyTraceEventToState(state: TraceState, event: TraceEvent, middlewares: TraceMiddleware[] = defaultMiddlewares): TraceState {
  return applyTraceEvent(state, event, middlewares)
}

/**
 * Fetch Layer 2 trace data from backend API.
 * Returns null if L2 data is not available (plugin not installed or file not found).
 * Uses request helper for proper auth headers and base URL handling.
 */
export async function fetchLayer2Trace(sessionId: string, profile?: string | null): Promise<{
  nodes: TraceNode[]
  edges: TraceEdge[]
  meta?: {
    started_at?: number
    ended_at?: number
    duration_ms?: number
    model?: string
    provider?: string
    outcome?: string
  }
} | null> {
  try {
    const params = new URLSearchParams()
    if (profile) params.set('profile', profile)
    const query = params.toString()
    const data = await request<{ nodes: TraceNode[]; edges: TraceEdge[]; meta?: TraceNode['meta'] }>(
      `/api/hermes/sessions/${encodeURIComponent(sessionId)}/trace${query ? `?${query}` : ''}`
    )
    if (!data.nodes || !Array.isArray(data.nodes)) return null
    return {
      nodes: data.nodes as TraceNode[],
      edges: (data.edges || []) as TraceEdge[],
      meta: data.meta,
    }
  } catch {
    return null
  }
}

/**
 * Merge L2 trace data into existing L1 state.
 * Upgrades evidence tier from L1 to L2 for matching nodes.
 */
export function mergeLayer2Data(state: TraceState, l2Data: { nodes: TraceNode[]; edges: TraceEdge[] }): TraceState {
  const l2NodeIds = new Set(l2Data.nodes.map(n => n.id))
  const l2EdgeIds = new Set(l2Data.edges.map(e => e.id))

  // Keep L1 nodes that don't have L2 equivalents, upgrade matching ones
  const mergedNodes = [
    ...state.nodes.filter(n => !l2NodeIds.has(n.id)),
    ...l2Data.nodes,
  ]

  // Same for edges
  const mergedEdges = [
    ...state.edges.filter(e => !l2EdgeIds.has(e.id)),
    ...l2Data.edges,
  ]

  return {
    ...state,
    nodes: mergedNodes,
    edges: mergedEdges,
  }
}

/**
 * 合并多个 TraceState 到主 state（用于多会话聚合视图）。
 *
 * - nodes/edges 按 ID 去重合并
 * - 为每个关联会话的 ingress 节点添加一条 `delegate` 边连到主会话的 ingress 节点（表示任务流转关系）
 * - 保留主会话的 sessionId/runId/focusedNodeId
 */
export function mergeTraceStates(main: TraceState, others: TraceState[]): TraceState {
  if (others.length === 0) return main

  const nodeIds = new Set(main.nodes.map(n => n.id))
  const edgeIds = new Set(main.edges.map(e => e.id))
  let mergedNodes = [...main.nodes]
  let mergedEdges = [...main.edges]

  for (const other of others) {
    // 合并去重 nodes
    for (const n of other.nodes) {
      if (!nodeIds.has(n.id)) {
        mergedNodes.push(n)
        nodeIds.add(n.id)
      }
    }
    // 合并去重 edges
    for (const e of other.edges) {
      if (!edgeIds.has(e.id)) {
        mergedEdges.push(e)
        edgeIds.add(e.id)
      }
    }
    // 跨会话 delegate/spawn 边不再在此处构建——mergeTraceStates 无法区分任务树父子关系，
    // 旧逻辑"所有关联会话 ingress → 主会话 ingress"不反映真实协作关系。
    // 跨会话边改由 buildCrossSessionEdges 基于任务树关系（匹配E）显式构建。
  }

  return {
    ...main,
    nodes: mergedNodes,
    edges: mergedEdges,
  }
}

/**
 * 基于任务树父子关系（匹配A，100%确定）与 会话↔任务映射（匹配B+C，100%确定）
 * 构建跨会话协作边（匹配E，高置信度推导）。
 *
 * - delegate 边：子任务 T_c 的 worker 会话 ingress → 父任务 T_p 的 worker/creator 会话 ingress。
 *   表达"子任务会话由父任务会话协作派生"。方向：子→父（子任务委托自父任务链）。
 * - spawn 边：任务 T 的创建者会话（task.session_id）run 节点 → T 的 worker 会话 ingress。
 *   表达"创建者会话通过 kanban_create 派生 worker 会话"。
 *
 * 仅当两端会话都已聚合（节点存在）时才构建边，避免悬挂边。
 */
export function buildCrossSessionEdges(
  state: TraceState,
  taskRelations: Array<{ parent: string; child: string }>,
  sessionTaskMap: Map<string, { taskId: string; role: 'primary' | 'worker' | 'creator' }>,
): TraceEdge[] {
  const edges: TraceEdge[] = []
  const existingEdgeIds = new Set(state.edges.map(e => e.id))
  // 当前 state 中存在的 ingress/run 节点集合，用于判断会话是否已聚合
  const ingressNodes = new Set(state.nodes.filter(n => n.kind === 'ingress').map(n => n.id))
  const runNodesBySession = new Map<string, string>()
  for (const n of state.nodes) {
    if (n.kind === 'workflow' && n.ref?.sessionId) {
      runNodesBySession.set(n.ref.sessionId, n.id)
    }
  }

  // 任务 → 会话集合（worker + creator + primary）
  const taskToSessions = new Map<string, string[]>()
  for (const [sid, info] of sessionTaskMap) {
    const arr = taskToSessions.get(info.taskId) ?? []
    arr.push(sid)
    taskToSessions.set(info.taskId, arr)
  }

  // delegate 边：子任务会话 ingress → 父任务会话 ingress（匹配E，基于匹配A）
  for (const rel of taskRelations) {
    const childSessions = taskToSessions.get(rel.child) ?? []
    const parentSessions = taskToSessions.get(rel.parent) ?? []
    for (const csid of childSessions) {
      for (const psid of parentSessions) {
        if (csid === psid) continue
        const fromId = `ingress:${csid}`
        const toId = `ingress:${psid}`
        if (!ingressNodes.has(fromId) || !ingressNodes.has(toId)) continue
        const edgeId = `edge:${fromId}->${toId}:delegate`
        if (existingEdgeIds.has(edgeId)) continue
        edges.push({ id: edgeId, from: fromId, to: toId, kind: 'delegate', evidence: 'L1' })
        existingEdgeIds.add(edgeId)
      }
    }
  }

  // spawn 边：创建者会话 run 节点 → worker 会话 ingress（匹配E，基于匹配B）
  for (const [sid, info] of sessionTaskMap) {
    if (info.role !== 'creator') continue
    const creatorRunId = runNodesBySession.get(sid)
    if (!creatorRunId) continue
    const workerSessions = (taskToSessions.get(info.taskId) ?? []).filter(
      wsid => wsid !== sid && sessionTaskMap.get(wsid)?.role === 'worker',
    )
    for (const wsid of workerSessions) {
      const toId = `ingress:${wsid}`
      if (!ingressNodes.has(toId)) continue
      const edgeId = `edge:${creatorRunId}->${toId}:spawn`
      if (existingEdgeIds.has(edgeId)) continue
      edges.push({ id: edgeId, from: creatorRunId, to: toId, kind: 'spawn', evidence: 'L1' })
      existingEdgeIds.add(edgeId)
    }
  }

  return edges
}

/**
 * 将历史消息回放为 trace（纯函数版本，供 useRunTrace.processMessages 与
 * useRunTraceOverview 复用，避免逻辑重复）。
 *
 * 合成事件序列与原 processMessages 一致：
 *   首条 user 消息 → run.started（建立 ingress+run 节点）
 *   tool 消息     → tool.started + tool.completed
 *   reasoning     → reasoning.delta
 *   assistant 文本 → message.delta
 *   末尾          → run.completed（闭合 workflow 节点）
 *
 * @param state 初始 TraceState（通常由 createTraceState 创建，含 run.started）
 * @param messages 历史消息（timestamp 为秒级）
 * @param sid 会话 ID
 * @returns 更新后的 TraceState
 */
export function replayMessagesIntoState(state: TraceState, messages: any[], sid: string): TraceState {
  let s = state
  let processed = 0
  const total = messages.length

  for (const msg of messages) {
    const ts = msg.timestamp * 1000 // messages use seconds
    const role = msg.role || msg.display_role

    // Synthesize run.started for the first user message
    if (role === 'user' && processed === 0) {
      const startEvent: RunEvent = {
        event: 'run.started',
        session_id: sid,
        run_id: `replay-${sid}`,
        timestamp: ts,
      } as any
      s = applyRunEvent(s, startEvent)
    }

    // Tool messages → tool.completed events
    if (role === 'tool' || msg.tool_name) {
      const toolEvent: RunEvent = {
        event: 'tool.completed',
        session_id: sid,
        run_id: `replay-${sid}`,
        tool: msg.tool_name || 'tool',
        name: msg.tool_name,
        output: typeof msg.content === 'string' ? msg.content.slice(0, 200) : '',
        timestamp: ts,
      } as any
      // First emit tool.started for node creation
      const startEvent: RunEvent = {
        event: 'tool.started',
        session_id: sid,
        run_id: `replay-${sid}`,
        tool: msg.tool_name || 'tool',
        name: msg.tool_name,
        preview: '',
        timestamp: ts - 1,
      } as any
      s = applyRunEvent(s, startEvent)
      s = applyRunEvent(s, toolEvent)
    }

    // Reasoning content → reasoning.delta events
    const reasoning = msg.reasoning || msg.reasoning_content
    if (reasoning && typeof reasoning === 'string' && reasoning.trim()) {
      const reasoningEvent: RunEvent = {
        event: 'reasoning.delta',
        session_id: sid,
        run_id: `replay-${sid}`,
        text: reasoning,
        timestamp: ts,
      } as any
      s = applyRunEvent(s, reasoningEvent)
    }

    // Assistant text → message.delta
    if (role === 'assistant' && msg.content) {
      const msgEvent: RunEvent = {
        event: 'message.delta',
        session_id: sid,
        run_id: `replay-${sid}`,
        delta: msg.content,
        timestamp: ts,
      } as any
      s = applyRunEvent(s, msgEvent)
    }

    processed++
  }

  // Emit run.completed to close the workflow node
  const endEvent: RunEvent = {
    event: 'run.completed',
    session_id: sid,
    run_id: `replay-${sid}`,
    timestamp: messages.length > 0 ? messages[messages.length - 1].timestamp * 1000 : Date.now(),
  } as any
  s = applyRunEvent(s, endEvent)

  return s
}
