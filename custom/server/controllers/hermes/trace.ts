/**
 * Trace API controller for RunTraceView Layer 3.
 * 
 * Reads JSONL trace files from ~/.hermes/traces/ and returns
 * TraceNode[] + TraceEdge[] for the frontend to consume.
 */
import Router from '@koa/router'
import { readFile, access } from 'fs/promises'
import { homedir } from 'os'
import { join, resolve, relative } from 'path'
import { constants } from 'fs'
// HERMES_CUSTOM[SecTraceSandbox] BEGIN: 路径遍历防护
// 内联 isPathWithin，避免通过符号链接路径解析 import upstream 模块（esbuild/ts-node
// 用真实路径解析，符号链接 custom/ → server/src/custom 会导致 ../../../ 找不到）。
function isPathWithin(targetPath: string, basePath: string): boolean {
  const rel = relative(basePath, targetPath)
  return rel === '' || (!!rel && !rel.startsWith('..') && !rel.startsWith('/'))
}
// HERMES_CUSTOM[SecTraceSandbox] END

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

// ── OTel span format (Phase 4) ──

interface OTelSpan {
  traceId: string
  spanId: string
  parentSpanId?: string | null
  name: string
  kind: string  // INTERNAL | CLIENT | SERVER
  startTime: number  // microseconds
  endTime?: number   // microseconds
  durationMs?: number
  attributes?: Record<string, unknown>
  status?: { code: string; message?: string }
  otelFormat?: true
  isTrailer?: boolean
}

function isOTelSpan(obj: any): obj is OTelSpan {
  return obj && obj.otelFormat === true && typeof obj.traceId === 'string' && typeof obj.spanId === 'string'
}

/** Convert microseconds → milliseconds */
function usToMs(us: number): number {
  return Math.floor(us / 1000)
}

/**
 * Parse a JSONL file (auto-detects legacy vs OTel format).
 */
function parseJSONL(lines: string[]): { header: JSONLHeader; chunks: JSONLChunk[]; trailer?: JSONLTrailer } {
  const header: JSONLHeader = { type: 'header', version: '1', session_id: '', started_at: 0 }
  const chunks: JSONLChunk[] = []
  let trailer: JSONLTrailer | undefined

  for (const line of lines) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      // OTel format detection
      if (isOTelSpan(obj)) {
        const converted = otelToLegacy(obj) as any
        if (converted.isTrailer) {
          trailer = converted as JSONLTrailer
        } else if (converted.type === 'header') {
          Object.assign(header, converted)
        } else {
          chunks.push(converted as JSONLChunk)
        }
        continue
      }
      // Legacy format
      const legacy = obj as JSONLLine
      if (legacy.type === 'header') {
        Object.assign(header, legacy)
      } else if (legacy.type === 'chunk') {
        chunks.push(legacy)
      } else if (legacy.type === 'trailer') {
        trailer = legacy
      }
    } catch {
      // Skip malformed lines
    }
  }

  return { header, chunks, trailer }
}

/** Convert an OTel span back to legacy JSONL format for buildTraceGraph */
function otelToLegacy(span: OTelSpan): JSONLHeader | JSONLChunk | JSONLTrailer {
  const attrs = span.attributes || {}
  const sessionId = (attrs['gen_ai.conversation.id'] as string) || (attrs['agentscope.session.id'] as string) || span.traceId
  const startedAtMs = usToMs(span.startTime)
  const endedAtMs = span.endTime ? usToMs(span.endTime) : undefined
  const opName = attrs['gen_ai.operation.name'] as string | undefined

  if (span.isTrailer) {
    return {
      type: 'trailer',
      session_id: sessionId,
      ended_at: startedAtMs,
      duration_ms: span.durationMs || 0,
      outcome: attrs['agentscope.session.outcome'] as string,
      error: span.status?.message,
    }
  }

  if (opName === 'invoke_agent' && span.kind === 'SERVER' && !span.parentSpanId) {
    // Root session span → header
    return {
      type: 'header',
      version: '1.0.0',
      session_id: sessionId,
      task_id: attrs['agentscope.task.id'] as string,
      started_at: startedAtMs,
      model: attrs['gen_ai.request.model'] as string,
      provider: attrs['gen_ai.provider.name'] as string,
      source: 'hermes-agent',
    }
  }

  if (opName === 'chat') {
    // LLM span
    const usage = attrs['gen_ai.usage.input_tokens'] !== undefined
      ? { input_tokens: attrs['gen_ai.usage.input_tokens'] as number, output_tokens: attrs['gen_ai.usage.output_tokens'] as number }
      : undefined
    return {
      type: 'chunk',
      kind: 'llm_span',
      phase: endedAtMs ? 'post' : 'pre',
      session_id: sessionId,
      api_request_id: span.spanId,
      model: attrs['gen_ai.request.model'] as string,
      provider: attrs['gen_ai.provider.name'] as string,
      started_at: startedAtMs,
      ended_at: endedAtMs,
      duration_ms: span.durationMs,
      finish_reason: (attrs['gen_ai.response.finish_reasons'] as string[])?.[0],
      usage,
    }
  }

  if (opName === 'execute_tool') {
    // Tool span
    return {
      type: 'chunk',
      kind: 'tool_span',
      session_id: sessionId,
      tool_call_id: (attrs['gen_ai.tool.call.id'] as string) || span.spanId,
      tool_name: attrs['gen_ai.tool.name'] as string,
      args: attrs['gen_ai.tool.call.arguments'],
      result: attrs['gen_ai.tool.call.result'],
      duration_ms: span.durationMs,
      status: span.status?.code === 'ERROR' ? 'error' : (endedAtMs ? 'ok' : undefined),
      error_message: span.status?.message,
      ts: startedAtMs,
    }
  }

  // Default: treat as subagent span
  if (attrs['agentscope.subagent.label']) {
    return {
      type: 'chunk',
      kind: 'subagent_span',
      phase: endedAtMs ? 'stop' : 'start',
      session_id: sessionId,
      subagent_label: attrs['agentscope.subagent.label'] as string,
      started_at: startedAtMs,
      ended_at: endedAtMs,
      duration_ms: span.durationMs,
      status: span.status?.code === 'ERROR' ? 'error' : (endedAtMs ? 'ok' : undefined),
    }
  }

  // Fallback: empty chunk
  return { type: 'chunk', kind: 'tool_span', session_id: sessionId, tool_call_id: span.spanId, ts: startedAtMs }
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

  // HERMES_CUSTOM[SecTraceSandbox] BEGIN: 严格校验 sessionId，防路径遍历读沙箱外文件
  // sessionId 仅允许安全字符集；最终路径必须落在 TRACE_DIR 沙箱内。
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid session_id' }
    return
  }

  // Try to read JSONL file
  const filePath = resolve(TRACE_DIR, `${sessionId}.jsonl`)
  if (!isPathWithin(filePath, TRACE_DIR)) {
    ctx.status = 400
    ctx.body = { error: 'Invalid session_id' }
    return
  }
  // HERMES_CUSTOM[SecTraceSandbox] END
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
  } catch {
    // HERMES_CUSTOM[SecTraceSandbox] END: 不回传内部错误细节（防路径/堆栈泄露）
    ctx.status = 500
    ctx.body = { error: 'Failed to read trace file' }
  }
})

export default router