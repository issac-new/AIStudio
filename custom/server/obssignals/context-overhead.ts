// overlay/obssignals 域：上下文开销比（2026-11-05 AI Native 吸收批 T8）。
//
// 源问题：文章口径「上下文开销从 8:1 涨到 45:1 是最大结构性浪费」，本仓只有读取
// 次数（context-reads）与通信字符 MOR，没有「吃进去 ÷ 产出」的比值。本模块用
// trace usage 做真实 token 口径：每会话 input(含 cacheRead/cacheWrite) ÷ output。
// 口径注记：这是「请求侧上下文 ÷ 生成侧回答」的代理——工具结果字符包含在 input
// token 内；per-task 口径（÷完成任务数）待看板对账后升级。
import type { ObsSpanRow } from './signals'

export interface SessionOverhead {
  sessionId: string
  inputTokens: number
  outputTokens: number
  calls: number
  /** input/output；output=0 的会话不计入比值分布（不产生无穷大） */
  ratio: number | null
}

export interface ContextOverheadReport {
  available: boolean
  days: number
  sessions: number
  /** 排除零产出的有效会话数 */
  ratioSamples: number
  p50: number | null
  p95: number | null
  max: number | null
  /** 全体（含零产出）聚合比：Σinput ÷ Σoutput；Σoutput=0 时 null */
  aggregateRatio: number | null
  zeroOutputSessions: number
  topSessions: Array<{ sessionId: string; ratio: number; inputTokens: number; outputTokens: number }>
  notes: string[]
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  // 最近邻秩（nearest-rank）：ceil(p%·n)-1；两样本时 p50 取下中位而非上跳
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function buildContextOverhead(rows: ObsSpanRow[], opts: { days?: number } = {}): ContextOverheadReport {
  const notes: string[] = [
    '口径：每会话 Σ(input+cacheRead+cacheWrite) ÷ Σoutput_tokens（token 真值，非字符代理）；工具结果已含在 input token 内。',
    'per-task 口径（÷完成任务数）待看板对账后升级（挂账）。零产出版本会话计入 total 不计入比值分布。',
  ]
  // header 行带 session_id 但无 usage；usage 行才累计。type=header 用于会话发现。
  const acc = new Map<string, { input: number; output: number; calls: number }>()
  for (const row of rows) {
    const sid = row.session_id
    if (!sid) continue
    if (row.type === 'header') {
      if (!acc.has(sid)) acc.set(sid, { input: 0, output: 0, calls: 0 })
      continue
    }
    const u = row.usage
    if (!u) continue
    const cur = acc.get(sid) ?? { input: 0, output: 0, calls: 0 }
    const input = (u.input_tokens ?? 0) + (u.cache_read_tokens ?? 0) + (u.cache_write_tokens ?? 0)
    cur.input += input
    cur.output += u.output_tokens ?? 0
    cur.calls += 1
    acc.set(sid, cur)
  }
  if (acc.size === 0) {
    return {
      available: false, days: opts.days ?? 7, sessions: 0, ratioSamples: 0,
      p50: null, p95: null, max: null, aggregateRatio: null, zeroOutputSessions: 0,
      topSessions: [], notes: [...notes, 'trace 无会话行（目录缺席或窗口内无数据）——不猜数'],
    }
  }
  const sessions: SessionOverhead[] = [...acc.entries()].map(([sessionId, v]) => ({
    sessionId,
    inputTokens: v.input,
    outputTokens: v.output,
    calls: v.calls,
    ratio: v.output > 0 ? v.input / v.output : null,
  }))
  const ratios = sessions.filter((s) => s.ratio !== null).map((s) => s.ratio as number).sort((a, b) => a - b)
  const totalIn = sessions.reduce((a, s) => a + s.inputTokens, 0)
  const totalOut = sessions.reduce((a, s) => a + s.outputTokens, 0)
  return {
    available: true,
    days: opts.days ?? 7,
    sessions: sessions.length,
    ratioSamples: ratios.length,
    p50: percentile(ratios, 50),
    p95: percentile(ratios, 95),
    max: ratios.length > 0 ? ratios[ratios.length - 1] : null,
    aggregateRatio: totalOut > 0 ? totalIn / totalOut : null,
    zeroOutputSessions: sessions.filter((s) => s.ratio === null).length,
    topSessions: sessions
      .filter((s) => s.ratio !== null)
      .sort((a, b) => (b.ratio as number) - (a.ratio as number))
      .slice(0, 5)
      .map((s) => ({ sessionId: s.sessionId, ratio: Math.round((s.ratio as number) * 10) / 10, inputTokens: s.inputTokens, outputTokens: s.outputTokens })),
    notes,
  }
}
