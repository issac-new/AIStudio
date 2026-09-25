// overlay/harnesshealth 域：工作台体检（qoder §四 P1-6 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（Better Harness 式工作台体检：资产扫描五维报告+优化卡）：工作台资产
// 五维体检——**rules/记忆/技能/MCP/自动化** 五维（各自数量与健康），体检报告+
// 优化卡（哪维欠什么）。纯评估面：资产清单→五维评分+优化建议。
export type HealthDimension = 'rules' | 'memory' | 'skills' | 'mcp' | 'automations'

export interface AssetFacts {
  /** 五维资产数（各维清单数）。 */
  counts: Record<HealthDimension, number>
  /** 各维健康（有无损坏配置——调用方给）。 */
  broken: Record<HealthDimension, number>
}

export interface DimensionHealth {
  dimension: HealthDimension
  score: 'good' | 'fair' | 'poor'
  detail: string
}

export interface HarnessReport {
  dimensions: DimensionHealth[]
  /** 优化卡（poor/fair 维的建议——qoder 优化卡语义）。 */
  optimizationCards: Array<{ dimension: HealthDimension; suggestion: string }>
}

const SUGGESTIONS: Record<HealthDimension, string> = {
  rules: '规则体系欠账：补项目约定规则（qoder 四型作用域）',
  memory: '记忆欠账：沉淀偏好/教训（memory-taxonomy 四类型）',
  skills: '技能欠账：常用流程技能化（skills-ledger 合并口径）',
  mcp: 'MCP 欠账：补高频工具接入（mcp-config 三选一）',
  automations: '自动化欠账：重复性操作定时化（autosched）',
}

/** 五维体检（0 维资产=poor；有损坏=fair；余 good）。 */
export function harnessReport(facts: AssetFacts): HarnessReport {
  const dimensions: DimensionHealth[] = (Object.keys(facts.counts) as HealthDimension[])
    .map((d) => {
      const count = facts.counts[d]
      const broken = facts.broken[d] ?? 0
      const score = count === 0 ? 'poor' : broken > 0 ? 'fair' : 'good'
      return { dimension: d, score, detail: `${count} 项${broken > 0 ? `（${broken} 损坏）` : ''}` }
    })
  return {
    dimensions,
    optimizationCards: dimensions
      .filter((d) => d.score !== 'good')
      .map((d) => ({ dimension: d.dimension, suggestion: SUGGESTIONS[d.dimension] })),
  }
}
