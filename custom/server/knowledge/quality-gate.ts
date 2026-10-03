/**
 * KG 质量门禁（A5，动态本体三部曲③校准落地 2026-10-03）。
 *
 * 源文③的判定=合并前后对比覆盖率（after ≥ before 才放行；其 CompetencyQuestions
 * 纯英文关键词子串匹配两大坑——中文恒 0/短类名永不命中——对本栈不适用：我们的
 * 指标直接从板 KG JSON 结构计算，不经关键词匹配）。
 *
 * 本栈指标（board KG=任务协作事实层，非 OWL 本体，按结构语义对齐）：
 * - coverage：图中 task 实体数 / 板库 eligible（done+archived）任务数——摄取完整度，
 *   即"这份图谱能回答『哪些任务结案了』"的胜任力对齐物；
 * - orphanRate：无任何边的节点占比（信息性指标，不参与门禁——无 assignee 的任务
 *   天然孤儿，是数据现实而非演化退化）；
 * - aliasRatio：带 aliasOf 的 agent 实体 / agent 实体总数——类爆炸防线（源文②
 *   主题在③门禁面的延伸），超上限=去重阈值疑似失配。
 *
 * 门禁规则（article-faithful + 一条守门）：coverage 不降 且 aliasRatio ≤ 上限。
 * 全部阈值/开关 env 可调（KG_QUALITY_GATE 总闸、KG_QUALITY_ALIAS_CAP 上限）。
 */

export interface KgQualityMetrics {
  /** 摄取完整度：task 节点数 / eligible 任务数（无 eligible 时=1，空板视为满覆盖）。 */
  coverage: number
  /** 无边节点占比（信息性，不门禁）。 */
  orphanRate: number
  /** 别名实体占比（agent 面，类爆炸守门）。 */
  aliasRatio: number
  nodeCount: number
  edgeCount: number
}

export interface QualityGateInput {
  nodes: Array<{ id: string; type: string; properties: Record<string, unknown> }>
  edges: Array<{ src: string; dst: string }>
  /** 板库 eligible（done+archived）任务总数。 */
  eligibleTasks: number
}

/** 从板 KG 投影 + 板库计数算质量指标（纯函数，无 IO）。 */
export function evaluateKgQuality(input: QualityGateInput): KgQualityMetrics {
  const { nodes, edges, eligibleTasks } = input
  const degree = new Set<string>()
  for (const e of edges) { degree.add(e.src); degree.add(e.dst) }
  const taskNodes = nodes.filter((n) => n.id.startsWith('task:'))
  const agentNodes = nodes.filter((n) => n.id.startsWith('agent:'))
  const aliasAgents = agentNodes.filter((n) => n.properties?.aliasOf !== undefined)
  const orphans = nodes.filter((n) => !degree.has(n.id))
  return {
    coverage: eligibleTasks <= 0 ? 1 : Math.min(1, taskNodes.length / eligibleTasks),
    orphanRate: nodes.length === 0 ? 0 : orphans.length / nodes.length,
    aliasRatio: agentNodes.length === 0 ? 0 : aliasAgents.length / agentNodes.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  }
}

export interface QualityGateVerdict {
  passed: boolean
  reason?: string
  before: KgQualityMetrics
  after: KgQualityMetrics
}

export interface QualityGateOpts {
  /** 别名率上限（默认 0.5，env KG_QUALITY_ALIAS_CAP）。 */
  aliasCap: number
}

export function aliasCapFromEnv(): number {
  const raw = Number(process.env.KG_QUALITY_ALIAS_CAP)
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.5
}

export function qualityGateEnabled(): boolean {
  return process.env.KG_QUALITY_GATE !== '0'
}

/**
 * 门禁判定：coverage 不降（源文③规则）且 aliasRatio ≤ 上限（类爆炸守门）。
 * orphanRate 仅随 verdict 报告，不参与判定（无 assignee 任务天然孤儿）。
 */
export function checkQualityGate(before: KgQualityMetrics, after: KgQualityMetrics, opts: QualityGateOpts): QualityGateVerdict {
  if (after.coverage + 1e-9 < before.coverage) {
    return {
      passed: false,
      reason: `覆盖率回退：${before.coverage.toFixed(3)} → ${after.coverage.toFixed(3)}（任务摄取不完整或图被破坏）`,
      before, after,
    }
  }
  if (after.aliasRatio > opts.aliasCap + 1e-9) {
    return {
      passed: false,
      reason: `别名率 ${(after.aliasRatio.toFixed(3))} 超上限 ${opts.aliasCap.toFixed(2)}（去重阈值疑似失配，类爆炸风险）`,
      before, after,
    }
  }
  return { passed: true, before, after }
}
