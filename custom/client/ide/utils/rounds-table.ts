// overlay：每轮 rounds 表投影（zcode §七 #1 G8 待排期项，dsh rounds 契约吸收）。
//
// 语义（deepseek-harness rounds 表 + dsh StatsPills 时间与速度弹窗）：会话的
// **逐轮台账**——每轮一行：模型/输入输出 token/缓存/耗时/TTFT/费用（可选接 pricing）。
// 与 turn-outline（导航轮廓）分工：本表管"每轮花多少"，轮廓管"每轮干什么"。
// 纯投影：轮事件→表行；费用列接 pricing.ts（未收录模型=null 不显示，三原则）。
export interface RoundRow {
  roundIndex: number
  model: string | null
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  durationMs: number
  ttftMs: number | null
  /** 未收录模型=null（UI 不渲染金额——dsh 原则 3）。 */
  costIdle: number | null
  costPeak: number | null
}

export interface RoundEvent {
  kind: 'round'
  at: number
  model?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  durationMs?: number
  ttftMs?: number
}

export type CostFn = (model: string, usage: { uncachedInput: number; output: number; cacheRead: number; cacheWrite: number }) =>
  { idleCost: number; peakCost: number } | null

/** 逐轮事件→台账（费用列经 costFn；无 costFn 或未收录=null 不显示）。 */
export function buildRoundsTable(events: readonly RoundEvent[], costFn?: CostFn): RoundRow[] {
  return events
    .filter((e) => e.kind === 'round')
    .sort((a, b) => a.at - b.at)
    .map((e, i) => {
      const input = e.inputTokens ?? 0
      const cacheRead = e.cacheReadTokens ?? 0
      const output = e.outputTokens ?? 0
      const cost = e.model && costFn
        ? costFn(e.model, { uncachedInput: Math.max(0, input - cacheRead), output, cacheRead, cacheWrite: 0 })
        : null
      return {
        roundIndex: i,
        model: e.model ?? null,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        durationMs: e.durationMs ?? 0,
        ttftMs: typeof e.ttftMs === 'number' && e.ttftMs > 0 ? e.ttftMs : null,
        costIdle: cost ? cost.idleCost : null,
        costPeak: cost ? cost.peakCost : null,
      }
    })
}

/** 台账合计（表尾汇总行：总 token/总耗时/总费用——费用全 null 时合计 null）。 */
export function roundsSummary(rows: readonly RoundRow[]): { rounds: number; totalTokens: number; totalMs: number; totalCostIdle: number | null; totalCostPeak: number | null } {
  const costs = rows.map((r) => r.costIdle).filter((c): c is number => typeof c === 'number')
  const peaks = rows.map((r) => r.costPeak).filter((c): c is number => typeof c === 'number')
  return {
    rounds: rows.length,
    totalTokens: rows.reduce((s, r) => s + r.inputTokens + r.outputTokens + r.cacheReadTokens, 0),
    totalMs: rows.reduce((s, r) => s + r.durationMs, 0),
    totalCostIdle: costs.length === rows.length && rows.length > 0 ? costs.reduce((s, c) => s + c, 0) : null,
    totalCostPeak: peaks.length === rows.length && rows.length > 0 ? peaks.reduce((s, c) => s + c, 0) : null,
  }
}
