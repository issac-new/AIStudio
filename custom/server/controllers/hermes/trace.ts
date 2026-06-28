/**
 * Trace API controller for RunTraceView Layer 3.
 * 
 * Reads JSONL trace files from ~/.hermes/traces/ and returns
 * TraceNode[] + TraceEdge[] for the frontend to consume.
 */
import Router from '@koa/router'
import { readFile, access } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { constants } from 'fs'

const router = new Router()

// Default trace directory
const TRACE_DIR = join(homedir(), '.hermes', 'traces')

// Types matching frontend adapter
type EvidenceTier = 'L1' | 'L2' | 'L3'
type TraceNodeKind = 'ingress' | 'workflow' | 'agent' | 'skill' | 'tool' | 'memory' | 'service' | 'peer' | 'approval'
type SpanStatus = 'running' | 'ok' | 'error' | 'cancelled'

interface TraceNode {
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
}

interface TraceEdge {
  id: string
  from: string
  to: string
  kind: 'call' | 'dispatch' | 'reply' | 'delegate'
  evidence: EvidenceTier
}

interface TraceTimelineItem {
  id: string
  kind: 'thinking' | 'tool' | 'memory'
  ts: number
  text?: string
  toolName?: string
  toolArgs?: any
  toolResult?: any
  durationMs?: number
  attribution: 'inferred' | 'accurate'
}

interface JSONLHeader {
  type: 'header'
  version: string
  session_id: string
  task_id?: string
  started_at: number
  model?: string
  provider?: string
  source?: string
}

interface JSONLChunk {
  type: 'chunk'
  kind: 'llm_span' | 'tool_span' | 'subagent_span'
  phase?: 'pre' | 'post' | 'start' | 'stop'
  session_id: string
  api_request_id?: string
  tool_call_id?: string
  subagent_label?: string
  tool_name?: string
  model?: string
  provider?: string
  started_at?: number
  ended_at?: number
  duration_ms?: number
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  finish_reason?: string
  args?: any
  result?: any
  status?: string
  error_type?: string
  error_message?: string
  turn_id?: string
  task_index?: number
  task_count?: number
  input_tokens?: number
  output_tokens?: number
  api_calls?: number
  ts?: number
}

interface JSONLTrailer {
  type: 'trailer'
  session_id: string
  ended_at: number
  duration_ms: number
  outcome?: string
  error?: string
  summary?: string
}

type JSONLLine = JSONLHeader | JSONLChunk | JSONLTrailer

/**
 * Parse JSONL file and build trace state.
 */
function parseJSONL(lines: string[]): { header: JSONLHeader; chunks: JSONLChunk[]; trailer?: JSONLTrailer } {
  const header: JSONLHeader = { type: 'header', version: '1', session_id: '', started_at: 0 }
  const chunks: JSONLChunk[] = []
  let trailer: JSONLTrailer | undefined

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line) as JSONLLine
      if (obj.type === 'header') {
        Object.assign(header, obj)
      } else if (obj.type === 'chunk') {
        chunks.push(obj)
      } else if (obj.type === 'trailer') {
        trailer = obj
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { header, chunks, trailer }
}

/**
 * Build TraceNode[] + TraceEdge[] from JSONL data.
 */
