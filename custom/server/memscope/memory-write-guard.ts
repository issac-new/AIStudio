// overlay/memscope：记忆写入准入（2026-11-12 ai-agent-handbook 吸收）。
//
// 手册第 5/8 章：记忆写入前六问的第一组是「未来价值/经环境验证/作用域/敏感留存」。
// 本模块只做纯判定，不访问存储：没有作用域、没有经确认的证据、没有来源引用的候选，
// 一律不写。写入方（Hindsight/tool）接线前，先过这道判定。

export type MemoryEvidenceKind = 'confirmed' | 'guess' | 'model_done' | 'temporary' | 'unknown'

export interface MemoryWriteCandidate {
  /** 写入者所属租户/用户；缺失=作用域未知，拒绝写入。 */
  tenantId?: string
  userId?: string
  /** 目标记录归属（可选）；与写入者不同=跨租户/跨用户，拒绝。 */
  ownerTenantId?: string
  ownerUserId?: string
  /** evidence=confirmed 才允许写；模型自述完成/猜测/临时值都不算。 */
  evidence?: MemoryEvidenceKind
  /** 来源引用（trace id/文件/URL/任务卡）；缺失=不可追溯，拒绝。 */
  sourceRef?: string
  scope?: 'global' | 'project'
}

export interface MemoryWriteDecision {
  allow: boolean
  reason: string
}

export function decideMemoryWrite(candidate: MemoryWriteCandidate): MemoryWriteDecision {
  const tenantId = candidate.tenantId?.trim()
  const userId = candidate.userId?.trim()
  if (!tenantId || !userId) {
    return { allow: false, reason: '写入者作用域未知（缺 tenantId/userId）' }
  }
  if (candidate.ownerTenantId && candidate.ownerTenantId !== tenantId) {
    return { allow: false, reason: '跨租户写入被拒绝' }
  }
  if (candidate.ownerUserId && candidate.ownerUserId !== userId) {
    return { allow: false, reason: '跨用户写入被拒绝' }
  }
  if (candidate.evidence !== 'confirmed') {
    return { allow: false, reason: `证据未确认（evidence=${candidate.evidence ?? 'missing'}）` }
  }
  if (!candidate.sourceRef?.trim()) {
    return { allow: false, reason: '缺来源引用，不可追溯' }
  }
  return { allow: true, reason: '作用域明确、证据已确认、来源可追溯' }
}
