// overlay/eval 域：真实轨迹采样（2026-10-18 残余项④）。
//
// 固定评测集需要真实运行轨迹做样本；本模块把 L2 trace JSONL 转成 Eval Studio
// 的 Evidence（transcript/toolCalls/efficiency），由调用方决定是否建集。
// 安全：只取工具名/状态/耗时与参数摘要（不落原值）；sessionId 做路径字符校验。
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { summarizeArgs } from '../toolcontract/contract'
import type { Evidence, ToolCallRecord } from './types'

interface TraceLine {
  type?: string
  kind?: string
  session_id?: string
  started_at?: number
  ended_at?: number
  duration_ms?: number
  tool_name?: string
  args?: unknown
  status?: string
  error_message?: string
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
  input_tokens?: number
  output_tokens?: number
  durationMs?: number
  summary?: string
  outcome?: string
  otelFormat?: boolean
}

export type TraceFormat = 'legacy' | 'otel' | 'unknown'

export interface TraceInspection {
  ok: boolean
  sessionId: string
  rows?: TraceLine[]
  traceHash?: string
  format?: TraceFormat
  complete?: boolean
  reason?: string
}

export interface TraceSampleResult {
  ok: boolean
  sessionId: string
  sample?: Evidence
  meta?: {
    lines: number
    toolCalls: number
    tokens: number
    durationMs: number | null
    startedAt: number | null
    traceHash: string
    format: TraceFormat
    complete: boolean
  }
  reason?: string
}

function tracesDir(): string {
  const evalEnv = process.env.EVAL_TRACE_DIR?.trim()
  if (evalEnv) return resolve(evalEnv.replace(/^~/, homedir()))
  const env = process.env.HERMES_TRACES_DIR?.trim()
  return env ? resolve(env.replace(/^~/, homedir())) : join(homedir(), '.hermes', 'traces')
}

function safeSessionId(id: string): boolean {
  return /^[A-Za-z0-9._:-]{1,200}$/.test(id)
}

function parseRows(raw: string): TraceLine[] {
  const rows: TraceLine[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line) as TraceLine)
    } catch {
      // 并发写入产生的半行不参与采样。
    }
  }
  return rows
}

// ── OTel 格式（单一事实源：controllers/hermes/trace 与本域共用同一谓词与转换）──

export interface OTelSpan {
  traceId: string
  spanId: string
  parentSpanId?: string | null
  name: string
  kind: string
  startTime: number
  endTime?: number
  durationMs?: number
  attributes?: Record<string, unknown>
  status?: { code: string; message?: string }
  otelFormat?: true
  isTrailer?: boolean
}

/** 严格谓词：必须有 otelFormat 标志且 traceId/spanId 为字符串（裸 spanId 行不算 OTel）。 */
export function isOTelSpanRow(row: unknown): row is OTelSpan {
  return Boolean(
    row
    && (row as { otelFormat?: unknown }).otelFormat === true
    && typeof (row as { traceId?: unknown }).traceId === 'string'
    && typeof (row as { spanId?: unknown }).spanId === 'string',
  )
}

function usToMs(us: number): number {
  return Math.floor(us / 1000)
}

/** OTel span → legacy header/chunk/trailer 行（GenAI semconv 口径，agentscope 扩展键兼容）。 */
export type LegacyRow = { type: string } & Record<string, unknown>
export function otelRowToLegacy(span: OTelSpan): LegacyRow {
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
      outcome: attrs['agentscope.session.outcome'] as string | undefined,
      error: span.status?.message,
    }
  }

  if (opName === 'invoke_agent' && span.kind === 'SERVER' && !span.parentSpanId) {
    return {
      type: 'header',
      version: '1.0.0',
      session_id: sessionId,
      started_at: startedAtMs,
      model: attrs['gen_ai.request.model'] as string | undefined,
      provider: attrs['gen_ai.provider.name'] as string | undefined,
      source: 'hermes-agent',
    }
  }

  if (opName === 'chat') {
    const usage = attrs['gen_ai.usage.input_tokens'] !== undefined
      ? { input_tokens: attrs['gen_ai.usage.input_tokens'] as number, output_tokens: attrs['gen_ai.usage.output_tokens'] as number }
      : undefined
    return {
      type: 'chunk',
      kind: 'llm_span',
      phase: endedAtMs ? 'post' : 'pre',
      session_id: sessionId,
      api_request_id: span.spanId,
      started_at: startedAtMs,
      ended_at: endedAtMs,
      duration_ms: span.durationMs,
      usage,
    }
  }

  if (opName === 'execute_tool') {
    return {
      type: 'chunk',
      kind: 'tool_span',
      session_id: sessionId,
      tool_call_id: (attrs['gen_ai.tool.call.id'] as string) || span.spanId,
      tool_name: attrs['gen_ai.tool.name'] as string | undefined,
      args: attrs['gen_ai.tool.call.arguments'],
      result: attrs['gen_ai.tool.call.result'],
      duration_ms: span.durationMs,
      status: span.status?.code === 'ERROR' ? 'error' : (endedAtMs ? 'ok' : undefined),
      error_message: span.status?.message,
    }
  }

  if (attrs['agentscope.subagent.label']) {
    return {
      type: 'chunk',
      kind: 'subagent_span',
      phase: endedAtMs ? 'stop' : 'start',
      session_id: sessionId,
      summary: attrs['agentscope.subagent.label'] as string,
      started_at: startedAtMs,
      ended_at: endedAtMs,
      duration_ms: span.durationMs,
      status: span.status?.code === 'ERROR' ? 'error' : (endedAtMs ? 'ok' : undefined),
    }
  }

  return { type: 'chunk', kind: 'tool_span', session_id: sessionId, tool_call_id: span.spanId }
}

