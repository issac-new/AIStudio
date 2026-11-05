/**
 * 决策权审计两比例（薄项，2026-11-05 组织治理能力批）——纯函数。
 *
 * 来源：《断裂与重建：AI 时代 CHRO 的影响力》6.1 决策权审计——列 30 个重大决策，
 * 每个标注「谁发起 / 谁能否决 / 介入阶段」，算两个比例：
 *   · 设计阶段介入比（在问题被定义时就参与，而非实施阶段被拉进来）
 *   · 实质否决率（真否决过，而不只是被咨询）
 *
 * 纪律：
 *   1. `deferred` 既非通过也非否决，不计入否决率分母（否则否决率被稀释）。
 *   2. 缺 `stage` 的存量记录单独计数 `unstaged`，不按 category 猜测回填。
 *   3. 样本过小时返回 available:false 并写明缺口——两比例在小样本上没有解释力。
 */
import type { BridgeDecision, DecisionStage } from './semantica-client'

export const DECISION_STAGES: readonly DecisionStage[] = ['initiate', 'design', 'review', 'implement', 'posthoc']

export const STAGE_TITLES: Record<DecisionStage, string> = {
  initiate: '发起',
  design: '设计',
  review: '评审',
  implement: '实施',
  posthoc: '事后',
}

/** 小样本下限：低于此值两比例不成立（纯经验阈值，写在返回里可被复核）。 */
export const MIN_STAGE_SAMPLE = 10

export interface StageRatios {
  available: boolean
  /** 设计阶段介入比 = stage=design / 有 stage 的决策数（0..1；无样本时 null） */
  designShare: number | null
  /** 实质否决率 = rejected / (rejected + approved)（0..1；无样本时 null） */
  vetoRate: number | null
  /** 各阶段计数 */
  distribution: Record<DecisionStage, number>
  /** 有 stage 的决策数（两比例的分母基数） */
  staged: number
  /** 缺 stage 的决策数（不进分母） */
  unstaged: number
  /** 样本不足或分母为空时的缺口说明 */
  gap?: string
}

function isStage(v: unknown): v is DecisionStage {
  return typeof v === 'string' && (DECISION_STAGES as readonly string[]).includes(v)
}

export function stageRatios(decisions: BridgeDecision[]): StageRatios {
  const distribution: Record<DecisionStage, number> = {
    initiate: 0, design: 0, review: 0, implement: 0, posthoc: 0,
  }
  let staged = 0
  let unstaged = 0
  let rejected = 0
  let approved = 0

  for (const d of decisions) {
    if (isStage(d.stage)) {
      distribution[d.stage] += 1
      staged += 1
    } else {
      unstaged += 1
    }
    if (d.outcome === 'rejected') rejected += 1
    else if (d.outcome === 'approved') approved += 1
    // deferred / 其他 outcome 不计入否决率分母
  }

  const decideBase = rejected + approved
  const designShare = staged > 0 ? Number((distribution.design / staged).toFixed(4)) : null
  const vetoRate = decideBase > 0 ? Number((rejected / decideBase).toFixed(4)) : null

  const gaps: string[] = []
  if (staged === 0) gaps.push('无带介入阶段的决策记录（存量记录缺 stage）')
  else if (staged < MIN_STAGE_SAMPLE) gaps.push(`带阶段样本仅 ${staged} 条，低于下限 ${MIN_STAGE_SAMPLE}，比例仅供示意`)
  if (decideBase === 0) gaps.push('无 approved/rejected 决策，实质否决率无分母')
  if (unstaged > 0) gaps.push(`${unstaged} 条决策缺介入阶段，未计入比例（不猜测回填）`)

  const available = staged >= MIN_STAGE_SAMPLE && decideBase > 0
  return {
    available,
    designShare,
    vetoRate,
    distribution,
    staged,
    unstaged,
    ...(gaps.length ? { gap: gaps.join('；') } : {}),
  }
}
