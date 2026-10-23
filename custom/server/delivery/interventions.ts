// overlay[delivery]: 介入归因账本纯函数（2026-10-23 天猫数字员工两文吸收轮）。
// 文章口径（实践篇 §5.1）：人工介入按「协作层/交付层」分账，归因六类
// （提出需求/补充上下文/催进度/解决卡点/拍板确认/纠错返工）+ 两类风险信号
// （上下文缺失/理解偏差）；计划内确认计入轮次但不判「非自主」——本模块只
// 观测归因，不做 KPI（D7）。
// 数据源映射（spec 2026-10-23-tmall-digital-worker-absorption.md D1-D3）：
//   compensation-ledger.tsv：dispatch-preset(带 from=人)→首条=提出需求、后续=补充上下文；
//     nudge→催进度；card-backfill/card-walk-done→解决卡点；auto-approve→不计介入（meta 单列）
//   release-gate.jsonl：decision approve/release→拍板确认、reject→纠错返工（submit 不计）
//   uat-verdicts.jsonl：verdict pass/conditional→拍板确认、reject→纠错返工

/** 介入分账层：collab=协作层（派发/澄清/评审），delivery=交付层（执行链内） */
export type InterventionLayer = 'collab' | 'delivery'

/** 归因六类（对齐文章打标词表；值域稳定供 UI/统计消费） */
export type InterventionType =
  | 'raise'      // 提出需求
  | 'context'    // 补充上下文
  | 'nudge'      // 催进度
  | 'unblock'    // 解决卡点
  | 'confirm'    // 拍板确认
  | 'rework'     // 纠错返工

export const INTERVENTION_TYPE_LABELS: Record<InterventionType, string> = {
  raise: '提出需求',
  context: '补充上下文',
  nudge: '催进度',
  unblock: '解决卡点',
  confirm: '拍板确认',
  rework: '纠错返工',
}

export interface InterventionEntry {
  /** epoch 毫秒；解析失败为 0（排序沉底，不丢弃条目） */
  ts: number
  actor: string
  layer: InterventionLayer
  type: InterventionType
  source: 'compensation-ledger' | 'release-gate' | 'uat-verdicts'
  run: string
  /** 摘要（已截断） */
  snippet: string
  /** 可回查锚点：台账行 id / jsonl 时间戳 */
  anchor: string
}

/** compensation-ledger.tsv 轻量行（列头 id ts type defect detail status resolution） */
export interface LedgerLiteRow {
  id: string
  ts: string
  type: string
  defect: string
  detail: string
}

/** 台账 TSV 文本 → 轻量行（表行跳过；列数不足如实截断，不炸） */
export function parseLedgerTsv(text: string): LedgerLiteRow[] {
  const out: LedgerLiteRow[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('id\t') || !t.includes('\t')) continue
    const cols = t.split('\t')
    if (cols.length < 5) continue
    out.push({ id: cols[0], ts: cols[1], type: cols[2], defect: cols[3], detail: cols.slice(4).join('\t') })
  }
  return out
}

/** 台账本地时间串（2026-10-21 10:08:37）→ epoch 毫秒；解析失败 0 */
export function ledgerTsToMs(ts: string): number {
  const norm = ts.trim().replace(' ', 'T')
  const v = Date.parse(norm)
  return Number.isFinite(v) ? v : 0
}

function clip(text: string, max: number): string {
  const t = (text ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/** dispatch-preset detail 字段解析：from=<人> text=<原话>（纯函数，测试面） */
export function parseDispatchDetail(detail: string): { from: string | null; text: string } {
  const from = /^from=(\S+)/.exec(detail)?.[1] ?? null
  const text = / text=(.*)$/s.exec(detail)?.[1] ?? detail
  return { from, text: text.trim() }
}

/** 台账行 → 介入条目（纯函数）。
 *  dispatch-preset 按 (run, defect) 去重定序：带 from 的首条=提出需求，其余=补充上下文；
 *  auto-approve 不产介入条目（调用方汇总进 meta）。 */
export function interventionsFromLedger(rows: LedgerLiteRow[], run: string): { entries: InterventionEntry[]; autoApprove: number } {
  const entries: InterventionEntry[] = []
  let autoApprove = 0
  const seenDefect = new Set<string>()
  for (const row of rows) {
    const base = { run, source: 'compensation-ledger' as const, anchor: row.id, ts: ledgerTsToMs(row.ts) }
    if (row.type === 'dispatch-preset') {
      const { from, text } = parseDispatchDetail(row.detail)
      const key = `${run}#${row.defect || '-'}#${from ?? 'system'}`
      const first = !seenDefect.has(key)
      seenDefect.add(key)
      entries.push({
        ...base,
        actor: from ?? 'system',
        layer: 'collab',
        type: from && first ? 'raise' : 'context',
        snippet: clip(text, 120) || `dispatch ${row.defect}`,
      })
    } else if (row.type === 'nudge') {
      const agents = /agents=(\S+)/.exec(row.detail)?.[1] ?? ''
      const desc = / desc=(.*)$/s.exec(row.detail)?.[1] ?? row.detail
      entries.push({ ...base, actor: 'director', layer: 'delivery', type: 'nudge', snippet: clip(desc, 120) || `nudge ${agents}` })
    } else if (row.type === 'card-backfill' || row.type === 'card-walk-done') {
      entries.push({ ...base, actor: 'system', layer: 'delivery', type: 'unblock', snippet: clip(row.detail, 120) || row.type })
    } else if (row.type === 'auto-approve') {
      autoApprove += 1
    }
  }
  return { entries, autoApprove }
}

/** release-gate.jsonl 单行解析容错：action 与 decision 字段都认（历史两形态） */
export function gateDecisionOf(raw: string): { decision: string; actor: string; ts: number } | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const decision = String(obj.action ?? obj.decision ?? '').trim()
    if (!decision) return null
    const ts = Date.parse(String(obj.ts ?? ''))
    return { decision, actor: String(obj.actor ?? 'unknown'), ts: Number.isFinite(ts) ? ts : 0 }
  } catch {
    return null
  }
}

