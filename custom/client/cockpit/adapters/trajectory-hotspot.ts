// overlay：trajectory hotspot 聚合（dsh-TUI §四 P2 吸收，矩阵 §3.8 dsh P2）。
//
// dsh 语义（trajectory aggregate.ts：按工具/按阶段排名——decode vs TTFT vs 重试退避，
// own-duration-only 防父子重复计数）："时间去哪了"——热点排名回答哪类操作最耗时。
// 扩展自 run-trace-timing（事件→总分解）：本模块=排名视图（工具名/阶段→top N）。
export interface HotspotEvent {
  kind: 'tool' | 'llm'
  name: string
  durationMs: number
  /** 父步归属（own-duration：子步不计，防重复计数）。 */
  parentOf?: string
  /** LLM 阶段分解（dsh 三阶段：ttft/decode/retry）。 */
  phase?: 'ttft' | 'decode' | 'retry'
}

export interface HotspotEntry {
  key: string
  totalMs: number
  count: number
  avgMs: number
}

export interface HotspotReport {
  /** 按工具名排名（own-duration 合计降序 top N）。 */
  byTool: HotspotEntry[]
  /** 按 LLM 阶段排名（ttft/decode/retry）。 */
  byPhase: HotspotEntry[]
}

function rank(entries: Iterable<[string, { ms: number; n: number }]>, top: number): HotspotEntry[] {
  return [...entries.entries()]
    .map(([key, v]) => ({ key, totalMs: v.ms, count: v.n, avgMs: Math.round(v.ms / Math.max(1, v.n)) }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, top)
}

/** 事件→热点排名（own-duration：parentOf 子步不计）。 */
export function buildHotspots(events: readonly HotspotEvent[], top = 5): HotspotReport {
  const byTool = new Map<string, { ms: number; n: number }>()
  const byPhase = new Map<string, { ms: number; n: number }>()
  for (const e of events) {
    if (e.parentOf) continue  // own-duration-only
    if (e.kind === 'tool') {
      const t = byTool.get(e.name) ?? { ms: 0, n: 0 }
      t.ms += e.durationMs
      t.n += 1
      byTool.set(e.name, t)
    } else if (e.phase) {
      const p = byPhase.get(e.phase) ?? { ms: 0, n: 0 }
      p.ms += e.durationMs
      p.n += 1
      byPhase.set(e.phase, p)
    }
  }
  return { byTool: rank(byTool, top), byPhase: rank(byPhase, top) }
}
