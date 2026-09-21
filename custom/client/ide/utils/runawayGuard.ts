// overlay/custom/client/ide/utils/runawayGuard.ts
// 失控代理检测（minimax runaway-guard 六类信号语义的前端观测版）。
// 语义源：upstream/minimax-code runaway-guard/src/contracts.ts——同文件反复编辑、
// 同命令反复执行、长时静默、连续同类错误、全局高频、耗尽预算。
// 前端可观测面收敛为六类（均在消息流可见）：
//   ① same_tool_args      同工具+同参数连续 N 次（打转的最强信号）
//   ② same_error          同一错误签名连续 N 次（重试循环）
//   ③ high_frequency      1 分钟内工具调用 > 阈值（API 打地鼠）
//   ④ long_silence        运行中超 10 分钟无工具活动（socket 心跳不到工具层）
//   ⑤ tool_storm          单轮工具总数 > 阈值（无聚焦扫荡）
//   ⑥ repetitive_text     连续 assistant 文本头 120 字符全等（复读机）
// 只产生「建议中断」信号（人工裁决），不自动 kill——与 minimax 的 guard 分级一致。
export interface RunawayMessage {
  role: string
  content?: string
  toolName?: string | null
  toolArgs?: unknown
  toolStatus?: string | null
  toolError?: string | null
  timestamp?: number
}

export type RunawaySignalKind =
  | 'same_tool_args'
  | 'same_error'
  | 'high_frequency'
  | 'long_silence'
  | 'tool_storm'
  | 'repetitive_text'

export interface RunawaySignal {
  kind: RunawaySignalKind
  detail: string
}

export const SAME_TOOL_ARGS_LIMIT = 3
export const SAME_ERROR_LIMIT = 3
export const HIGH_FREQUENCY_PER_MIN = 40
export const LONG_SILENCE_MS = 10 * 60 * 1000
export const TOOL_STORM_LIMIT = 50
export const REPETITIVE_TEXT_LIMIT = 2

function stableArgs(toolArgs: unknown): string {
  if (toolArgs == null) return ''
  try {
    return JSON.stringify(toolArgs)
  } catch {
    return String(toolArgs)
  }
}

function errorSignature(msg: RunawayMessage): string | null {
  const text = (msg.toolError ?? '').trim()
  if (!text) return null
  // 归一化：数字与路径抹平，抓同类错误族
  return text.toLowerCase().replace(/\/[^\s]+/g, '/…').replace(/\d+/g, '#').slice(0, 80)
}

/**
 * 扫描会话消息，返回首个触发的失控信号（无则 null）。
 * nowMs 由调用方传入（测试可注入假时钟）；runStartedAtMs 缺失时退化为消息时间线。
 */
export function detectRunaway(
  messages: RunawayMessage[],
  opts: { isRunning: boolean; nowMs: number; runStartedAtMs?: number },
): RunawaySignal | null {
  if (!opts.isRunning || !Array.isArray(messages) || messages.length === 0) return null
  const now = opts.nowMs

  const tools = messages.filter((m) => m.role === 'tool')
  const toolTimes = tools.map((m) => (typeof m.timestamp === 'number' ? m.timestamp : 0)).filter(Boolean)

  // ① 同工具+同参数连续 N 次
  let sameArgsRun = 0
  let prevKey = ''
  let lastDetail = ''
  for (const m of tools) {
    const key = `${m.toolName ?? ''}::${stableArgs(m.toolArgs)}`
    if (key === prevKey) {
      sameArgsRun++
      lastDetail = `${m.toolName ?? 'tool'} ${stableArgs(m.toolArgs).slice(0, 60)}`
      if (sameArgsRun >= SAME_TOOL_ARGS_LIMIT - 1) {
        return { kind: 'same_tool_args', detail: lastDetail }
      }
    } else {
      prevKey = key
      sameArgsRun = 0
    }
  }

  // ② 同一错误签名连续 N 次
  let sameErrRun = 0
  let prevErr = ''
  for (const m of tools) {
    const sig = errorSignature(m)
    if (!sig) {
      prevErr = ''
      sameErrRun = 0
      continue
    }
    if (sig === prevErr) {
      sameErrRun++
      if (sameErrRun >= SAME_ERROR_LIMIT - 1) {
        return { kind: 'same_error', detail: sig }
      }
    } else {
      prevErr = sig
      sameErrRun = 0
    }
  }

  // ③ 1 分钟高频
  if (toolTimes.length > 0) {
    const windowStart = now - 60_000
    const inWindow = toolTimes.filter((t) => t >= windowStart).length
    if (inWindow > HIGH_FREQUENCY_PER_MIN) {
      return { kind: 'high_frequency', detail: `${inWindow}/${60}s` }
    }
  }

  // ④ 长时静默（运行中、有历史工具活动、最后一个工具距今 >10min）
  if (toolTimes.length > 0) {
    const lastToolAt = Math.max(...toolTimes)
    if (now - lastToolAt > LONG_SILENCE_MS) {
      return { kind: 'long_silence', detail: `${Math.round((now - lastToolAt) / 60000)}min` }
    }
  }

  // ⑤ 单轮工具风暴
  const runStart = opts.runStartedAtMs ?? (toolTimes.length > 0 ? Math.min(...toolTimes) : 0)
  const inRun = runStart > 0 ? tools.filter((m) => (m.timestamp ?? 0) >= runStart).length : tools.length
  if (inRun > TOOL_STORM_LIMIT) {
    return { kind: 'tool_storm', detail: `${inRun}` }
  }

  // ⑥ 复读机：连续 assistant 文本头 120 字符全等（≥2 条即可判定，2 条以上更强）
  const assistants = messages.filter((m) => m.role === 'assistant' && typeof m.content === 'string')
  if (assistants.length >= REPETITIVE_TEXT_LIMIT + 1) {
    const tail = assistants.slice(-(REPETITIVE_TEXT_LIMIT + 1)).map((m) => (m.content ?? '').slice(0, 120))
    if (tail.every((t) => t.length >= 60 && t === tail[0])) {
      return { kind: 'repetitive_text', detail: tail[0].slice(0, 40) }
    }
  }

  return null
}
