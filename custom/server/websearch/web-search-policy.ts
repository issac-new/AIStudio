// overlay/websearch 域：web_search 四档+域收敛（codex §二轮 C 表 P2 吸收，矩阵 §3.8 codex P2）。
//
// codex 语义（web_search 四档 + restrict_to 交集收敛）：
// - **四档**：off（禁搜）/ light（仅摘录）/ full（完整搜索）/ agent（模型自决）；
// - **restrict_to**：搜索域白名单（交集收敛——多来源的域取交集才可信）。
// 纯策略判定面：档位→是否可搜/结果消费方式；域白名单→交集收敛。
export const SEARCH_TIERS = ['off', 'light', 'full', 'agent'] as const
export type SearchTier = (typeof SEARCH_TIERS)[number]

export interface SearchPolicy {
  tier: SearchTier
  /** 域白名单（交集收敛来源）；空=不限域。 */
  restrictTo: string[]
}

export interface SearchVerdict {
  allowed: boolean
  /** 结果消费方式（light=仅摘录/其余=完整）。 */
  consumption: 'excerpt-only' | 'full'
  detail: string
}

/** 档位→搜索判定（agent 档视为 full+自决提示）。 */
export function searchVerdict(tier: SearchTier): SearchVerdict {
  switch (tier) {
    case 'off':
      return { allowed: false, consumption: 'excerpt-only', detail: '搜索关闭（off 档）' }
    case 'light':
      return { allowed: true, consumption: 'excerpt-only', detail: '仅摘录消费（light 档）' }
    case 'full':
      return { allowed: true, consumption: 'full', detail: '完整搜索（full 档）' }
    case 'agent':
      return { allowed: true, consumption: 'full', detail: '模型自决（agent 档）' }
  }
}

/** 域交集收敛（restrict_to 语义：多来源白名单取交集——交集外域名不信）。 */
export function convergeDomains(sources: string[][]): string[] {
  if (sources.length === 0) return []
  const [first, ...rest] = sources
  return first.filter((d) => rest.every((s) => s.includes(d))).sort()
}

/** URL 域准入（restrict_to 白名单判定；空名单=全放行）。 */
export function domainAllowed(url: string, restrictTo: readonly string[]): boolean {
  if (restrictTo.length === 0) return true
  const host = url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase()
  return restrictTo.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))
}
