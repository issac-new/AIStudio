// overlay/eval 域：真实轨迹采样（2026-10-18 残余项④）。
//
// 固定评测集需要真实运行轨迹做样本；本模块把 L2 trace JSONL 转成 Eval Studio
// 的 Evidence（transcript/toolCalls/efficiency），由调用方决定是否建集。
// 安全：只取工具名/状态/耗时与参数摘要（不落原值）；sessionId 做路径字符校验。
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
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
}

export interface TraceSampleResult {
  ok: boolean
  sessionId: string
  sample?: Evidence
  meta?: { lines: number; toolCalls: number; tokens: number; durationMs: number | null; startedAt: number | null }
  reason?: string
}

function tracesDir(): string {
  const env = process.env.HERMES_TRACES_DIR?.trim()
  return env ? resolve(env.replace(/^~/, homedir())) : join(homedir(), '.hermes', 'traces')
}

function safeSessionId(id: string): boolean {
  return /^[A-Za-z0-9._:-]{1,200}$/.test(id)
}

function argSummary(args: unknown): string {
  try {
    const summary = summarizeArgs(args, { maxChars: 60 })
    return JSON.stringify(summary).slice(0, 200)
  } catch {
    return '<args>'
  }
}

/** 从 trace 构造 Evidence；缺文件/坏行如实降级。 */
export function sampleFromTrace(sessionId: string, opts: { tracesDir?: string } = {}): TraceSampleResult {
  if (!safeSessionId(sessionId)) return { ok: false, sessionId, reason: 'sessionId 含非法字符' }
  const dir = opts.tracesDir ?? tracesDir()
  const file = join(dir, `${sessionId}.jsonl`)
  if (!existsSync(file)) return { ok: false, sessionId, reason: 'trace 不存在' }

  const toolCalls: ToolCallRecord[] = []
  const transcript: string[] = []
  let tokens = 0
  let startedAt: number | null = null
  let durationMs: number | null = null
  let lines = 0

  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue
      let row: TraceLine
      try { row = JSON.parse(line) as TraceLine } catch { continue }
      lines += 1
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
  } catch {
    return { ok: false, sessionId, reason: 'trace 读取失败' }
  }

  return {
    ok: true,
    sessionId,
    sample: {
      transcript: transcript.join('\n').slice(0, 20_000),
      toolCalls,
      efficiency: { tokens, steps: toolCalls.length, ...(durationMs != null ? { durationMs } : {}) },
    },
    meta: { lines, toolCalls: toolCalls.length, tokens, durationMs, startedAt },
  }
}