function buildTraceGraph(header: JSONLHeader, chunks: JSONLChunk[], trailer?: JSONLTrailer): {
  nodes: TraceNode[]
  edges: TraceEdge[]
} {
  const nodes: TraceNode[] = []
  const edges: TraceEdge[] = []
  const seenIds = new Set<string>()

  // Root workflow node
  const workflowId = `workflow:${header.session_id}`
  if (!seenIds.has(workflowId)) {
    nodes.push({
      id: workflowId,
      kind: 'workflow',
      label: header.model || 'Run',
      detail: header.provider,
      status: trailer?.error ? 'error' : (trailer ? 'ok' : 'running'),
      startedAt: header.started_at,
      endedAt: trailer?.ended_at,
      durationMs: trailer?.duration_ms,
      evidence: 'L2',
    })
    seenIds.add(workflowId)
  }

  // Build LLM span nodes (merge pre/post by api_request_id)
  const llmSpans = new Map<string, { pre?: JSONLChunk; post?: JSONLChunk }>()
  for (const chunk of chunks) {
    if (chunk.kind === 'llm_span' && chunk.api_request_id) {
      const span = llmSpans.get(chunk.api_request_id) || {}
      if (chunk.phase === 'pre') span.pre = chunk
      else if (chunk.phase === 'post') span.post = chunk
      llmSpans.set(chunk.api_request_id, span)
    }
  }

  for (const [apiRequestId, span] of llmSpans) {
    const pre = span.pre
    const post = span.post
    const startedAt = pre?.started_at || header.started_at
    const endedAt = post?.ended_at
    const durationMs = post?.duration_ms || (endedAt && startedAt ? Math.round((endedAt - startedAt) * 1000) : undefined)
    const usage = post?.usage

    const nodeId = `llm:${header.session_id}:${apiRequestId}`
    if (!seenIds.has(nodeId)) {
      nodes.push({
        id: nodeId,
        kind: 'tool', // LLM calls are technically tool invocations in the trace
        label: `${pre?.model || 'LLM Call'} (${apiRequestId.slice(0, 8)})`,
        detail: usage ? `in:${usage.input_tokens} out:${usage.output_tokens}` : undefined,
        status: post?.finish_reason === 'error' ? 'error' : (post ? 'ok' : 'running'),
        startedAt,
        endedAt,
        durationMs,
        evidence: 'L2',
      })
      seenIds.add(nodeId)

      // Edge from workflow to LLM span
      edges.push({
        id: `edge:${workflowId}:${nodeId}`,
        from: workflowId,
        to: nodeId,
        kind: 'call',
        evidence: 'L2',
      })
    }
  }

  // Build tool span nodes
  for (const chunk of chunks) {
    if (chunk.kind === 'tool_span' && chunk.tool_call_id) {
      const nodeId = `tool:${header.session_id}:${chunk.tool_call_id}`
      if (!seenIds.has(nodeId)) {
        nodes.push({
          id: nodeId,
          kind: 'tool',
          label: chunk.tool_name || 'Tool',
          detail: chunk.status,
          status: chunk.status === 'error' ? 'error' : 'ok',
          startedAt: chunk.ts || header.started_at,
          endedAt: chunk.ts && chunk.duration_ms ? chunk.ts + chunk.duration_ms / 1000 : undefined,
          durationMs: chunk.duration_ms,
          evidence: 'L2',
          children: [{
            id: `tool-item:${chunk.tool_call_id}`,
            kind: 'tool',
            ts: chunk.ts || 0,
            toolName: chunk.tool_name,
            toolArgs: chunk.args,
            toolResult: chunk.result,
            durationMs: chunk.duration_ms,
            attribution: 'accurate',
          }],
        })
        seenIds.add(nodeId)

        // Edge from workflow or nearest LLM span to tool
        const parentId = chunk.api_request_id ? `llm:${header.session_id}:${chunk.api_request_id}` : workflowId
        edges.push({
          id: `edge:${parentId}:${nodeId}`,
          from: parentId,
          to: nodeId,
          kind: 'call',
          evidence: 'L2',
        })
      }
    }
  }

  // Build subagent span nodes
  const subagentSpans = new Map<string, { start?: JSONLChunk; stop?: JSONLChunk }>()
  for (const chunk of chunks) {
    if (chunk.kind === 'subagent_span' && chunk.subagent_label) {
      const span = subagentSpans.get(chunk.subagent_label) || {}
      if (chunk.phase === 'start') span.start = chunk
      else if (chunk.phase === 'stop') span.stop = chunk
      subagentSpans.set(chunk.subagent_label, span)
    }
  }

  for (const [label, span] of subagentSpans) {
    const start = span.start
    const stop = span.stop
    const startedAt = start?.started_at
    const endedAt = stop?.ended_at
    const durationMs = stop?.duration_ms || (endedAt && startedAt ? Math.round((endedAt - startedAt) * 1000) : undefined)

    const nodeId = `agent:${header.session_id}:${label.replace(/[^a-zA-Z0-9]/g, '-')}`
    if (!seenIds.has(nodeId)) {
      nodes.push({
        id: nodeId,
        kind: 'agent',
        label: label,
        detail: stop?.status,
        status: stop?.status === 'error' ? 'error' : (stop ? 'ok' : 'running'),
        startedAt: startedAt || header.started_at,
        endedAt,
        durationMs,
        evidence: 'L2',
      })
      seenIds.add(nodeId)

      // Edge from workflow to subagent
      edges.push({
        id: `edge:${workflowId}:${nodeId}`,
        from: workflowId,
        to: nodeId,
        kind: 'delegate',
        evidence: 'L2',
      })
    }
  }

  return { nodes, edges }
}

/**
 * GET /api/hermes/sessions/:id/trace
 * 
 * Returns Layer 2 trace data for a session.
 */
router.get('/api/hermes/sessions/:id/trace', async (ctx) => {
  const sessionId = ctx.params.id
  if (!sessionId) {
    ctx.status = 400
    ctx.body = { error: 'Missing session_id' }
    return
  }

  // Try to read JSONL file
  const filePath = join(TRACE_DIR, `${sessionId}.jsonl`)
  try {
    await access(filePath, constants.R_OK)
  } catch {
    // File not found or not readable
    ctx.status = 404
    ctx.body = { error: 'Trace file not found', hint: 'Enable run-trace plugin in hermes-agent' }
    return
  }

  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')
    const { header, chunks, trailer } = parseJSONL(lines)

    if (!header.session_id) {
      ctx.status = 500
      ctx.body = { error: 'Invalid trace file: missing header' }
      return
    }

    const { nodes, edges } = buildTraceGraph(header, chunks, trailer)

    ctx.body = {
      session_id: sessionId,
      evidence: 'L2',
      nodes,
      edges,
      meta: {
        started_at: header.started_at,
        ended_at: trailer?.ended_at,
        duration_ms: trailer?.duration_ms,
        model: header.model,
        provider: header.provider,
        outcome: trailer?.outcome,
      },
    }
  } catch (err) {
    ctx.status = 500
    ctx.body = { error: 'Failed to read trace file', details: String(err) }
  }
})

export default router