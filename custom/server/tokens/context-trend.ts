// overlay/custom/server/tokens/context-trend.ts
// 逐轮上下文组成趋势 fold（context-insights P2，对标 dsh-context Context Trend）。
// 事件流 = messages 不可变日志（压缩不删行，压缩快照单点在 chat_compression_snapshots）。
// 每 run（run_marker 分组）末尾对四桶累计值快照 → 一根柱；usage 按 run_id 精确对齐，
// 无 run_marker 的旧会话按时间序近似对齐并显式标注（fail-soft 不造假）。
// 估算口径单一事实源：estimateTokensOf/CHARS_PER_TOKEN 由前端
// custom/client/ide/utils/contextBreakdown.ts 反向复用（client→server 纯模块 import
// 先例=compactthreshold）。
export const CHARS_PER_TOKEN = 4

export function estimateTokensOf(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export interface TrendMessage {
  id: number
  role: string
  content: string
  tool_calls?: string | null
  token_count?: number | null
  reasoning?: string | null
  run_marker?: string | null
}

export interface TrendUsageRow {
  run_id: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  model: string
  created_at: number
}

export interface TrendStepUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  model: string | null
}

export interface TrendStep {
  /** 收口消息 id（该 run 最后一条消息） */
  seq: number
  /** 轮次序（1 起） */
  turn: number
  runId: string | null
  /** 该时点四桶累计 token */
  buckets: { system: number; user: number; assistant: number; tool: number }
  total: number
  usage: TrendStepUsage | null
}

export interface TrendCompactionEvent {
  kind: 'compaction'
  /** 压缩至此消息 id；标记画在首个 seq ≥ 该值的柱上 */
  throughMessageId: number
  foldedMessages: number
}

export interface TrendResult {
  steps: TrendStep[]
  events: TrendCompactionEvent[]
  usageAligned: 'run' | 'order-approx'
  /** 任一消息走了 chars/4 估算 */
  isEstimate: boolean
  /** 超出 STEPS_MAX 被截断（保留最近 N 轮） */
  truncated: boolean
}

export const STEPS_MAX = 200

interface BucketState { system: number; user: number; assistant: number; tool: number }

function toolCallsChars(raw: string | null | undefined): number {
  if (!raw) return 0
  return raw.length
}

/** 单条消息归桶 token（口径=前端 computeBreakdown：token_count 优先，chars/4 兜底；
 *  assistant 的 reasoning/tool_calls 计入 assistant/tool）。返回是否走了估算。 */
function messageBuckets(msg: TrendMessage, state: BucketState): boolean {
  const raw = msg.token_count
  const known = typeof raw === 'number' && Number.isFinite(raw) && raw > 0
  const base = known && typeof raw === 'number' ? raw : estimateTokensOf(typeof msg.content === 'string' ? msg.content : '')
  const reasoning = typeof msg.reasoning === 'string' && msg.reasoning ? estimateTokensOf(msg.reasoning) : 0
  const calls = toolCallsChars(msg.tool_calls)
  switch (msg.role) {
    case 'user':
      state.user += base
      break
    case 'assistant':
      state.assistant += base + reasoning
      if (calls > 0) state.tool += Math.ceil(calls / CHARS_PER_TOKEN)
      break
    case 'tool':
      state.tool += base
      break
    default:
      state.system += base
  }
  return !known
}

function usageOf(row: TrendUsageRow | undefined): TrendStepUsage | null {
  if (!row) return null
  return {
    input: row.input_tokens, output: row.output_tokens,
    cacheRead: row.cache_read_tokens, cacheWrite: row.cache_write_tokens,
    model: row.model || null,
  }
}

/**
 * messages 日志 → 逐轮组成趋势。
 * @param messages 按 id 升序的会话消息
 * @param usageRows 该会话 session_usage 行（run 粒度任意，内部按 run_id 合并）
 * @param snapshot 最新压缩快照（compressed_through_message_id 数值化；表只存最新，事件≤1）
 */
export function foldContextTrend(
  messages: readonly TrendMessage[],
  usageRows: readonly TrendUsageRow[],
  snapshot?: { throughMessageId: number; foldedMessages: number } | null,
): TrendResult {
  const events: TrendCompactionEvent[] = []
  if (snapshot && Number.isFinite(snapshot.throughMessageId)) {
    events.push({ kind: 'compaction', throughMessageId: snapshot.throughMessageId, foldedMessages: snapshot.foldedMessages })
  }

  const usageByRun = new Map<string, TrendUsageRow>()
  const usageByOrder: TrendUsageRow[] = []
  for (const row of usageRows) {
    if (!row.run_id) continue
    const prev = usageByRun.get(row.run_id)
    if (!prev) {
      usageByRun.set(row.run_id, { ...row })
      usageByOrder.push({ ...row })
    } else {
      prev.input_tokens += row.input_tokens
      prev.output_tokens += row.output_tokens
      prev.cache_read_tokens += row.cache_read_tokens
      prev.cache_write_tokens += row.cache_write_tokens
      prev.created_at = Math.min(prev.created_at, row.created_at)
    }
  }
  usageByOrder.sort((a, b) => a.created_at - b.created_at)

  const hasRunMarkers = messages.some(m => typeof m.run_marker === 'string' && m.run_marker !== '')
  const steps: TrendStep[] = []
  const state: BucketState = { system: 0, user: 0, assistant: 0, tool: 0 }
  let isEstimate = false

  if (hasRunMarkers) {
    let currentRun: string | null = null
    let prevSeq = 0
    let turn = 0
    const closeRun = (): void => {
      turn += 1
      steps.push({
        seq: prevSeq, turn, runId: currentRun,
        buckets: { ...state },
        total: state.system + state.user + state.assistant + state.tool,
        usage: usageOf(usageByRun.get(currentRun!)),
      })
    }
    for (const msg of messages) {
      const marker = typeof msg.run_marker === 'string' && msg.run_marker !== '' ? msg.run_marker : null
      if (marker !== currentRun) {
        // 收口必须发生在当前消息入桶之前：柱快照=该 run 最后一条消息时点的累计
        if (currentRun !== null) closeRun()
        currentRun = marker
      }
      isEstimate = messageBuckets(msg, state) || isEstimate
      prevSeq = msg.id
    }
    if (currentRun !== null) closeRun()
  } else if (messages.length) {
    // 无 run_marker 的旧会话：assistant 消息逐条开柱，usage 按时间序近似对齐（显式标注）
    let orderIdx = 0
    let turn = 0
    for (const msg of messages) {
      isEstimate = messageBuckets(msg, state) || isEstimate
      if (msg.role === 'assistant') {
        turn += 1
        steps.push({
          seq: msg.id, turn, runId: null,
          buckets: { ...state },
          total: state.system + state.user + state.assistant + state.tool,
          usage: usageOf(usageByOrder[orderIdx]),
        })
        orderIdx += 1
      }
    }
  }

  const truncated = steps.length > STEPS_MAX
  const kept = truncated ? steps.slice(steps.length - STEPS_MAX) : steps
  return {
    steps: kept,
    events,
    usageAligned: hasRunMarkers ? 'run' : 'order-approx',
    isEstimate,
    truncated,
  }
}
