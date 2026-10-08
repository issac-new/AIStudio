/**
 * 六文调研轮 E：AI 虚拟损益表（BCG《Agentic AI 价值公式》——把模型调用、人工复核、
 * 返工成本与业务收益放进同一张表）。
 *
 * 形态：per-profile（agent）单位产出成本表 = 成本面（session_usage×价目）× 交付面
 * （kanban done/archived），外加全局面（人工干预/返工/等待时延）与日成本异常检测。
 * 收益面：无业务收入数据源——默认如实缺席；HERMES_PL_VALUE_MAP（JSON：profile→
 * 每交付件价值，货币单位同价目表）显式配置后补齐 P&L 的 L 侧，不编造默认值。
 *
 * 数据源全部复用既有单一事实源：pricing（价目）、governance-analytics（kanban 实耗
 * /usage 聚合先例）、cost-accounts（六类账口径）。只读实取，缺席降级不猜数。
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectAssigneeStats, kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import { loadPricingTable, matchPriceKey } from '../tokens/pricing'
import { collectCostAccounts } from './cost-accounts'

export interface PnlTokens { input: number; output: number; calls: number }

export interface PnlRow {
  profile: string
  /** 交付面：kanban assignee=profile 的 done+archived 计数（窗内无映射=0 如实）。 */
  delivered: number
  inFlight: number
  /** 成本面：token 与估算成本区间（未收录模型不计入成本、计 unpricedRows）。 */
  tokens: PnlTokens
  costIdle: number
  costPeak: number
  unpricedRows: number
  /** 单位产出成本 = 成本 / delivered；delivered=0 时 null（不造数）。 */
  costPerDeliveredIdle: number | null
  costPerDeliveredPeak: number | null
  /** 收益面：HERMES_PL_VALUE_MAP 配置了该 profile 才有值。 */
  valuePerDelivered?: number
  valueTotal?: number
  lastActiveAt: number | null
}

export interface PnlAnomaly {
  profile: string
  /** 日桶（UTC yyyy-mm-dd）。 */
  day: string
  costPeak: number
  trailingMeanPeak: number
  ratio: number
  note: string
}

export interface VirtualPnlReport {
  days: number
  currency: string
  rows: PnlRow[]
  global: {
    interventions: number | null
    reworkHours: number | null
    waitP95SecondsWithinDay: number | null
  }
  anomalies: PnlAnomaly[]
  benefitNote: string
  sourcesAvailable: { usageDb: boolean; kanban: boolean; pricing: boolean }
  _defs: {
    delivered: string
    cost: string
    unitCost: string
    value: string
    anomaly: string
  }
}

interface UsageRow {
  profile: string
  api_calls: number
  input_tokens: number
  output_tokens: number
  created_at: number
}

function usageDbCandidates(explicit?: string): string[] {
  const out: string[] = []
  const push = (p: string | undefined) => { if (p && !out.includes(p)) out.push(p) }
  push(explicit?.trim() || process.env.HERMES_PL_DB?.trim())
  push(resolve(process.cwd(), 'packages/server/data/hermes-web-ui.db'))
  push(resolve(__dirname, '../../../data/hermes-web-ui.db'))
  push(resolve(__dirname, '../../../../data/hermes-web-ui.db'))
  return out
}