/** release-gate.jsonl → 介入条目：approve/release=拍板确认、reject=纠错返工；submit 不计 */
export function interventionsFromReleaseGate(lines: string[], run: string): InterventionEntry[] {
  const out: InterventionEntry[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    const g = gateDecisionOf(t)
    if (!g) continue
    if (g.decision === 'approve' || g.decision === 'release') {
      out.push({ ts: g.ts, actor: g.actor, layer: 'delivery', type: 'confirm', source: 'release-gate', run, snippet: 'G5 发布门判定通过', anchor: `release-gate@${g.ts}` })
    } else if (g.decision === 'reject') {
      out.push({ ts: g.ts, actor: g.actor, layer: 'delivery', type: 'rework', source: 'release-gate', run, snippet: 'G5 发布门打回', anchor: `release-gate@${g.ts}` })
    }
  }
  return out
}

export interface UatVerdictLite { ac: string; verdict: string; actor: string; ts: number }

/** uat-verdicts.jsonl → 介入条目：pass/conditional=拍板确认（验收）、reject=纠错返工 */
export function interventionsFromUatVerdicts(verdicts: UatVerdictLite[], run: string): InterventionEntry[] {
  const out: InterventionEntry[] = []
  for (const v of verdicts) {
    if (v.verdict === 'reject') {
      out.push({ ts: v.ts, actor: v.actor, layer: 'delivery', type: 'rework', source: 'uat-verdicts', run, snippet: `UAT ${v.ac} 打回`, anchor: `uat@${v.ac}@${v.ts}` })
    } else if (v.verdict === 'pass' || v.verdict === 'conditional') {
      out.push({ ts: v.ts, actor: v.actor, layer: 'delivery', type: 'confirm', source: 'uat-verdicts', run, snippet: `UAT ${v.ac} ${v.verdict === 'pass' ? '通过' : '有条件通过'}`, anchor: `uat@${v.ac}@${v.ts}` })
    }
  }
  return out
}

export interface InterventionStats {
  total: number
  byType: Record<InterventionType, number>
  byLayer: Record<InterventionLayer, number>
  /** 参与轮次最多的前 5 个 actor（含 system/director——机械账，不做身份裁断） */
  topActors: Array<{ actor: string; count: number }>
}

export function interventionStats(entries: InterventionEntry[]): InterventionStats {
  const byType: Record<InterventionType, number> = { raise: 0, context: 0, nudge: 0, unblock: 0, confirm: 0, rework: 0 }
  const byLayer: Record<InterventionLayer, number> = { collab: 0, delivery: 0 }
  const byActor = new Map<string, number>()
  for (const e of entries) {
    byType[e.type] += 1
    byLayer[e.layer] += 1
    byActor.set(e.actor, (byActor.get(e.actor) ?? 0) + 1)
  }
  const topActors = [...byActor.entries()]
    .map(([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count || a.actor.localeCompare(b.actor))
    .slice(0, 5)
  return { total: entries.length, byType, byLayer, topActors }
}

export interface RiskSignal {
  id: 'context-gap' | 'misunderstanding'
  label: string
  hit: boolean
  note: string
}

/** 风险信号（D7 阈值）：补充上下文占比≥40% 且总量≥5=上下文缺失；纠错返工≥3=理解偏差。
 *  只观测不执法；未命中时 note 给出实际读数，便于人复核阈值。 */
export function riskSignals(entries: InterventionEntry[]): RiskSignal[] {
  const s = interventionStats(entries)
  const contextRatio = s.total ? s.byType.context / s.total : 0
  return [
    {
      id: 'context-gap',
      label: '上下文缺失',
      hit: s.total >= 5 && contextRatio >= 0.4,
      note: `补充上下文 ${s.byType.context}/${s.total}（${Math.round(contextRatio * 100)}%）`,
    },
    {
      id: 'misunderstanding',
      label: '理解偏差',
      hit: s.byType.rework >= 3,
      note: `纠错返工 ${s.byType.rework} 次`,
    },
  ]
}
