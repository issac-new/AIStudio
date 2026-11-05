// 改进闭环帕累托报告（v0.4 第四批拆分，来自 loop-report）。
// 改进闭环晋级/报告层（v0.4 单文件体量治理：第三批拆分，来自 loop.ts，行为不变）。
// overlay/custom/server/harness/workbench/loop.ts
// 改进闭环的纯函数层：摘要、diff、无真值行为对比、晋级门禁。
// 这里不读盘、不写库，便于单测覆盖全部分支；副作用在 service/apply。
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gainRetention } from './multi-objective'
import { parseHookPolicy } from '../../goalbudget/stage-ladder'
import type {
  BehaviorContrast, Champion, EvolutionReport, EvolutionRound, EvolutionSurface, GateBlocker,
  ParetoPoint, ParetoReport, ParetoTier, ProbeMetrics, PromotionGateReport, Proposal,
  ProposalStatus, QualityVerdict, RegularizationDerived, RetirementCandidate, SurfaceKey, Variant,
} from './types'

import { attributeGain, candidateDiversity, composedVariant, diffSummary, matchAlwaysOn, probeCost, variantSetDigest } from './loop-core'
import type { PromotionGateInput } from './loop-core'


/**
 * 三档代表选取参考点（本仓实例化，归一化坐标 perf×econ，econ=1-归一成本）：
 * lite=(0,1) 最省代表（性能接受前沿地板）、medium=(1,1) 均衡代表（距双优理想点最近）、
 * heavy=(1,0) 性能代表（接受前沿最贵换最高分）。档位偏好编码在参考点里（论文未公开
 * 公式细节，此为可解释实例化：三代表恰为前沿三个「角+心」）。
 */
export const PARETO_TIER_REFERENCES: Record<ParetoTier, { perf: number; econ: number }> = {
  lite: { perf: 0, econ: 1 },
  medium: { perf: 1, econ: 1 },
  heavy: { perf: 1, econ: 0 },
}

export const PARETO_NOTE = '帕累托双目标=passAt1（越大越好）×costUsd（越小越好）；三档代表=两轴 min-max 归一化后，距档位参考点（lite=(0,1) 最省、medium=(1,1) 双优、heavy=(1,0) 最高分）欧氏平方距离最近的前沿候选。参考点为本仓实例化，论文未公开公式。'

/** a 支配 b ⟺ passAt1 ≥ 且 cost ≤ 且至少一严格（调用方保证双值非 null 有限）。 */
function paretoDominates(a: ParetoPoint, b: ParetoPoint): boolean {
  return a.passAt1! >= b.passAt1! && a.costUsd! <= b.costUsd!
    && (a.passAt1! > b.passAt1! || a.costUsd! < b.costUsd!)
}

/** 帕累托报告：非支配过滤 + 三档代表。单点=前沿（无比较对象）；null 读数如实排除。 */
export function paretoReport(points: ParetoPoint[]): ParetoReport {
  const eligible: ParetoPoint[] = []
  const excluded: ParetoReport['excluded'] = []
  for (const p of points) {
    const perfOk = typeof p.passAt1 === 'number' && Number.isFinite(p.passAt1)
    const costOk = typeof p.costUsd === 'number' && Number.isFinite(p.costUsd)
    if (perfOk && costOk) eligible.push(p)
    else excluded.push({
      variantId: p.variantId,
      label: p.label,
      reason: !perfOk && !costOk ? '缺少通过率与成本读数' : !perfOk ? '缺少通过率读数' : '缺少成本读数',
    })
  }

  const entries: ParetoReport['entries'] = eligible.map((p) => ({
    ...p,
    onFrontier: true,
    dominatedBy: [],
    tier: null,
  }))
  for (const e of entries) {
    e.dominatedBy = entries
      .filter((o) => o !== e && paretoDominates(o, e))
      .map((o) => o.variantId)
    e.onFrontier = e.dominatedBy.length === 0
  }

  const front = entries.filter((e) => e.onFrontier)
  if (front.length > 0) {
    const perfs = front.map((e) => e.passAt1!)
    const costs = front.map((e) => e.costUsd!)
    const perfMin = Math.min(...perfs); const perfMax = Math.max(...perfs)
    const costMin = Math.min(...costs); const costMax = Math.max(...costs)
    const norm = (v: number, min: number, max: number) => (max > min ? (v - min) / (max - min) : 1)
    for (const tier of ['lite', 'medium', 'heavy'] as const) {
      const ref = PARETO_TIER_REFERENCES[tier]
      let best: ParetoReport['entries'][number] | null = null
      let bestDist = Infinity
      for (const e of front) {
        // economy 轴：成本越低分越高（归一化后 1=最省）
        const perfScore = norm(e.passAt1!, perfMin, perfMax)
        const econScore = 1 - norm(e.costUsd!, costMin, costMax)
        const dist = (perfScore - ref.perf) ** 2 + (econScore - ref.econ) ** 2
        if (dist < bestDist) { bestDist = dist; best = e }
      }
      if (best) best.tier = tier
    }
  }

  return { eligible: eligible.length, excluded, entries, note: PARETO_NOTE }
}

/** 从提案的已记录探测组装帕累托报告（service/门禁共用入口）。 */
export function paretoReportOf(proposal: Proposal): ParetoReport {
  const byVariant = new Map(proposal.variants.map((v) => [v.id, v]))
  const points: ParetoPoint[] = []
  for (const probe of proposal.probes) {
    if (probe.status !== 'recorded' || !probe.evidence) continue
    const v = byVariant.get(probe.variantId)
    if (!v) continue
    points.push({ variantId: v.id, label: v.label, passAt1: probe.evidence.passAt1, costUsd: probe.evidence.costUsd })
  }
  return paretoReport(points)
}
