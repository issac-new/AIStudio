import type { RunEvent } from '@/api/studio/chat'
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
  /** kanban 任务状态（running/done/blocked…，仅任务级节点 ingress/workflow 填充） */
  taskStatus?: string
  /** kanban board slug（任务所属看板，用于显示 kanban id） */
  taskBoard?: string
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
export interface TraceMeta {
  started_at?: number
  ended_at?: number
  duration_ms?: number
  model?: string
  provider?: string
  outcome?: string
  /** L2 llm_span 用量汇总（hermes-agent 0.21.1 usage anchor 语义：跨运行累计） */
  usage?: { input_tokens: number; output_tokens: number; api_calls: number }
}

export async function fetchLayer2Trace(sessionId: string, profile?: string | null): Promise<{
  nodes: TraceNode[]
  edges: TraceEdge[]
  meta?: TraceMeta
} | null> {
  try {
    const params = new URLSearchParams()
    if (profile) params.set('profile', profile)
    const query = params.toString()
    const data = await request<{ nodes: TraceNode[]; edges: TraceEdge[]; meta?: TraceMeta }>(
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

  // delegate 边：父任务会话 ingress → 子任务会话 ingress（匹配E，基于匹配A）
  // 方向 父→子：与 spawn/call 一致，体现“父任务派生子任务”的流转时序（父先、子后）。
  for (const rel of taskRelations) {
    const childSessions = taskToSessions.get(rel.child) ?? []
    const parentSessions = taskToSessions.get(rel.parent) ?? []
    for (const csid of childSessions) {
      for (const psid of parentSessions) {
        if (csid === psid) continue
        const fromId = `ingress:${psid}`
        const toId = `ingress:${csid}`
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
/** 将历史消息转换为统一的 RunEvent 序列；进度与异步调度由调用方负责。 */
export function replayMessageEvents(messages: any[], sid: string): RunEvent[] {
  const events: RunEvent[] = []
  let processed = 0
  for (const msg of messages) {
    const ts = msg.timestamp * 1000
    const role = msg.role || msg.display_role
    if (role === 'user' && processed === 0) {
      events.push({
        event: 'run.started', session_id: sid, run_id: `replay-${sid}`, timestamp: ts,
      } as any)
    }
    if (role === 'tool' || msg.tool_name) {
      events.push({
        event: 'tool.started', session_id: sid, run_id: `replay-${sid}`,
        tool: msg.tool_name || 'tool', name: msg.tool_name, preview: '', timestamp: ts - 1,
      } as any)
      events.push({
        event: 'tool.completed', session_id: sid, run_id: `replay-${sid}`,
        tool: msg.tool_name || 'tool', name: msg.tool_name,
        output: typeof msg.content === 'string' ? msg.content.slice(0, 200) : '', timestamp: ts,
      } as any)
    }
    const reasoning = msg.reasoning || msg.reasoning_content
    if (reasoning && typeof reasoning === 'string' && reasoning.trim()) {
      events.push({
        event: 'reasoning.delta', session_id: sid, run_id: `replay-${sid}`, text: reasoning, timestamp: ts,
      } as any)
    }
    if (role === 'assistant' && msg.content) {
      events.push({
        event: 'message.delta', session_id: sid, run_id: `replay-${sid}`, delta: msg.content, timestamp: ts,
      } as any)
    }
    processed++
  }
  events.push({
    event: 'run.completed', session_id: sid, run_id: `replay-${sid}`,
    timestamp: messages.length > 0 ? messages[messages.length - 1].timestamp * 1000 : Date.now(),
  } as any)
  return events
}

export function replayMessagesIntoState(state: TraceState, messages: any[], sid: string): TraceState {
  return replayMessageEvents(messages, sid).reduce((s, event) => applyRunEvent(s, event), state)
}
