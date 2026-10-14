// overlay[optadvice] 建议报告聚合（A 项，2026-10-14 阿里调研轮）。
// 半自动挡三张 Top-N 清单的数据形状与纯聚合：烧钱会话/瓶颈阶段/关卡拦截——
// 数据全在既有面（studio db sessions、看板 task_events），不新增采集面；
// 源缺席如实 available:false，不造数（eval 诚实缺席同纪律）。

export interface SessionUsageRow {
  id: string
  title: string | null
  model: string
  lastActive: number | null
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number | null
}

export interface GateErrorRow {
  taskId: string
  kind: string
  gate: string
  reason: string
  detail: string
  at: number
}

export interface SourceStatus {
  id: string
  available: boolean
  note?: string
}

export interface AdviceReport {
  generatedAt: string
  windowDays: number
  sources: SourceStatus[]
  /** 烧钱会话 Top-N（token 合计降序） */
  tokenTop: SessionUsageRow[]
  /** 瓶颈阶段 Top-N（由 waterfall 派生，服务层拼装） */
  slowStages: import('./leadtime').StageStat[]
  /** 关卡拦截 Top-N（gate:reason 计数降序） */
  gateErrorTop: Array<{ key: string; gate: string; reason: string; count: number; lastAt: number; sample: string }>
  waterfall: import('./leadtime').Waterfall | null
}

export function topSessions(rows: SessionUsageRow[], limit = 5): SessionUsageRow[] {
  return [...rows].sort((a, b) => b.totalTokens - a.totalTokens || a.id.localeCompare(b.id)).slice(0, limit)
}

/** gate_blocked/gate_warning 事件 → 失败闸结果行（payload.results !ok 项展开）。 */
export function gateErrorRowsFromEvents(
  events: Array<{ taskId: string; kind: string; payload: unknown; at: number }>,
): GateErrorRow[] {
  const rows: GateErrorRow[] = []
  for (const ev of events) {
    if (ev.kind !== 'gate_blocked' && ev.kind !== 'gate_warning') continue
    let payload: { results?: Array<{ gate?: string; ok?: boolean; reason?: string; detail?: string }> } = {}
    try {
      payload = typeof ev.payload === 'string' ? JSON.parse(ev.payload) : (ev.payload as never) ?? {}
    } catch {
      continue
    }
    for (const r of payload.results ?? []) {
      if (r && r.ok === false) {
        rows.push({
          taskId: ev.taskId,
          kind: ev.kind,
          gate: String(r.gate ?? 'unknown'),
          reason: String(r.reason ?? 'unknown'),
          detail: String(r.detail ?? '').slice(0, 200),
          at: ev.at,
        })
      }
    }
  }
  return rows
}

export function topGateErrors(rows: GateErrorRow[], limit = 5): AdviceReport['gateErrorTop'] {
  const groups = new Map<string, { gate: string; reason: string; count: number; lastAt: number; sample: string }>()
  for (const r of rows) {
    const key = `${r.gate}:${r.reason}`
    const g = groups.get(key) ?? { gate: r.gate, reason: r.reason, count: 0, lastAt: 0, sample: r.detail }
    g.count += 1
    if (r.at >= g.lastAt) {
      g.lastAt = r.at
      if (r.detail) g.sample = r.detail
    }
    groups.set(key, g)
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, ...g }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit)
}
