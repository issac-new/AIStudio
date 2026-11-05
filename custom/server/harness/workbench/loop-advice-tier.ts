// 文件职责：验证信号分级（R12a）（自 loop-advice.ts 纯移动，行为不变）。
import { composedVariant } from './loop-core'
import type { Proposal } from './types'

// ---- R12a（2026-10-31 首批执行）：验证信号分级（验证层级理论 arXiv 2607.07663） ----

export type VerificationTier = 'command' | 'heldout' | 'regression' | 'judge' | 'none'

const TIER_ORDER: Record<VerificationTier, number> = { command: 4, heldout: 3, regression: 2, judge: 1, none: 0 }

/**
 * 从提案的探测证据推导本次晋级实际用到的最强验证层：
 * command（命令式验收器运行）> heldout（密封留出，R6 后接）> regression（普通 eval 回归）> judge（LLM 判分主导）> none。
 * 依据：改进强度与验证信号强度绑定（2607.07663）——面板须显式区分，弱层连续晋级是进化健康度信号。
 */
export function verificationTierOf(proposal: Proposal): VerificationTier {
  const selected = composedVariant(proposal)
  if (!selected) return 'none'
  const probe = proposal.probes.find((x) => x.variantId === selected.id && x.status === 'recorded' && x.evidence)
  const ev = probe?.evidence
  if (!ev) return 'none'
  const tiers: VerificationTier[] = []
  // W6（2026-11-05）：命令式验收器读数进档——任务声明 outcome.argv 且已有 attempt 结果。
  if (ev.commandChecks != null && ev.commandChecks.total > 0) tiers.push('command')
  if (ev.regression != null) tiers.push('regression')
  if (ev.heldout != null) tiers.push('heldout')
  // 判分主导＝无回归/留出硬证据而 judgeOnline（LLM 判分参与）
  if (tiers.length === 0 && ev.judgeOnline) tiers.push('judge')
  if (tiers.length === 0) tiers.push('none')
  return tiers.sort((a, b) => TIER_ORDER[b] - TIER_ORDER[a])[0]
}

export function tierAtLeast(tier: VerificationTier, floor: VerificationTier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[floor]
}
