// overlay：用量台账投影（zcode §七 #8 G7 待排期项，zcode usage-stats 契约吸收）。
//
// 语义（zcode shared/usage-stats.ts UsageStatsSummary + dsh /usage 弹窗）：
// 逐日用量事件→日序列（含空日补 0）+ 峰值日 + 连续活跃天数 + 日桶分组。
// 面板数据面（IdeMetricsPopover 用量面板升级）消费；纯投影只读。
export interface DailyUsage {
  /** YYYY-MM-DD（本地日界归一由调用方给定 dayKey）。 */
  day: string
  tokens: number
  turns: number
}

export interface UsageLedger {
  /** 日序列（按日升序，空日补 0——zcode "空白日期会补 0，供趋势图直接使用"）。 */
  daily: Array<DailyUsage>
  /** 峰值日（tokens 最高；并列取更晚）。 */
  peakDay: { day: string; tokens: number } | null
  /** 连续活跃天数（当前 streak：从最新活跃日往前数）。 */
  currentStreakDays: number
  activeDays: number
  totalTokens: number
}

export interface UsageEvent {
  day: string
  tokens: number
  turns?: number
}

/** 事件→台账（按 day 聚合；空日补 0；streak 从最新活跃日往前连数）。 */
export function buildUsageLedger(events: readonly UsageEvent[], opts: { fillDays?: boolean } = {}): UsageLedger {
  const byDay = new Map<string, { tokens: number; turns: number }>()
  for (const e of events) {
    const cur = byDay.get(e.day) ?? { tokens: 0, turns: 0 }
    cur.tokens += e.tokens
    cur.turns += e.turns ?? 0
    byDay.set(e.day, cur)
  }
  const days = [...byDay.keys()].sort()
  const daily: DailyUsage[] = []
  if (opts.fillDays && days.length >= 2) {
    const first = new Date(days[0] + 'T00:00:00Z')
    const last = new Date(days[days.length - 1] + 'T00:00:00Z')
    for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      const v = byDay.get(key)
      daily.push({ day: key, tokens: v?.tokens ?? 0, turns: v?.turns ?? 0 })
    }
  } else {
    for (const day of days) {
      const v = byDay.get(day)!
      daily.push({ day, tokens: v.tokens, turns: v.turns })
    }
  }
  let peakDay: UsageLedger['peakDay'] = null
  for (const d of daily) {
    if (!peakDay || d.tokens > peakDay.tokens || (d.tokens === peakDay.tokens && d.day > peakDay.day)) {
      peakDay = { day: d.day, tokens: d.tokens }
    }
  }
  // streak：从最新日往前，活跃（tokens>0）连续计数；遇 0 断。
  const rev = [...daily].reverse()
  let streak = 0
  for (const d of rev) {
    if (d.tokens > 0) streak += 1
    else break
  }
  return {
    daily,
    peakDay,
    currentStreakDays: streak,
    activeDays: daily.filter((d) => d.tokens > 0).length,
    totalTokens: daily.reduce((s, d) => s + d.tokens, 0),
  }
}
