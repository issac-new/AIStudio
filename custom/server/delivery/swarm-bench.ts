// overlay[delivery]: 群体协作评测榜纯函数（2026-10-24 聚合层）。
// 源文六层架构 L5 评分 / L6 聚合：输入=单轮四维读数（swarm-collab.ts），零新增埋点、可回放。
// 纪律：不做加权总分（D17）——综合名次=可用指标平均名次；缺值不补零（D19）；只观测不进判据（D21）。

import type { SwarmCollabReadout } from './swarm-collab'

export type BenchDirection = 'higher' | 'lower'

export type BenchMetricKey =
  | 'completionRate'
  | 'morCharsPerTask'
  | 'intentFidelityRate'
  | 'charsPerCompletedTask'
  | 'backfillRatio'
  | 'echoPassRate'
  | 'byzantineBcr'

export interface BenchMetricDef {
  key: BenchMetricKey
  label: string
  direction: BenchDirection
  basis: string
}

/** 指标口径单一事实源（客户端只做镜像展示，不另立口径） */
export const BENCH_METRICS: BenchMetricDef[] = [
  { key: 'completionRate', label: '任务完成率', direction: 'higher', basis: '完成锚/任务数' },
  { key: 'morCharsPerTask', label: '每任务字符', direction: 'lower', basis: '协作消息字符/任务数' },
  { key: 'intentFidelityRate', label: '意图保真', direction: 'higher', basis: 'dialog 全文相似度（缺席回退锚点）' },
  { key: 'charsPerCompletedTask', label: '每完成锚字符成本', direction: 'lower', basis: '协作消息字符/完成锚' },
  { key: 'backfillRatio', label: '回灌占比', direction: 'lower', basis: '回灌代偿/台账总条数' },
  { key: 'echoPassRate', label: '回音壁倾向', direction: 'lower', basis: 'UAT 无条件通过率' },
  { key: 'byzantineBcr', label: '拜占庭拦截率', direction: 'higher', basis: '注入轮才有值（BCR）' },
]

export interface SwarmBenchInput {
  run: string
  readout: SwarmCollabReadout
}

export interface SwarmBenchEntry {
  run: string
  values: Record<BenchMetricKey, number | null>
  ranks: Record<BenchMetricKey, number | null>
  /** 可用指标名次均值（越小越好；无可用指标=null） */
  overallRank: number | null
  /** 成本-收益非支配标记；成本或收益缺席=null（数据不足，不冒充落榜） */
  onFrontier: boolean | null
  sources: string[]
}

export interface SwarmBenchReport {
  generatedAt: string
  runsScanned: number
  entries: SwarmBenchEntry[]
  metrics: BenchMetricDef[]
  pareto: { costKey: BenchMetricKey; benefitKey: BenchMetricKey; frontierSize: number }
  note: string
}

/** 单轮读数 → 指标值（缺席如实 null） */
export function benchValuesOf(readout: SwarmCollabReadout): Record<BenchMetricKey, number | null> {
  const { done, total } = readout.credit.taskCompletion
  return {
    completionRate: total > 0 ? done / total : null,
    morCharsPerTask: readout.communication.morCharsPerTask,
    intentFidelityRate: readout.communication.intentFidelity.rate,
    charsPerCompletedTask: done > 0 ? readout.communication.dispatchChars / done : null,
    backfillRatio: readout.communication.deadlockSignals.backfillRatio,
    echoPassRate: readout.social.unconditionalPassRate,
    byzantineBcr: readout.social.byzantine.bcr ?? null,
  }
}

function rankValue(value: number, peers: Array<number | null>, direction: BenchDirection): number {
  let better = 0
  for (const peer of peers) {
    if (peer == null) continue
    if (direction === 'higher' ? peer > value : peer < value) better += 1
  }
  return better + 1
}

/** 成本（每完成锚字符）越小越好 × 收益（任务完成率）越大越好 */
function markRunFrontier(entries: SwarmBenchEntry[]): void {
  for (const entry of entries) {
    const cost = entry.values.charsPerCompletedTask
    const benefit = entry.values.completionRate
    if (cost == null || benefit == null) { entry.onFrontier = null; continue }
    const dominated = entries.some(other => {
      const oc = other.values.charsPerCompletedTask
      const ob = other.values.completionRate
      if (other === entry || oc == null || ob == null) return false
      return oc <= cost && ob >= benefit && (oc < cost || ob > benefit)
    })
    entry.onFrontier = !dominated
  }
}

/** 跨轮评测榜：指标矩阵 + 逐指标名次 + 综合名次 + 帕累托前沿 */
export function buildSwarmBench(inputs: SwarmBenchInput[]): SwarmBenchReport {
  const entries: SwarmBenchEntry[] = inputs.map(input => ({
    run: input.run,
    values: benchValuesOf(input.readout),
    ranks: {} as Record<BenchMetricKey, number | null>,
    overallRank: null,
    onFrontier: null,
    sources: input.readout.sources,
  }))

  for (const metric of BENCH_METRICS) {
    const peers = entries.map(e => e.values[metric.key])
    for (const entry of entries) {
      const value = entry.values[metric.key]
      entry.ranks[metric.key] = value == null ? null : rankValue(value, peers, metric.direction)
    }
  }

  for (const entry of entries) {
    const ranks = BENCH_METRICS.map(m => entry.ranks[m.key]).filter((r): r is number => r != null)
    entry.overallRank = ranks.length ? ranks.reduce((s, r) => s + r, 0) / ranks.length : null
  }

  markRunFrontier(entries)

  entries.sort((a, b) => {
    if (a.overallRank != null && b.overallRank != null && a.overallRank !== b.overallRank) return a.overallRank - b.overallRank
    if (a.overallRank == null && b.overallRank != null) return 1
    if (a.overallRank != null && b.overallRank == null) return -1
    const ac = a.values.completionRate ?? -1
    const bc = b.values.completionRate ?? -1
    if (ac !== bc) return bc - ac
    return a.run.localeCompare(b.run)
  })

  return {
    generatedAt: new Date().toISOString(),
    runsScanned: inputs.length,
    entries,
    metrics: BENCH_METRICS,
    pareto: {
      costKey: 'charsPerCompletedTask',
      benefitKey: 'completionRate',
      frontierSize: entries.filter(e => e.onFrontier === true).length,
    },
    note: '均位=可用指标平均名次（越小越好，并列同名次），不做加权总分；缺指标剔除不补零；只观测不进判据',
  }
}
