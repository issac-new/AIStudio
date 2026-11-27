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
 *
 * 读不到与零（2026-11-28）：某一来源缺席时它那一侧的数字是 null，不是 0——此前用 ?? 0 补齐，
 * 「读不到」与「真的是零」无法区分。交付面按完成时间过滤，与成本面同一时间窗；此前交付取全量，
 * 窗外的交付摊薄窗内的成本。用量按天查询失败时回退全量并在 windowing 里标记哪一面回退了。
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectAssigneeStats, kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import { loadPricingTable, matchPriceKey } from '../tokens/pricing'
import { collectCostAccounts } from './cost-accounts'

export interface PnlTokens { input: number | null; output: number | null; calls: number | null }

export interface PnlRow {
  profile: string
  /** 交付面：近 days 天内完成的 done+archived 件数（按完成时间）；看板库缺席时 null。 */
  delivered: number | null
  /** 在途件数（时点数，不套时间窗）；看板库缺席时 null。 */
  inFlight: number | null
  /** 成本面：token 与估算成本区间（未收录模型不计入成本、计 unpricedRows）；用量库缺席时各项为 null。 */
  tokens: PnlTokens
  costIdle: number | null
  costPeak: number | null
  unpricedRows: number
  /** 单位产出成本 = 成本 / delivered；delivered 为 0 或任一面读不到时 null（不造数）。 */
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
  /** 时间窗是否按所选天数生效（2026-11-28）。某一面按天数查询失败时回退全量，这里如实标记：
   *  回退后该面的数字是全量、不是「近 N 天」，此前回包仍只标 days，读的人无从得知。 */
  windowing: {
    tokensWindowed: boolean
    costWindowed: boolean
    dailyWindowed: boolean
    note: string
  }
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
  // 三面各自记录「按天数查询是否生效」；失败即回退全量并标记，不再各自静默处理
  const windowing = { tokensWindowed: true, costWindowed: true, dailyWindowed: true }
  /** 成本面是否算得出来。成本聚合连全表都查不了时为 false，行里的成本记 null（不是 0）。 */
  let costAvailable = true
  let db
  if (dbFile) {
    try {
      db = await openReadonly(dbFile)
      const sinceS = Math.floor((now - days * 86400000) / 1000)
      // token 面：窗口查询失败回退全表，分两级——先试带时间列的全表（保住 lastAt），
      // 再退到不带时间列的全表。此前只有一级，而那一级同样选了 created_at：列缺失时
      // 回退也失败，异常冒到接口层变成 500。
      let rows: Array<UsageRow & { created_at?: number }> = []
      try {
        rows = db.prepare('SELECT profile, api_calls, input_tokens, output_tokens, created_at FROM session_usage WHERE created_at >= ?').all(sinceS) as unknown as UsageRow[]
      } catch {
        windowing.tokensWindowed = false
        try {
          rows = db.prepare('SELECT profile, api_calls, input_tokens, output_tokens, created_at FROM session_usage').all() as unknown as UsageRow[]
        } catch {
          rows = db.prepare('SELECT profile, api_calls, input_tokens, output_tokens FROM session_usage').all() as unknown as UsageRow[]
        }
      }
      for (const r of rows) {
        const p = r.profile || 'default'
        const b = usageByProfile.get(p) ?? { input: 0, output: 0, calls: 0, costIdle: 0, costPeak: 0, unpriced: 0, lastAt: 0 }
        b.input += r.input_tokens || 0
        b.output += r.output_tokens || 0
        b.calls += r.api_calls || 0
        if ((r.created_at ?? 0) > b.lastAt) b.lastAt = r.created_at as number
        usageByProfile.set(p, b)
      }
      // 成本面单独聚合（需 model 维度配价目；本趟与 token 面分立，各自降级互不拖垮）
      try {
        const costSql = 'SELECT profile, model, SUM(input_tokens) i, SUM(output_tokens) o FROM session_usage'
        let costRows: Array<{ profile: string; model: string; i: number; o: number }>
        try {
          costRows = db.prepare(`${costSql} WHERE created_at >= ? GROUP BY profile, model`).all(sinceS) as unknown as typeof costRows
        } catch {
          // 此前这里吞掉异常、成本留在 0：有用量却显示成本 0
          windowing.costWindowed = false
          costRows = db.prepare(`${costSql} GROUP BY profile, model`).all() as unknown as typeof costRows
        }
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
      } catch {
        // 成本聚合连全表也查不了（表缺失或结构不认）：成本面整体缺席，行里记 null 而不是 0
        costAvailable = false
      }
      // 日成本序列（异常检测面）
      try {
        const daySql = 'SELECT profile, model, created_at/86400 d, SUM(input_tokens) i, SUM(output_tokens) o FROM session_usage'
        let dayRows: Array<{ profile: string; model: string; d: number; i: number; o: number }>
        try {
          dayRows = db.prepare(`${daySql} WHERE created_at >= ? GROUP BY profile, model, d`).all(sinceS) as unknown as typeof dayRows
        } catch {
          windowing.dailyWindowed = false
          dayRows = db.prepare(`${daySql} GROUP BY profile, model, d`).all() as unknown as typeof dayRows
        }
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
      } catch { /* 日序列连全表也查不了：异常面缺席 */ }
    } finally {
      try { (db as { close(): void } | undefined)?.close() } catch { /* 已关 */ }
    }
  }

