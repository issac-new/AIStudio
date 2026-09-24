// overlay/tokens 域：token-meter 三投影（吸收自 deepseek-harness token-meter，第一批 #9）。
//
// 吸收锚点（docs/upstream-analysis/deepseek-harness.md §四）：
// - tokenUsage（uncachedInput/output/cacheRead/cacheWrite 四账）；
// - contextPressure（pressureTokens=最近上报 prompt、projectedTokens=下一请求预估、contextWindow）；
// - contextBreakdown（systemTokens/toolsTokens/messageTokens 启发式构成，**之和恒等 surface**）。
// StatsPills 双弹窗（TTFT/decode 台账）消费这些投影（dsh-TUI 同款消费面；前端弹窗列后续轮）。
//
// 互校（spec #9：与 zcode 既有 rounds 契约互校）：fromZcodeUsageSummary 把
// upstream/zcode packages/shared/src/usage-stats.ts UsageStatsSummary
// （inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens/reasoningTokens）映射为
// tokenUsage 并做对账（差异显式上报，绝不静默修数）。
//
// 本文件为纯函数域（无 IO）。

export interface TokenUsage {
  uncachedInput: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface AttemptUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  /** TTFT/decode 台账（逐 attempt；缺证据不伪造，见 dsh 轨迹聚合原则）。 */
  ttftMs?: number
  decodeMs?: number
}

/** 逐 attempt 精确求和（deriveTurnTokenUsage 语义：证据不全的字段不计也不估）。 */
export function deriveTokenUsage(attempts: readonly AttemptUsage[]): TokenUsage {
  const out: TokenUsage = { uncachedInput: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  for (const a of attempts) {
    const cacheRead = a.cacheReadTokens ?? 0
    const cacheWrite = a.cacheCreationTokens ?? 0
    out.cacheRead += cacheRead
    out.cacheWrite += cacheWrite
    // anthropic 口径：input 含 cache 两账；uncached = input - cache。
    out.uncachedInput += Math.max(0, a.inputTokens - cacheRead - cacheWrite)
    out.output += a.outputTokens
  }
  return out
}

export interface ContextPressure {
  /** 最近一次上报的 prompt token（压力分子）。 */
  pressureTokens: number
  /** 下一请求预估 token（含预估增量；与 pressureTokens 分开保义）。 */
  projectedTokens: number
  contextWindow: number
  /** pressure/window 与 projected/window 两档压力比（0-1+，>1 即超窗）。 */
  pressureRatio: number
  projectedRatio: number
}

export function deriveContextPressure(pressureTokens: number, projectedTokens: number, contextWindow: number): ContextPressure {
  if (!(contextWindow > 0)) throw new Error('contextWindow 必须为正')
  return {
    pressureTokens, projectedTokens, contextWindow,
    pressureRatio: pressureTokens / contextWindow,
    projectedRatio: projectedTokens / contextWindow,
  }
}

export interface ContextBreakdown {
  systemTokens: number
  toolsTokens: number
  messageTokens: number
  /** 恒等面：构成三段之和必须等于的总量（surface）。 */
  surfaceTokens: number
  /** 恒等校验结果；broken 时 UI 必须显示告警而非吞掉（dsh 契约：之和恒等 surface）。 */
  identity: { ok: boolean; sumTokens: number; delta: number }
}

export function deriveContextBreakdown(
  systemTokens: number, toolsTokens: number, messageTokens: number, surfaceTokens: number,
): ContextBreakdown {
  const sumTokens = systemTokens + toolsTokens + messageTokens
  return {
    systemTokens, toolsTokens, messageTokens, surfaceTokens,
    identity: { ok: sumTokens === surfaceTokens, sumTokens, delta: surfaceTokens - sumTokens },
  }
}

/** zcode UsageStatsSummary → tokenUsage 映射（互校入口）。 */
export function fromZcodeUsageSummary(s: {
  inputTokens: number; outputTokens: number
  cacheReadTokens?: number; cacheCreationTokens?: number; reasoningTokens?: number
}): { usage: TokenUsage; reconcile: { field: string; expected: number; actual: number }[] } {
  const cacheRead = s.cacheReadTokens ?? 0
  const cacheWrite = s.cacheCreationTokens ?? 0
  const usage: TokenUsage = {
    uncachedInput: Math.max(0, s.inputTokens - cacheRead - cacheWrite),
    output: s.outputTokens,
    cacheRead, cacheWrite,
  }
  const reconcile: { field: string; expected: number; actual: number }[] = []
  // 对账口径：zcode summary 四账加总应等于 input+output（reasoning 计入 output 侧则不破恒等；
  // 差异显式上报交由调用方裁决，绝不静默修数）。
  const sumFour = usage.uncachedInput + usage.output + usage.cacheRead + usage.cacheWrite
  const gross = s.inputTokens + s.outputTokens
  if (sumFour !== gross) {
    reconcile.push({ field: 'fourAccountsSum', expected: gross, actual: sumFour })
  }
  return { usage, reconcile }
}

/** StatsPills 口径缓存命中比（dsh formatCacheHitPercent 同义：cacheRead/(input+cacheRead)）。 */
export function cacheHitPercent(usage: TokenUsage): number | null {
  const inputGross = usage.uncachedInput + usage.cacheRead
  if (inputGross <= 0) return null
  return (usage.cacheRead / inputGross) * 100
}

/** 逐 attempt 台账（TTFT/decode；无流输出的步不伪造样本——dsh 轨迹聚合原则）。 */
export function attemptLedger(attempts: readonly AttemptUsage[]): Array<{ index: number; ttftMs: number | null; decodeMs: number | null; outputTokens: number }> {
  return attempts.map((a, index) => ({
    index,
    ttftMs: typeof a.ttftMs === 'number' && a.ttftMs > 0 ? a.ttftMs : null,
    decodeMs: typeof a.decodeMs === 'number' && a.decodeMs > 0 ? a.decodeMs : null,
    outputTokens: a.outputTokens,
  }))
}