/**
 * 读取并检查 trace 文件。转题与 origin 复判共用这一事实源：
 * 路径不越界、hash 来自原始字节、完整性按 header/trailer 判定（OTel 先转 legacy 投影再判）。
 */
export function inspectTrace(sessionId: string, opts: { tracesDir?: string } = {}): TraceInspection {
  if (!safeSessionId(sessionId)) return { ok: false, sessionId, reason: 'sessionId 含非法字符' }
  const dir = opts.tracesDir ?? tracesDir()
  const file = join(dir, `${sessionId}.jsonl`)
  if (!existsSync(file)) return { ok: false, sessionId, reason: 'trace 不存在' }

  try {
    const root = realpathSync(dir)
    const target = realpathSync(file)
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      return { ok: false, sessionId, reason: 'trace 路径越界' }
    }
    const bytes = readFileSync(target)
    const traceHash = createHash('sha256').update(bytes).digest('hex')
    const rawRows = parseRows(bytes.toString('utf8'))
    // OTel 文件：按严格谓词识别后整体转 legacy 投影（hash 仍锚原始字节）；
    // 严格谓词防「裸 spanId 行」被判 OTel——与 controllers/hermes/trace 同一口径。
    const otelRows = (rawRows as unknown[]).filter(isOTelSpanRow)
    const hasLegacy = rawRows.some((row) => row.type === 'header' || row.type === 'chunk' || row.type === 'trailer')
    const format: TraceFormat = otelRows.length > 0 ? 'otel' : hasLegacy ? 'legacy' : 'unknown'
    const rows = format === 'otel' ? (otelRows.map(otelRowToLegacy) as unknown as TraceLine[]) : rawRows
    const header = rows.find((row) => row.type === 'header')
    const trailer = [...rows].reverse().find((row) => row.type === 'trailer')
    const complete = Boolean(
      header?.session_id === sessionId
      && trailer
      && (trailer.session_id === undefined || trailer.session_id === sessionId),
    )
    return { ok: true, sessionId, rows, traceHash, format, complete }
  } catch {
    return { ok: false, sessionId, reason: 'trace 读取失败' }
  }
}

function argSummary(args: unknown): string {
  try {
    const summary = summarizeArgs(args, { maxChars: 60 })
    return JSON.stringify(summary).slice(0, 200)
  } catch {
    return '<args>'
  }
}