/** 环比异常：某 profile 某日成本 > 其前 7 日日均 × threshold（默认 2）。 */
export function detectCostAnomalies(
  daily: Array<{ profile: string; day: string; costPeak: number }>,
  trailingDays = 7,
  threshold = 2,
): PnlAnomaly[] {
  const byProfile = new Map<string, Array<{ day: string; costPeak: number }>>()
  for (const d of daily) {
    const arr = byProfile.get(d.profile) ?? []
    arr.push(d)
    byProfile.set(d.profile, arr)
  }
  const out: PnlAnomaly[] = []
  for (const [profile, arr] of byProfile) {
    arr.sort((a, b) => a.day.localeCompare(b.day))
    for (let i = trailingDays; i < arr.length; i++) {
      const trailing = arr.slice(i - trailingDays, i)
      const mean = trailing.reduce((s, v) => s + v.costPeak, 0) / trailing.length
      if (mean <= 0) continue  // 前窗零成本：首日用度不算异常（无基线）
      const ratio = arr[i].costPeak / mean
      if (ratio > threshold) {
        out.push({
          profile, day: arr[i].day, costPeak: arr[i].costPeak,
          trailingMeanPeak: mean, ratio,
          note: `日成本为前 ${trailingDays} 日均值的 ${ratio.toFixed(1)} 倍（阈值 ${threshold}×）`,
        })
      }
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio)
}

export async function buildVirtualPnl(opts?: {
  days?: number
  dbPath?: string
  now?: number
}): Promise<VirtualPnlReport> {
  const days = Math.min(Math.max(Math.round(opts?.days ?? 30), 1), 365)
  const now = opts?.now ?? Date.now()

  // ---- 成本面（usage × 价目） ----
  const table = loadPricingTable()
  const dbFile = usageDbCandidates(opts?.dbPath).find((p) => existsSync(p)) ?? null
  const usageByProfile = new Map<string, { input: number; output: number; calls: number; costIdle: number; costPeak: number; unpriced: number; lastAt: number }>()
  const dailyAgg: Array<{ profile: string; day: string; costPeak: number }> = []
  let db
  if (dbFile) {
    try {
      db = await openReadonly(dbFile)
      const sinceS = Math.floor((now - days * 86400000) / 1000)
      let rows: UsageRow[] = []
      try {
        rows = db.prepare('SELECT profile, api_calls, input_tokens, output_tokens, created_at FROM session_usage WHERE created_at >= ?').all(sinceS) as unknown as UsageRow[]
      } catch {
        rows = db.prepare('SELECT profile, api_calls, input_tokens, output_tokens, created_at FROM session_usage').all() as unknown as UsageRow[]
      }
      for (const r of rows) {
        const p = r.profile || 'default'
        const b = usageByProfile.get(p) ?? { input: 0, output: 0, calls: 0, costIdle: 0, costPeak: 0, unpriced: 0, lastAt: 0 }
        b.input += r.input_tokens || 0
        b.output += r.output_tokens || 0
        b.calls += r.api_calls || 0
        if (r.created_at > b.lastAt) b.lastAt = r.created_at
        usageByProfile.set(p, b)
      }
      // 成本面单独聚合（需 model 维度配价目；本趟与 token 面分立，各自降级互不拖垮）
      try {
        const costRows = db.prepare(
          'SELECT profile, model, SUM(input_tokens) i, SUM(output_tokens) o FROM session_usage WHERE created_at >= ? GROUP BY profile, model',
        ).all(sinceS) as unknown as Array<{ profile: string; model: string; i: number; o: number }>
        for (const cr of costRows) {
          const p = cr.profile || 'default'
          const b = usageByProfile.get(p) ?? { input: 0, output: 0, calls: 0, costIdle: 0, costPeak: 0, unpriced: 0, lastAt: 0 }
          const key = cr.model ? matchPriceKey(table, cr.model) : null
          const price = key ? table.models[key] : null
          if (price) {
            b.costIdle += (cr.i / 1e6) * price.input.idle + (cr.o / 1e6) * price.output.idle
            b.costPeak += (cr.i / 1e6) * price.input.peak + (cr.o / 1e6) * price.output.peak
          } else {
            b.unpriced += 1
          }
          usageByProfile.set(p, b)
        }
      } catch { /* 成本聚合失败：token 面仍出，成本=0 且 unpriced 不虚增 */ }
      // 日成本序列（异常检测面）
      try {
        const dayRows = db.prepare(
          'SELECT profile, model, created_at/86400 d, SUM(input_tokens) i, SUM(output_tokens) o FROM session_usage WHERE created_at >= ? GROUP BY profile, model, d',
        ).all(sinceS) as unknown as Array<{ profile: string; model: string; d: number; i: number; o: number }>
        const dayMap = new Map<string, number>()
        for (const dr of dayRows) {
          const key = dr.model ? matchPriceKey(table, dr.model) : null
          const price = key ? table.models[key] : null
          if (!price) continue
          const p = dr.profile || 'default'
          const day = new Date(dr.d * 86400000).toISOString().slice(0, 10)
          const k = `${p}|${day}`
          dayMap.set(k, (dayMap.get(k) ?? 0) + (dr.i / 1e6) * price.input.peak + (dr.o / 1e6) * price.output.peak)
        }
        for (const [k, costPeak] of dayMap) {
          const [profile, day] = k.split('|')
          dailyAgg.push({ profile, day, costPeak })
        }
      } catch { /* 日序列失败：异常面缺席 */ }
    } finally {
      try { db.close() } catch { /* 已关 */ }
    }
  }

  // ---- 交付面（kanban assignee 实耗） ----
  const assigneeStats = await collectAssigneeStats()
  const kanbanAvailable = kanbanDbFiles().length > 0

  // ---- 收益面（HERMES_PL_VALUE_MAP 显式配置才有） ----
  let valueMap: Record<string, number> = {}
  const raw = process.env.HERMES_PL_VALUE_MAP?.trim()
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') valueMap = parsed as Record<string, number>
    } catch { /* 配置坏值：按缺席处理 */ }
  }

  // ---- 行拼装（usage ∪ kanban 两侧并集；无映射如实 0） ----
  const profiles = new Set<string>([...usageByProfile.keys(), ...[...assigneeStats.keys()].filter((k) => k !== '(未指派)')])
  const rows: PnlRow[] = []
  for (const profile of profiles) {
    const u = usageByProfile.get(profile)
    const k = assigneeStats.get(profile)
    const delivered = k ? k.done + k.archived : 0
    const costIdle = u?.costIdle ?? 0
    const costPeak = u?.costPeak ?? 0
    const row: PnlRow = {
      profile,
      delivered,
      inFlight: k?.inFlight ?? 0,
      tokens: { input: u?.input ?? 0, output: u?.output ?? 0, calls: u?.calls ?? 0 },
      costIdle,
      costPeak,
      unpricedRows: u?.unpriced ?? 0,
      costPerDeliveredIdle: delivered > 0 ? costIdle / delivered : null,
      costPerDeliveredPeak: delivered > 0 ? costPeak / delivered : null,
      lastActiveAt: k?.lastActiveAt ?? (u ? u.lastAt * 1000 : null),
    }
    if (valueMap[profile] !== undefined) {
      row.valuePerDelivered = valueMap[profile]
      row.valueTotal = valueMap[profile] * delivered
    }
    rows.push(row)
  }
  rows.sort((a, b) => (b.costPeak + b.costIdle) - (a.costPeak + a.costIdle))

  // ---- 全局面（六类账取三样：人工干预/返工/等待时延 p95） ----
  const accounts = await collectCostAccounts({ days })
  const interventions = accounts.accounts.find((a) => a.key === 'humanIntervention')
  const rework = accounts.accounts.find((a) => a.key === 'rework')
  const wait = accounts.accounts.find((a) => a.key === 'waitLatency')

  return {
    days,
    currency: table.currency || 'CNY',
    rows,
    global: {
      interventions: interventions?.available ? (interventions.data as { events: number | null }).events : null,
      reworkHours: rework?.available ? (rework.data as { reworkHours: number | null }).reworkHours : null,
      waitP95SecondsWithinDay: (wait?.data as { p95SecondsWithinDay?: number | null } | undefined)?.p95SecondsWithinDay ?? null,
    },
    anomalies: detectCostAnomalies(dailyAgg),

    benefitNote: valueMap && Object.keys(valueMap).length > 0
      ? `收益面按 HERMES_PL_VALUE_MAP 配置计价（${Object.keys(valueMap).length} 个 profile）`
      : '收益面无数据源（不编造）：设 HERMES_PL_VALUE_MAP（JSON：profile→每交付件价值）补齐 P&L 的 L 侧；未配置时本表为"单位产出成本"视图',
    sourcesAvailable: {
      usageDb: Boolean(dbFile),
      kanban: kanbanAvailable,
      pricing: Boolean(table.models && Object.keys(table.models).length > 0),
    },
    _defs: {
      delivered: 'kanban assignee=profile 的 done+archived 计数（近窗全量，非按 days 过滤——kanban 实耗无窗过滤先例）',
      cost: 'session_usage 按 profile×model 聚合 × 价目表（idle/peak 两档区间；未收录模型入 unpricedRows 不计成本）',
      unitCost: '成本区间 / delivered；delivered=0 时 null（有花费无交付=负效率信号，不造单价）',
      value: 'HERMES_PL_VALUE_MAP（JSON env）显式配置；缺席即不呈现 L 侧',
      anomaly: `某 profile 某日 peak 成本 > 前 7 日日均 × 2（前窗零成本不计——无基线）`,
    },
  }
}
