// 改进闭环建议/泄漏/假设/停滞/进化报告（v0.4 第四批拆分，来自 loop-report）。
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

import { rsiConfig } from './loop-config'
import type { RsiConfig } from './loop-config'

export interface ArchiveSteppingStone {
  proposalId: string
  surfaceKey: SurfaceKey
  title: string
  hypothesis: string
  status: ProposalStatus
  /** 该提案全部已记录探测的最高 passAt1（无探测=null）。 */
  bestPassAt1: number | null
  /** 选中候选相对基线的 passAt1 差（无读数=null）。 */
  bestDelta: number | null
  updatedAt: string
}

export function proposalArchive(
  proposals: Proposal[],
  surfaceKey?: SurfaceKey,
): ArchiveSteppingStone[] {
  return proposals
    .filter((p) => (p.status === 'rejected' || p.status === 'rolled_back')
      && (!surfaceKey || p.surfaceKey === surfaceKey))
    .map((p) => {
      const selected = composedVariant(p)
      const recorded = selected
        ? p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded' && x.evidence)
        : undefined
      const deltas = p.probes
        .filter((x) => x.status === 'recorded' && x.evidence?.passAt1 != null && p.baseline?.passAt1 != null)
        .map((x) => (x.evidence!.passAt1 as number) - (p.baseline!.passAt1 as number))
      return {
        proposalId: p.id,
        surfaceKey: p.surfaceKey,
        title: p.title,
        hypothesis: p.hypothesis,
        status: p.status,
        bestPassAt1: recorded?.evidence?.passAt1 ?? null,
        bestDelta: deltas.length > 0 ? Math.max(...deltas) : null,
        updatedAt: p.updatedAt,
      }
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

/** 论文退火编辑预算：b_t = ⌈b_min + (b_max−b_min)·½(1+cos(πt/T))⌉；t≥T 后恒为 b_min。 */
export function annealedEditBudget(t: number, cfg: RsiConfig = rsiConfig()): number {
  const round = Math.max(0, Math.trunc(t))
  if (round >= cfg.horizon) return cfg.bMin
  const value = cfg.bMin + (cfg.bMax - cfg.bMin) * 0.5 * (1 + Math.cos((Math.PI * round) / cfg.horizon))
  return Math.max(cfg.bMin, Math.min(cfg.bMax, Math.ceil(value)))
}

/** 论文轮次 t：该面已被采纳的轮数（未回滚冠军数；回滚=这轮没发生）。 */
export function surfaceRound(champions: Champion[], surfaceKey: SurfaceKey): number {
  return champions.filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack).length
}

export * from './loop-advice-leakage'
export * from './loop-advice-hypothesis'
export * from './loop-advice-tier'
export * from './loop-advice-evolution'
