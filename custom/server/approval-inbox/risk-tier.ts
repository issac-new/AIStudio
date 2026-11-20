// overlay/custom/server/approval-inbox/risk-tier.ts
// V4-N1 审批风险分级（2026-09-28 起）——2026-11-19（Task 5，spec §4.3）正身迁至
// outcome/decision-matrix.ts：可逆性与外部影响不再隐藏在单一风险档里，风险判据
// （正则与词表）整体迁入新正身，本文件退为兼容薄层。
// 行为承诺：classifyApprovalRisk = classifyDecisionProfile(input).riskTier，
// 输出与迁移前完全一致（守门=__tests__/risk-tier.test.ts「回归锁」describe，
// 委托化前后必须同绿）；词表演进历史注释见 decision-matrix.ts 与 git 记录。
import { classifyDecisionProfile, type DecisionClassifyInput } from '../outcome/decision-matrix'
import type { RiskTier } from '../outcome/types'

/** 兼容别名：原档位枚举与 outcome RiskTier 同源（取值不变：high/medium/low）。 */
export type ApprovalRiskTier = RiskTier

/** 兼容别名：原入参形状与决策画像分类器同源（单一事实源，不另抄字段）。 */
export type RiskClassifyInput = DecisionClassifyInput

/** 待审项风险分档（服务端权威）——薄委托到决策画像分类器的 riskTier 维。 */
export function classifyApprovalRisk(input: RiskClassifyInput): ApprovalRiskTier {
  return classifyDecisionProfile(input).riskTier
}

/** 档位合法性校验（decide 入参/台账回读用）。 */
export function isApprovalRiskTier(v: unknown): v is ApprovalRiskTier {
  return v === 'high' || v === 'medium' || v === 'low'
}
