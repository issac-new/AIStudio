// overlay/eval：失败分类 canonical 词表（2026-11-12 ai-agent-handbook 吸收）。
//
// 现状两套并行：eval 六类 BadCaseRootCause（risk_violation/action_loop/...）与
// swarm-yuan failure-taxonomy 六类（ENV/TIMEOUT/PRODUCT/SCRIPT/FLOW/UNKNOWN）。
// 本模块只增不改：canonical 作为跨域对账键，旧 rootCause 联合与旧台账值原样保留。
//
// 归因顺序沿用手册第 17 章：先环境、再 Harness、最后模型。canonical 的 ENV/TIMEOUT
// 属于执行环境；PRODUCT/SCRIPT/FLOW 属于 Harness/产品；UNKNOWN 不猜；FLAKY 归人工。

export const CANONICAL_FAILURE_CATEGORIES = [
  'ENV', 'TIMEOUT', 'PRODUCT', 'SCRIPT', 'FLOW', 'UNKNOWN', 'FLAKY',
] as const

export type CanonicalFailureCategory = typeof CANONICAL_FAILURE_CATEGORIES[number]

export const CANONICAL_LABELS: Record<CanonicalFailureCategory, string> = {
  ENV: '环境/依赖不可用',
  TIMEOUT: '超时/预算耗尽',
  PRODUCT: '产品行为错误',
  SCRIPT: '脚本/命令失败',
  FLOW: '流程/编排缺陷',
  UNKNOWN: '无法判定',
  FLAKY: '不稳定（需人工）',
}

/** eval 六类 → canonical。risk_violation 是产品红线，归 PRODUCT；两轨迹类归 FLOW。 */
export function canonicalOfBadCase(rootCause: string): CanonicalFailureCategory {
  switch (rootCause) {
    case 'risk_violation': return 'PRODUCT'
    case 'action_loop': return 'PRODUCT'
    case 'budget_exhausted': return 'TIMEOUT'
    case 'outcome_mismatch': return 'PRODUCT'
    case 'trajectory_defect': return 'FLOW'
    case 'result_defect': return 'FLOW'
    default: return 'UNKNOWN'
  }
}

/** swarm-yuan 词表已是 canonical 子集；未知值不猜。 */
export function canonicalOfSwarmCategory(category: string): CanonicalFailureCategory {
  const value = category.trim().toUpperCase()
  return (CANONICAL_FAILURE_CATEGORIES as readonly string[]).includes(value)
    ? value as CanonicalFailureCategory
    : 'UNKNOWN'
}
