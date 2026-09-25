// overlay：ThreadUsage 成本分组（codex §四 P2 吸收，矩阵 §3.8 codex P2）。
//
// codex 语义（ThreadUsage 按 (model,effort) 成本分组 + 连续天数/日桶）：会话用量
// 不只看总量，按**模型×推理档**分组记账（同模型不同 effort 单价不同），日桶
// 趋势可查。衔接 rounds-table（逐轮）与 usage-ledger（逐日）：本表管"哪类花了多少"。
export interface UsageSample {
  model: string
  effort?: string
  tokens: number
  day: string
}

export interface UsageGroup {
  key: string
  model: string
  effort: string
  tokens: number
  turns: number
}

export interface ThreadUsageBreakdown {
  groups: UsageGroup[]
  /** 日桶（day→tokens，升序）。 */
  daily: Array<{ day: string; tokens: number }>
  totalTokens: number
}

/** 样本→(model,effort) 分组+日桶（组按 token 降序）。 */
export function buildThreadUsage(samples: readonly UsageSample[]): ThreadUsageBreakdown {
  const byGroup = new Map<string, UsageGroup>()
  const byDay = new Map<string, number>()
  for (const s of samples) {
    const effort = s.effort ?? 'default'
    const key = `${s.model}·${effort}`
    const g = byGroup.get(key) ?? { key, model: s.model, effort, tokens: 0, turns: 0 }
    g.tokens += s.tokens
    g.turns += 1
    byGroup.set(key, g)
    byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.tokens)
  }
  return {
    groups: [...byGroup.values()].sort((a, b) => b.tokens - a.tokens),
    daily: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, tokens]) => ({ day, tokens })),
    totalTokens: samples.reduce((s, x) => s + x.tokens, 0),
  }
}