  // ---- 交付面（kanban assignee 实耗） ----
  // 与成本面同一时间窗：按任务完成时间过滤（2026-11-28）。此前交付取全量而成本按 days 聚合，
  // 窗外的交付被用来摊薄窗内的成本，单位成本被低估。
  const sinceMs = now - days * 86400000
  const assigneeStats = await collectAssigneeStats(undefined, { completedFromS: Math.floor(sinceMs / 1000) })
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

  // ---- 行拼装（usage ∪ kanban 两侧并集） ----
  // 某一来源缺席时它那一侧的数字是 null，不是 0：此前 ?? 0 让「读不到」与「真的是零」无法区分，
  // 而界面注记写的是「相关列为空不是 0」。
  const usageAvailable = Boolean(dbFile)
  const profiles = new Set<string>([...usageByProfile.keys(), ...[...assigneeStats.keys()].filter((k) => k !== '(未指派)')])
  const rows: PnlRow[] = []
  for (const profile of profiles) {
    const u = usageByProfile.get(profile)
    const k = assigneeStats.get(profile)
    const delivered = kanbanAvailable ? (k?.deliveredInWindow ?? 0) : null
    const costIdle = usageAvailable && costAvailable ? (u?.costIdle ?? 0) : null
    const costPeak = usageAvailable && costAvailable ? (u?.costPeak ?? 0) : null
    const row: PnlRow = {
      profile,
      delivered,
      inFlight: kanbanAvailable ? (k?.inFlight ?? 0) : null,
      tokens: {
        input: usageAvailable ? (u?.input ?? 0) : null,
        output: usageAvailable ? (u?.output ?? 0) : null,
        calls: usageAvailable ? (u?.calls ?? 0) : null,
      },
      costIdle,
      costPeak,
      unpricedRows: usageAvailable && costAvailable ? (u?.unpriced ?? 0) : 0,
      // 单位成本要求两面都可得：成本或交付任一面读不到就不算
      costPerDeliveredIdle: delivered !== null && delivered > 0 && costIdle !== null ? costIdle / delivered : null,
      costPerDeliveredPeak: delivered !== null && delivered > 0 && costPeak !== null ? costPeak / delivered : null,
      lastActiveAt: k?.lastActiveAt ?? (u ? u.lastAt * 1000 : null),
    }
    if (valueMap[profile] !== undefined && delivered !== null) {
      row.valuePerDelivered = valueMap[profile]
      row.valueTotal = valueMap[profile] * delivered
    }
    rows.push(row)
  }
  // 按成本排序：成本读不到的行排在后面（不是当成 0 混在里面）
  const costRank = (r: PnlRow): number => (r.costPeak === null || r.costIdle === null ? -1 : r.costPeak + r.costIdle)
  rows.sort((a, b) => costRank(b) - costRank(a))

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
      usageDb: usageAvailable,
      kanban: kanbanAvailable,
      pricing: Boolean(table.models && Object.keys(table.models).length > 0),
    },
    windowing: {
      ...windowing,
      note: windowing.tokensWindowed && windowing.costWindowed && windowing.dailyWindowed
        ? '用量三面均按所选天数统计'
        : `用量按天查询失败，已回退全量：${[
            ...(windowing.tokensWindowed ? [] : ['token 面']),
            ...(windowing.costWindowed ? [] : ['成本面']),
            ...(windowing.dailyWindowed ? [] : ['日成本序列']),
          ].join('、')}的数字是全量、不是近 ${days} 天`,
    },
    _defs: {
      delivered: `近 ${days} 天内完成的 done+archived 件数（按完成时间过滤；在途是时点数不套窗）`,
      cost: 'session_usage 按 profile×model 聚合 × 价目表（idle/peak 两档区间；未收录模型入 unpricedRows 不计成本）',
      unitCost: '成本区间 / 窗内交付数；交付为 0 或成本、交付任一面读不到时为空（有花费无交付=负效率信号，不造单价）',
      value: 'HERMES_PL_VALUE_MAP（JSON env）显式配置；缺席即不呈现 L 侧',
      anomaly: `某 profile 某日 peak 成本 > 前 7 日日均 × 2（前窗零成本不计——无基线）`,
    },
  }
}
