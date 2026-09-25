// overlay/codesec 域：代码安全三档扫描（qoder §四 P2-8 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（代码安全三档扫描：静态/轻量语义/深度数据流）：
// - **static**：静态模式匹配（硬编码密钥/危险 API——正则级）；
// - **semantic**：轻量语义（同名函数误用/参数错位——AST 级提示）；
// - **dataflow**：深度数据流（污点传播/注入链——追踪级）。
// 档位=成本递增/深度递增；扫描计划=按风险选档（高危文件上高档）。纯判定面。
export type ScanTier = 'static' | 'semantic' | 'dataflow'

export interface SecurityFinding {
  tier: ScanTier
  severity: 'low' | 'medium' | 'high'
  file: string
  line: number
  detail: string
}

export interface ScanPlan {
  tiers: ScanTier[]
  detail: string
}

/** 文件风险→扫描计划（qoder 三档按需选——成本随深度增）。 */
export function planScan(risk: 'low' | 'medium' | 'high'): ScanPlan {
  switch (risk) {
    case 'low':
      return { tiers: ['static'], detail: '低危：静态模式匹配足够' }
    case 'medium':
      return { tiers: ['static', 'semantic'], detail: '中危：静态+轻量语义' }
    case 'high':
      return { tiers: ['static', 'semantic', 'dataflow'], detail: '高危：三档全跑（深度数据流）' }
  }
}

/** 发现分级（tier 深度决定默认 severity——dataflow 发现默认高）。 */
export function gradeFinding(partial: Omit<SecurityFinding, 'severity'> & { severity?: SecurityFinding['severity'] }): SecurityFinding {
  const defaultSeverity: SecurityFinding['severity'] =
    partial.tier === 'dataflow' ? 'high' : partial.tier === 'semantic' ? 'medium' : 'low'
  return { ...partial, severity: partial.severity ?? defaultSeverity }
}
