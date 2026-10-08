// 来源信号分类（v0.3.1，上游 v1.26 来源列/分布 + v1.31.0 无信号第四桶本地方言）。
// 语义：一个门禁 PASS 只证明"其配置输入与观察通过了检查"，不代表声明全文已被证明——
// 来源信号是"这份 PASS 靠什么撑着"的诚实标注：
//   verified  核验 —— 内核可独立重算/计算判定（rawOutput 交叉核验、观察文件 diff/对账/词法分析等）
//   declared  声明 —— 内核只看到自报信号（command 退出码、LLM 提取），无法独立复核
//   degraded  降级 —— 证据形态更弱（present 级文件存在性、§49 缓存命中未真跑）
//   none      无信号 —— PASS 但无可分类信号（与"非 PASS 显示 —"不再共用同一符号）
// 聚合优先级（上游 1.26）：降级 ＞ 核验 ＞ 声明 ＞ 无信号——混合来源不可能被读成全部已核验。
// 纪律：非 PASS 门禁不分类（呈现层显示 —）；分类只标注实测信号，不新增采集协议。

import type { Evidence, EvidenceExecution, ExecutorSpec, GateRun, GateSpec } from './types.js'

export type SourceLabel = 'verified' | 'declared' | 'degraded'
export type SourceBucket = SourceLabel | 'none'

export const SOURCE_LABEL_ZH: Record<SourceBucket, string> = {
  verified: '核验',
  declared: '声明',
  degraded: '降级',
  none: '无信号',
}

/** executor 声明面 → 信号类别（不看点位结果，只看"内核能独立核到什么"）。 */
function classifyExecutor(executor: ExecutorSpec): SourceLabel {
  switch (executor.type) {
    // 内核独立重解析原始测试报告（TAP/JUnit）重算计数——退出码与报告双通道对账
    case 'command':
      return executor.rawOutput ? 'verified' : 'declared'
    // LLM 只做提取/解释、永不单独支撑 PASS；内核只能看到其自报结构
    case 'llm':
      return 'declared'
    // present 级：制品存在性，不证明内容正确（上游 files kind 同口径）
    case 'files':
      return 'degraded'
    // 以下全部是内核从观察文件/登记文件计算判定（diff/对账/词法/状态机）
    default:
      return 'verified'
  }
}

/** 证据实际执行形态的降级修正：cached = 输入未变复用上轮证据，不是本轮真跑。 */
function classifyExecution(execution: EvidenceExecution): SourceLabel | null {
  return execution === 'cached' ? 'degraded' : null
}

export interface SourceSignal {
  labels: SourceLabel[]
  bucket: SourceBucket
}

const PRIORITY: Record<SourceBucket, number> = { degraded: 3, verified: 2, declared: 1, none: 0 }

/**
 * 门级来源信号。仅对 PASS / CONDITIONAL / WAIVED 分类（advisory 与豁免也是真实判定，
 * 其证据来源同样须诚实标注）；FAIL / INCONCLUSIVE / NOT_APPLICABLE 返回 undefined（呈现层 —）。
 */
export function classifyGateSource(input: {
  spec: GateSpec
  evidence: readonly Evidence[]
  cached: boolean
  verdict: GateRun['verdict']
}): SourceSignal | undefined {
  const { spec, evidence, cached, verdict } = input
  if (verdict !== 'PASS' && verdict !== 'CONDITIONAL' && verdict !== 'WAIVED') return undefined

  const byType = new Map<string, SourceLabel>()
  for (const executor of spec.spec.executors) byType.set(executor.evidenceType, classifyExecutor(executor))

  const labels = new Set<SourceLabel>()
  if (cached) labels.add('degraded')
  for (const e of evidence) {
    if (e.result === 'error' || e.result === 'skipped') continue // 非证据形态不产生信号
    const fromExecutor = byType.get(e.type)
    if (fromExecutor) labels.add(fromExecutor)
    const fromExecution = classifyExecution(e.execution)
    if (fromExecution) labels.add(fromExecution)
  }
  const bucket: SourceBucket = labels.size === 0 ? 'none' : ([...labels] as SourceBucket[]).sort((a, b) => PRIORITY[b] - PRIORITY[a])[0]
  return { labels: [...labels].sort((a, b) => PRIORITY[b] - PRIORITY[a]), bucket }
}

export interface SourceDistribution {
  verified: number
  declared: number
  degraded: number
  none: number
}

/** 来源分布（呈现层聚合行）：只统计已分类门禁；非 PASS 门禁不入桶（显示 —，不冒充无信号）。 */
export function sourceDistribution(signals: Array<SourceSignal | undefined>): SourceDistribution {
  const out: SourceDistribution = { verified: 0, declared: 0, degraded: 0, none: 0 }
  for (const s of signals) if (s) out[s.bucket] += 1
  return out
}

export function renderSourceDistribution(d: SourceDistribution): string {
  return `核验 ${d.verified} · 声明 ${d.declared} · 降级 ${d.degraded} · 无信号 ${d.none}`
}
