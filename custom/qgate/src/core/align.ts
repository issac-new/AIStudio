// 语义对齐层（设计 §4）：QGate ↔ 交付标准 v1.3.0 ↔ matrix-teams delivery-protocol v2 三系统映射。
// 只做映射表与换算函数，不做事件桥接（D2 裁定）。

import type { DeliveryTier, EvidenceExecution, GateVerdict } from './types.js'

/** QGate verdict → Matrix delivery.gate verdict（delivery-protocol.ts GateVerdict 三态）。 */
export const VERDICT_TO_DELIVERY: Record<GateVerdict, 'pass' | 'conditional' | 'reject'> = {
  PASS: 'pass',
  CONDITIONAL: 'conditional',
  WAIVED: 'conditional',
  FAIL: 'reject',
  INCONCLUSIVE: 'conditional',
  NOT_APPLICABLE: 'conditional',
}

/** L0-L5 质量域 ↔ 交付标准 G1-G6 生命周期门（人读追溯用，机器不依赖）。 */
export const DOMAIN_TO_GATES: Record<string, string[]> = {
  L0: ['G1', 'G2'],
  L1: ['G3'],
  L2: ['G2', 'G4'],
  L3: ['G4'],
  L4: ['G5'],
  L5: ['G5', 'G6'],
}

/** QGate Profile ↔ 交付标准 tier 三档同构（设计 §4.3）。 */
export const TIER_TO_PROFILE: Record<DeliveryTier, string> = {
  lite: 'vibe-fast',
  standard: 'feature-close',
  compliance: 'high-assurance',
}

export function tierOfProfile(profileId: string): DeliveryTier | undefined {
  for (const [tier, pid] of Object.entries(TIER_TO_PROFILE)) {
    if (pid === profileId) return tier as DeliveryTier
  }
  return undefined
}

/** 证据强度全序：仅 exercised 可支撑 PASS（设计 §4.2 exercised 纪律）。 */
export const EXECUTION_STRENGTH: Record<EvidenceExecution, number> = {
  present: 0,
  wired: 1,
  exercised: 2,
}

export function supportsPass(execution: EvidenceExecution): boolean {
  return EXECUTION_STRENGTH[execution] >= EXECUTION_STRENGTH.exercised
}
