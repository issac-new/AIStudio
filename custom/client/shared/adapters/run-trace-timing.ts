// overlay：RunTrace timing overview（dsh-TUI T6 / deepseek-harness §十 P1-8 吸收，矩阵 §3.8）。
//
// dsh 语义（trajectory aggregate.ts + StatsPills 时间与速度弹窗）：事件时序图=
// 每 run 的 **llm/tool 耗时分解 + TTFT 台账**（own-duration-only 防父子重复计数、
// 无流输出的步不伪造 TTFT 样本）。本模块=纯投影：run-trace 事件列表 → timing
// overview（总分解+每步时序行），只读聚合不落盘。
export interface TimingEvent {
  kind: 'llm' | 'tool'
  name: string
  at: number
  durationMs: number
  ttftMs?: number
  /** 父步归属（own-duration-only：子步计入父时自身不重复计总）。 */
  parentOf?: string
  outputTokens?: number
}

export interface TimingStep {
  index: number
  kind: 'llm' | 'tool'
  name: string
  at: number
  durationMs: number
  ttftMs: number | null
  decodeMs: number | null
  outputTokens: number | null
}

export interface TimingOverview {
  totalMs: number
  llmMs: number
  toolMs: number
  /** TTFT 台账（仅采信真实样本；无流步=null 不伪造）。 */
  ttftSamplesMs: number[]
  toolCalls: number
  llmCalls: number
  steps: TimingStep[]
}

/** 事件→时序概览（own-duration：有 parentOf 的子步不计总，防父子双计——dsh 纪律）。 */
export function buildTimingOverview(events: readonly TimingEvent[]): TimingOverview {
  const owned = events.filter((e) => !e.parentOf)  // own-duration-only
  const steps: TimingStep[] = owned
    .slice()
    .sort((a, b) => a.at - b.at)
    .map((e, index) => ({
      index,
      kind: e.kind,
      name: e.name,
      at: e.at,
      durationMs: e.durationMs,
      ttftMs: typeof e.ttftMs === 'number' && e.ttftMs > 0 ? e.ttftMs : null,
      decodeMs: typeof e.ttftMs === 'number' && e.durationMs > e.ttftMs ? e.durationMs - e.ttftMs : null,
      outputTokens: typeof e.outputTokens === 'number' ? e.outputTokens : null,
    }))
  return {
    totalMs: owned.reduce((s, e) => s + e.durationMs, 0),
    llmMs: owned.filter((e) => e.kind === 'llm').reduce((s, e) => s + e.durationMs, 0),
    toolMs: owned.filter((e) => e.kind === 'tool').reduce((s, e) => s + e.durationMs, 0),
    ttftSamplesMs: steps.filter((s) => s.ttftMs !== null).map((s) => s.ttftMs as number),
    toolCalls: owned.filter((e) => e.kind === 'tool').length,
    llmCalls: owned.filter((e) => e.kind === 'llm').length,
    steps,
  }
}

/** 输出速度（decode tokens/s；仅有效 decode 样本参与，空样本不计）。 */
export function outputTps(overview: TimingOverview): number | null {
  const samples = overview.steps.filter((s) => s.decodeMs && s.decodeMs > 0 && (s.outputTokens ?? 0) > 0)
  if (!samples.length) return null
  const tokens = samples.reduce((s, x) => s + (x.outputTokens ?? 0), 0)
  const ms = samples.reduce((s, x) => s + (x.decodeMs as number), 0)
  return ms > 0 ? Math.round((tokens / ms) * 1000 * 10) / 10 : null
}
