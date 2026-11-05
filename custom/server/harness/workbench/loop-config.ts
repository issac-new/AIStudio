// 改进闭环 RSI 配置（v0.4 第四批拆分，来自 loop-report）。
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


export interface RsiConfig {
  /** 论文 T：退火视界（轮）。 */
  horizon: number
  bMin: number
  bMax: number
  stallWindow: number
  pruneN: number
  /** 成本规则 β₀：无增益时仍允许的 token 增长（相对量）。 */
  beta0: number
  /** 成本规则 β₁：每 1 个百分点通过率增益允许的 token 增长（相对量）。论文口径=每增 1 pass 允许 25%。 */
  beta1PerPoint: number
  /** true=未标定噪声带直接拦（缺省 false，warning 交人工裁决）。 */
  requireNoise: boolean
  /** true=未绑定等预算基线直接拦（缺省 false，warning 交人工裁决）。 */
  requireAttribution: boolean
  /** true=未记录约束保持断言直接拦（缺省 false，warning 交人工裁决）。 */
  requireConstraints: boolean
  /** true=未绑定反事实变体运行直接拦（缺省 false，warning 交人工裁决）。 */
  requireCounterfactual: boolean
  /** true=未绑定密封留出读数直接拦（R6，缺省 false）。 */
  requireHeldout: boolean
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Math.trunc(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/**
 * 超参照论文 Table 5 取 coding 档缺省（T=20、b 1/4、w=3、n_prune=4、β₀=0.10、
 * β₁≈25%/pass）。除 δ 外全部 env 可调；δ 刻意不设调参入口（论文纪律：调低 δ 只会买到噪声分）。
 */
export function rsiConfig(): RsiConfig {
  return {
    horizon: envInt('HARNESS2_RSI_T', 20),
    bMin: envInt('HARNESS2_RSI_B_MIN', 1),
    bMax: envInt('HARNESS2_RSI_B_MAX', 4),
    stallWindow: envInt('HARNESS2_RSI_STALL_W', 3),
    pruneN: envInt('HARNESS2_RSI_PRUNE_N', 4),
    beta0: envFloat('HARNESS2_RSI_BETA0', 0.1),
    beta1PerPoint: envFloat('HARNESS2_RSI_BETA1', 0.25),
    requireNoise: process.env.HARNESS2_RSI_REQUIRE_NOISE === '1',
    requireAttribution: process.env.HARNESS2_RSI_REQUIRE_ATTRIBUTION === '1',
    requireConstraints: process.env.HARNESS2_RSI_REQUIRE_CONSTRAINTS === '1',
    requireCounterfactual: process.env.HARNESS2_RSI_REQUIRE_COUNTERFACTUAL === '1',
    requireHeldout: process.env.HARNESS2_RSI_REQUIRE_HELDOUT === '1',
  }
}

/**
 * 垫脚石档案（D3，2026-10-31 吸收轮；DGM/ADAS 档案采样思想）：
 * 把被拒/回滚提案连同其最佳探测读数暴露为「垫脚石候选」——纯爬山会丢掉
 * 低分祖先，而它们常是通往最优的必经路径。提案端可据此在其新提案的
 * 假设里显式引用/改造这些分支。只读投影，不改变任何状态。
 */