/** rows → session 级 Evidence（纯函数；与 hash 校验共用同一次文件读取的调用方直接复用）。 */
export function evidenceFromRows(rows: TraceLine[]): { sample: Evidence; tokens: number; startedAt: number | null; durationMs: number | null } {
  const toolCalls: ToolCallRecord[] = []
  const transcript: string[] = []
  let tokens = 0
  let startedAt: number | null = null
  let durationMs: number | null = null

  for (const row of rows) {
    if (row.type === 'header' && typeof row.started_at === 'number') startedAt = row.started_at
    if (row.type === 'trailer') {
      if (typeof row.duration_ms === 'number') durationMs = row.duration_ms
      else if (typeof row.durationMs === 'number') durationMs = row.durationMs
    }
    if (row.type !== 'chunk') continue
    if (row.kind === 'llm_span') {
      const input = row.usage?.input_tokens ?? row.input_tokens ?? 0
      const output = row.usage?.output_tokens ?? row.output_tokens ?? 0
      if (Number.isFinite(input)) tokens += input
      if (Number.isFinite(output)) tokens += output
      continue
    }
    if (row.kind === 'tool_span' && row.tool_name) {
      const ok = row.status !== 'error' && !row.error_message
      toolCalls.push({
        name: row.tool_name,
        ok,
        durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : undefined,
      })
      transcript.push(`tool: ${row.tool_name}(${argSummary(row.args)}) -> ${ok ? 'ok' : 'error'}`)
    }
  }

  return {
    sample: {
      transcript: transcript.join('\n').slice(0, 20_000),
      toolCalls,
      efficiency: { tokens, steps: toolCalls.length, ...(durationMs != null ? { durationMs } : {}) },
    },
    tokens,
    startedAt,
    durationMs,
  }
}

/** 从 trace 构造 Evidence；缺文件/坏行如实降级。 */
export function sampleFromTrace(sessionId: string, opts: { tracesDir?: string } = {}): TraceSampleResult {
  const inspected = inspectTrace(sessionId, opts)
  if (!inspected.ok) return { ok: false, sessionId, reason: inspected.reason }

  const built = evidenceFromRows(inspected.rows ?? [])
  return {
    ok: true,
    sessionId,
    sample: built.sample,
    meta: {
      lines: inspected.rows?.length ?? 0,
      toolCalls: built.sample.toolCalls?.length ?? 0,
      tokens: built.tokens,
      durationMs: built.durationMs,
      startedAt: built.startedAt,
      traceHash: inspected.traceHash!,
      format: inspected.format!,
      complete: inspected.complete!,
    },
  }
}

// ── span 级采样（2026-10-19 观测层轮）──
//
// 源文《AI-Native可观测层》：「把评估下沉到 observation 级，对单个 LLM 调用、检索、
// 工具执行分别打分，比 trace 级评估更快更准」。本函数把单个 span（LLM 调用及其
// 子工具调用，或单个工具 span）转成 Evidence，供建集/oracle/判定复用。
// 与 sampleFromTrace 的差别：span 级判定需要内容面，故请求/响应/reasoning 以
// 有界字符上限落入 transcript（请求 4000 / 响应原文 / reasoning 1000），
// 不再只留参数摘要——这是调用方显式指定 span 的按需取证。

interface SpanTraceLine extends TraceLine {
  phase?: string
  api_request_id?: string
  tool_call_id?: string
  request_messages?: unknown
  response_preview?: unknown
  reasoning_preview?: unknown
  first_token_ms?: number
  ttft_ms?: number
  cache_read_tokens?: number
  error_type?: string
}

export interface SpanSampleResult {
  ok: boolean
  sessionId: string
  spanRef: string
  spanKind?: 'llm_span' | 'tool_span'
  sample?: Evidence
  meta?: {
    spanRef: string
    tokens: number
    durationMs: number | null
    ttftMs: number | null
    childToolCalls: number
    traceHash: string
    format: TraceFormat
    complete: boolean
  }
  reason?: string
}

function renderMessages(messages: unknown, maxChars: number): string {
  if (!Array.isArray(messages)) return ''
  const parts: string[] = []
  let used = 0
  for (const m of messages) {
    if (used >= maxChars) break
    const role = typeof (m as { role?: unknown })?.role === 'string' ? (m as { role: string }).role : '?'
    let content = (m as { content?: unknown })?.content
    if (typeof content !== 'string') {
      try { content = JSON.stringify(content) } catch { content = '<content>' }
    }
    const text = `${role}: ${content}`
    parts.push(text.slice(0, Math.max(0, maxChars - used)))
    used += text.length
  }
  return parts.join('\n')
}

/**
 * rows → span 级 Evidence（纯函数）。与 hash 校验共用同一次文件读取的调用方直接复用，
 * 消除「校验后再读一次文件」的证据漂移窗口。
 */
