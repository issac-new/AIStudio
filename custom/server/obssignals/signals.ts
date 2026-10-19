// overlay/obssignals 域：观测信号聚合（2026-10-19 观测层轮，spec 2026-10-19-observability-signals-round）。
//
// 源文《AI-Native可观测层》②度量信号口径：请求量（按模型分组）、token 拆分
// （cache 命中/未命中、reasoning）、TTFT/端到端延迟分布、工具成功率、429 率。
// 本模块是纯函数组装（不 IO）：trace JSONL 行 → 按日分桶指标 + 窗口合计，
// 供 /api/harness/obs-signals 端点与 obsalerts 基线漂移告警复用。

export interface ObsSpanRow {
  type?: string
  kind?: string
  phase?: string
  session_id?: string
  model?: string | null
  provider?: string | null
  started_at?: number | null
  ended_at?: number | null
  duration_ms?: number | null
  first_token_ms?: number | null
  ttft_ms?: number | null
  status?: string | null
  status_code?: number | null
  error_type?: string | null
  error_message?: string | null
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_tokens?: number
    cache_write_tokens?: number
    reasoning_tokens?: number
  } | null
}

export interface TokenSplit {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

export interface LatencyDist {
  p50: number | null
  p95: number | null
  samples: number
}

export interface ObsDayAgg {
  /** UTC 日期键（yyyy-mm-dd）。 */
  day: string
  sessions: number
  llmCalls: number
  llmErrors: number
  rateLimit429: number
  toolCalls: number
  toolFailures: number
  tokens: TokenSplit
  ttftMs: LatencyDist
  llmDurationMs: { p50: number | null; p95: number | null }
}

export interface ObsSignalsTotals extends Omit<ObsDayAgg, 'day'> {
  /** LLM 错误率 = phase=error span / (post + error) LLM span。 */
  llmErrorRate: number | null
  /** 工具失败率 = error 工具 span / 工具 span。 */
  toolFailureRate: number | null
  /** 429 率 = status_code=429 / LLM span 总数（post+error）。 */
  rateLimit429Rate: number | null
  /** 缓存命中率 = cacheRead / (input + cacheRead + cacheWrite)。 */
  cacheHitRate: number | null
}

export interface ObsSignalsReport {
  days: number
  available: boolean
  byDay: ObsDayAgg[]
  totals: ObsSignalsTotals
  /** 请求量按 model 分组（unknown 单列）。 */
  byModel: Array<{ model: string; llmCalls: number; tokens: TokenSplit }>
  notes: string[]
}

export function dayKeyOf(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10)
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function dist(values: number[]): LatencyDist {
  const sorted = [...values].sort((a, b) => a - b)
  return { p50: percentile(sorted, 50), p95: percentile(sorted, 95), samples: sorted.length }
}

function emptyTokens(): TokenSplit {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

function addTokens(acc: TokenSplit, usage: ObsSpanRow['usage']): void {
  if (!usage) return
  if (Number.isFinite(usage.input_tokens)) acc.input += Number(usage.input_tokens)
  if (Number.isFinite(usage.output_tokens)) acc.output += Number(usage.output_tokens)
  if (Number.isFinite(usage.cache_read_tokens)) acc.cacheRead += Number(usage.cache_read_tokens)
  if (Number.isFinite(usage.cache_write_tokens)) acc.cacheWrite += Number(usage.cache_write_tokens)
  if (Number.isFinite(usage.reasoning_tokens)) acc.reasoning += Number(usage.reasoning_tokens)
}

const ratio = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 10000) / 10000 : null

interface DayAcc {
  sessions: Set<string>
  llmCalls: number
  llmErrors: number
  rateLimit429: number
  toolCalls: number
  toolFailures: number
  tokens: TokenSplit
  ttft: number[]
  durations: number[]
}

function newDayAcc(): DayAcc {
  return {
    sessions: new Set(),
    llmCalls: 0,
    llmErrors: 0,
    rateLimit429: 0,
    toolCalls: 0,
    toolFailures: 0,
    tokens: emptyTokens(),
    ttft: [],
    durations: [],
  }
}

function finalizeDay(day: string, acc: DayAcc): ObsDayAgg {
  const durations = [...acc.durations].sort((a, b) => a - b)
  return {
    day,
    sessions: acc.sessions.size,
    llmCalls: acc.llmCalls,
    llmErrors: acc.llmErrors,
    rateLimit429: acc.rateLimit429,
    toolCalls: acc.toolCalls,
    toolFailures: acc.toolFailures,
    tokens: acc.tokens,
    ttftMs: dist(acc.ttft),
    llmDurationMs: { p50: percentile(durations, 50), p95: percentile(durations, 95) },
  }
}

/** 纯组装：trace 行 → 按日指标 + 合计。行缺字段如实跳过，不猜数。 */export function buildObsSignals(rows: ObsSpanRow[], opts: { days: number }): ObsSignalsReport {
  const byDayAcc = new Map<string, DayAcc>()
  const byModelAcc = new Map<string, { llmCalls: number; tokens: TokenSplit }>()
  const total = newDayAcc()

  const dayAcc = (epochSeconds: number | null | undefined): DayAcc | null => {
    if (!Number.isFinite(epochSeconds)) return null
    const key = dayKeyOf(Number(epochSeconds))
    const existing = byDayAcc.get(key)
    if (existing) return existing
    const created = newDayAcc()
    byDayAcc.set(key, created)
    return created
  }

  for (const row of rows) {
    // 会话计数只认 header（按开始日记一次；trailer 不重复计，OTel 格式行无 type 由
    // 采集层过滤不进入本函数）。
    if (row.type === 'header' && row.session_id) {
      const acc = dayAcc(row.started_at)
      if (acc) {
        acc.sessions.add(row.session_id)
        total.sessions.add(row.session_id)
      }
      continue
    }
    if (row.type !== 'chunk') continue
    if (row.kind === 'llm_span') {
      // pre 段无独立指标（post/error 才是一次调用的结果面）
      if (row.phase !== 'post' && row.phase !== 'error') continue
      const acc = dayAcc(row.ended_at ?? row.started_at)
      const model = row.model?.trim() || 'unknown'
      const modelAcc = byModelAcc.get(model) ?? { llmCalls: 0, tokens: emptyTokens() }
      modelAcc.llmCalls += 1
      addTokens(modelAcc.tokens, row.usage)
      byModelAcc.set(model, modelAcc)

      for (const target of [acc, total] as const) {
        if (!target) continue
        target.llmCalls += 1
        if (row.phase === 'error' || row.status === 'error') target.llmErrors += 1
        if (row.status_code === 429) target.rateLimit429 += 1
        addTokens(target.tokens, row.usage)
        const ttft = row.first_token_ms ?? row.ttft_ms
        if (Number.isFinite(ttft) && Number(ttft) >= 0) target.ttft.push(Number(ttft))
        if (Number.isFinite(row.duration_ms) && Number(row.duration_ms) >= 0) {
          target.durations.push(Number(row.duration_ms))
        }
      }
      continue
    }
    if (row.kind === 'tool_span') {
      const acc = dayAcc(row.ended_at ?? row.started_at)
      const failed = row.status === 'error' || Boolean(row.error_message)
      for (const target of [acc, total] as const) {
        if (!target) continue
        target.toolCalls += 1
        if (failed) target.toolFailures += 1
      }
    }
  }

  const byDay = [...byDayAcc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, acc]) => finalizeDay(day, acc))

  const durations = [...total.durations].sort((a, b) => a - b)
  const cacheDenom = total.tokens.input + total.tokens.cacheRead + total.tokens.cacheWrite
  const totals: ObsSignalsTotals = {
    sessions: total.sessions.size,
    llmCalls: total.llmCalls,
    llmErrors: total.llmErrors,
    rateLimit429: total.rateLimit429,
    toolCalls: total.toolCalls,
    toolFailures: total.toolFailures,
    tokens: total.tokens,
    ttftMs: dist(total.ttft),
    llmDurationMs: { p50: percentile(durations, 50), p95: percentile(durations, 95) },
    llmErrorRate: ratio(total.llmErrors, total.llmCalls),
    toolFailureRate: ratio(total.toolFailures, total.toolCalls),
    rateLimit429Rate: ratio(total.rateLimit429, total.llmCalls),
    cacheHitRate: ratio(total.tokens.cacheRead, cacheDenom),
  }

  return {
    days: opts.days,
    available: rows.length > 0,
    byDay,
    totals,
    byModel: [...byModelAcc.entries()]
      .map(([model, v]) => ({ model, llmCalls: v.llmCalls, tokens: v.tokens }))
      .sort((a, b) => b.llmCalls - a.llmCalls),
    notes: [
      '429 率仅覆盖 api_request_error 钩子接入（run-trace v1.1）后的新 trace；历史 trace 无错误 span。',
      'TTFT 非流式请求不打点（上游 first_chunk_at=None），samples 如实标注。',
      '缓存命中率口径=cacheRead/(input+cacheRead+cacheWrite)，来自上游 usage 拆分。',
    ],
  }
}

