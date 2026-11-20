// overlay[outcome/learning]（批二 T6）：结算触发学习候选（spec §五）。
//
// 语义：settlement_signed 后按双闸（合同 learningOptIn ＋ EXPERIENCE_INJECT 写闸）
// 生成/更新 ExpCandidate——陈述=结果标题＋verdict＋理由摘要；幂等键=
// sourceSettlementId（同结算不重复生成）。「已生成」≠「有效」：效果断言走对照
// 投影（comparison.ts），本域只产候选事实。作用域按全局（rootTask 板列在结算时
// 已非稳定口径，不猜列名）。
import { readExpStore, writeExpStore } from '../expcandidates/exp-store'
import type { ExpCandidate } from '../expcandidates/exp-types'
import type { OutcomeContract } from './types'

/** 结算摘要最小形状（控制器传入；与 outcome-store settlement 读取面同源字段）。 */
export interface SettlementForLearning {
  settlementId: string
  verdict: string
  rationale: string
  signedAt: number
}

export interface LearningGateResult {
  generated: boolean
  reason: string
  candidateId?: string
}

/** 双闸判定（纯函数，测试与生成共用）：任一关即不生成。 */
export function learningGatesOn(contract: OutcomeContract, envInject: string | undefined): boolean {
  return contract.learningOptIn === true && envInject === '1'
}

/** 结算→候选生成/更新（幂等按 sourceSettlementId）。fail-soft：存储异常上抛由
 *  调用方（控制器）warn 不阻断结算主流程——学习是派生面不是结算的前置。 */
export function generateLearningCandidate(
  contract: OutcomeContract,
  settlement: SettlementForLearning,
  envInject: string | undefined = process.env.EXPERIENCE_INJECT,
): LearningGateResult {
  if (!learningGatesOn(contract, envInject)) {
    return { generated: false, reason: `双闸未开（learningOptIn=${contract.learningOptIn} EXPERIENCE_INJECT=${envInject ?? 'unset'}）——不生成候选` }
  }
  const store = readExpStore()
  const existing = store.candidates.find((c) => c.sourceSettlementId === settlement.settlementId)
  if (existing) {
    return { generated: false, reason: `同结算候选已存在（${existing.id}，幂等跳过）`, candidateId: existing.id }
  }
  const now = new Date().toISOString()
  const id = `exp-${String(store.nextSeq).padStart(3, '0')}`
  const rationaleBrief = settlement.rationale.replace(/\s+/g, ' ').trim().slice(0, 120)
  const candidate: ExpCandidate = {
    id,
    type: 'good_path',
    statement: `${contract.title}：结算=${settlement.verdict}（${rationaleBrief}）`,
    fingerprint: `settlement:${settlement.settlementId}`,
    evidence: [{ taskId: contract.rootTaskId, note: `结算 ${settlement.settlementId} verdict=${settlement.verdict}`, at: settlement.signedAt }],
    status: 'candidate',
    createdAt: now,
    updatedAt: now,
    injectedRuns: [],
    outcomeId: contract.outcomeId,
    sourceSettlementId: settlement.settlementId,
  }
  store.candidates.push(candidate)
  store.nextSeq += 1
  writeExpStore(store)
  return { generated: true, reason: '结算触发学习候选已生成（待审核，未 approved 不进快照）', candidateId: id }
}