export function spanEvidenceFromRows(
  rows: TraceLine[],
  spanRef: string,
): { spanKind: 'llm_span' | 'tool_span'; sample: Evidence; tokens: number; durationMs: number | null; ttftMs: number | null; childToolCalls: number } | { reason: string } {
  const typed = rows as SpanTraceLine[]
  const chunks = typed.filter((r) => r.type === 'chunk')

  // 工具 span：tool_call_id 直匹
  const toolRow = chunks.find((r) => r.kind === 'tool_span' && r.tool_call_id === spanRef)
  if (toolRow) {
    const ok = toolRow.status !== 'error' && !toolRow.error_message
    const transcript = [
      `tool: ${toolRow.tool_name ?? 'unknown'}(${argSummary(toolRow.args)}) -> ${ok ? 'ok' : `error: ${toolRow.error_message ?? 'unknown'}`}`,
    ].join('\n')
    return {
      spanKind: 'tool_span',
      sample: {
        transcript,
        toolCalls: [{
          name: toolRow.tool_name ?? 'unknown',
          ok,
          durationMs: typeof toolRow.duration_ms === 'number' ? toolRow.duration_ms : undefined,
        }],
      },
      tokens: 0,
      durationMs: typeof toolRow.duration_ms === 'number' ? toolRow.duration_ms : null,
      ttftMs: null,
      childToolCalls: 0,
    }
  }

  // LLM span：api_request_id 匹配（pre/post/error 三段）+ 子工具调用
  const pre = chunks.find((r) => r.kind === 'llm_span' && r.phase === 'pre' && r.api_request_id === spanRef)
  const post = chunks.find((r) => r.kind === 'llm_span' && (r.phase === 'post' || r.phase === 'error') && r.api_request_id === spanRef)
  if (!pre && !post) {
    return { reason: 'span 不存在（api_request_id/tool_call_id 均未命中）' }
  }
  const children = chunks.filter((r) => r.kind === 'tool_span' && r.api_request_id === spanRef)

  const transcript: string[] = []
  const requestText = renderMessages(pre?.request_messages, 4000)
  if (requestText) transcript.push(`[request]\n${requestText}`)
  if (typeof post?.response_preview === 'string' && post.response_preview) {
    transcript.push(`[response]\n${post.response_preview}`)
  }
  if (typeof post?.reasoning_preview === 'string' && post.reasoning_preview) {
    transcript.push(`[reasoning]\n${String(post.reasoning_preview).slice(0, 1000)}`)
  }
  if (post?.error_message) transcript.push(`[error] ${post.error_type ?? 'error'}: ${post.error_message}`)

  const toolCalls: ToolCallRecord[] = []
  for (const c of children) {
    const ok = c.status !== 'error' && !c.error_message
    toolCalls.push({
      name: c.tool_name ?? 'unknown',
      ok,
      durationMs: typeof c.duration_ms === 'number' ? c.duration_ms : undefined,
    })
    transcript.push(`tool: ${c.tool_name ?? 'unknown'}(${argSummary(c.args)}) -> ${ok ? 'ok' : 'error'}`)
  }

  const usage = post?.usage
  const tokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
  const durationMs = typeof post?.duration_ms === 'number' ? post.duration_ms : null
  const ttftMs = typeof post?.first_token_ms === 'number' ? post.first_token_ms : (typeof post?.ttft_ms === 'number' ? post.ttft_ms : null)

  return {
    spanKind: 'llm_span',
    sample: {
      transcript: transcript.join('\n\n').slice(0, 20_000),
      toolCalls,
      efficiency: {
        tokens,
        steps: toolCalls.length,
        ...(durationMs != null ? { durationMs } : {}),
        ...(ttftMs != null ? { ttftMs } : {}),
      },
    },
    tokens,
    durationMs,
    ttftMs,
    childToolCalls: children.length,
  }
}

/** 从 trace 构造单 span 级 Evidence；span 不存在/文件缺席如实降级。 */
export function sampleSpanFromTrace(sessionId: string, spanRef: string, opts: { tracesDir?: string } = {}): SpanSampleResult {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(spanRef)) return { ok: false, sessionId, spanRef, reason: 'spanRef 含非法字符' }
  const inspected = inspectTrace(sessionId, opts)
  if (!inspected.ok) return { ok: false, sessionId, spanRef, reason: inspected.reason }
  const built = spanEvidenceFromRows(inspected.rows ?? [], spanRef)
  if ('reason' in built) return { ok: false, sessionId, spanRef, reason: built.reason }
  return {
    ok: true,
    sessionId,
    spanRef,
    spanKind: built.spanKind,
    sample: built.sample,
    meta: {
      spanRef,
      tokens: built.tokens,
      durationMs: built.durationMs,
      ttftMs: built.ttftMs,
      childToolCalls: built.childToolCalls,
      traceHash: inspected.traceHash!,
      format: inspected.format!,
      complete: inspected.complete!,
    },
  }
}