// ── 任意窗口汇总（obsalerts 基线漂移告警的输入面）──

export interface WindowStats {
  llmCalls: number
  llmErrors: number
  toolCalls: number
  toolFailures: number
  /** 全口径 token（input+output+cacheRead+cacheWrite+reasoning），成本代理。 */
  totalTokens: number
  ttftP95: number | null
  /** 综合错误率 = (llmErrors+toolFailures)/(llmCalls+toolCalls)。 */
  errorRate: number | null
}

/** 窗口内行 → 告警判定用的紧凑汇总（不按日分桶，避免日 p95 再聚合失真）。 */
export function summarizeWindow(rows: ObsSpanRow[]): WindowStats {
  let llmCalls = 0
  let llmErrors = 0
  let toolCalls = 0
  let toolFailures = 0
  let totalTokens = 0
  const ttft: number[] = []

  for (const row of rows) {
    if (row.type !== 'chunk') continue
    if (row.kind === 'llm_span') {
      if (row.phase !== 'post' && row.phase !== 'error') continue
      llmCalls += 1
      if (row.phase === 'error' || row.status === 'error') llmErrors += 1
      const u = row.usage
      if (u) {
        for (const v of [u.input_tokens, u.output_tokens, u.cache_read_tokens, u.cache_write_tokens, u.reasoning_tokens]) {
          if (Number.isFinite(v) && Number(v) > 0) totalTokens += Number(v)
        }
      }
      const t = row.first_token_ms ?? row.ttft_ms
      if (Number.isFinite(t) && Number(t) >= 0) ttft.push(Number(t))
      continue
    }
    if (row.kind === 'tool_span') {
      toolCalls += 1
      if (row.status === 'error' || row.error_message) toolFailures += 1
    }
  }

  const sorted = ttft.sort((a, b) => a - b)
  const calls = llmCalls + toolCalls
  return {
    llmCalls,
    llmErrors,
    toolCalls,
    toolFailures,
    totalTokens,
    ttftP95: percentile(sorted, 95),
    errorRate: ratio(llmErrors + toolFailures, calls),
  }
}

