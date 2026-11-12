// overlay/toolcontract：动作恢复判定（2026-11-12 ai-agent-handbook 吸收）。
//
// 手册四关的第一关：超时≠失败，重复副作用不可撤销。本模块只做纯判定，
// 不读账本、不执行动作——调用方把账本状态与重试性传进来，拿一个可审计的决策：
//   confirmed      → reuse（直接复用已有结果）
//   failed+可重试  → retry
//   failed+不可重试→ manual
//   sent/unknown   → check_external（先查外部真实状态，禁止直接重放）
//   intended       → check_external（可能已发出但未结算；恢复中尤其）
//   blocked        → manual
// 没有记录（missing）在首次执行时允许 retry；恢复场景仍要求 check_external。

export type ActionRecoveryDecision = 'reuse' | 'retry' | 'check_external' | 'manual'

export interface ActionRecoveryInput {
  /** 账本状态；undefined/null = 没有记录。 */
  status?: 'intended' | 'sent' | 'confirmed' | 'failed' | 'blocked' | null
  /** 失败是否可重试（由执行器/错误分类提供）；未知不当作可重试。 */
  retryable?: boolean | null
  /** 正在恢复（进程重启/会话续跑），比首次执行更保守。 */
  recovering?: boolean
  /** 记录年龄（ms），用于区分「刚发出的在途动作」与「陈旧未结算」。 */
  ageMs?: number | null
  /** 陈旧阈值（ms）；超过后 sent/intended 仍只能 check_external，不给自动重试。 */
  staleAfterMs?: number
}

export interface ActionRecoveryResult {
  decision: ActionRecoveryDecision
  reason: string
}

export function decideActionRecovery(input: ActionRecoveryInput): ActionRecoveryResult {
  const status = input.status ?? null
  const recovering = input.recovering === true

  if (status === 'confirmed') {
    return { decision: 'reuse', reason: '动作已确认，复用已有结果' }
  }
  if (status === 'failed') {
    if (input.retryable === true) {
      return { decision: 'retry', reason: '动作明确失败且可重试' }
    }
    return { decision: 'manual', reason: '动作明确失败但不可重试或未知可重试性' }
  }
  if (status === 'blocked') {
    return { decision: 'manual', reason: '动作被执行前策略拦截，需人工确认' }
  }
  if (status === 'sent') {
    const stale = typeof input.ageMs === 'number' && typeof input.staleAfterMs === 'number'
      ? input.ageMs > input.staleAfterMs
      : false
    return {
      decision: 'check_external',
      reason: stale
        ? '动作已发出且记录陈旧——只能先查外部状态，禁止重放'
        : '动作已发出但结果未知——先查外部状态',
    }
  }
  if (status === 'intended') {
    return {
      decision: 'check_external',
      reason: '动作有意图记录但未结算——可能已执行，先查外部状态',
    }
  }
  // 没有记录：首次执行允许重试；恢复场景不允许把「没记录」当「没执行」。
  if (recovering) {
    return { decision: 'check_external', reason: '恢复场景无动作记录——不得假定未执行' }
  }
  return { decision: 'retry', reason: '无动作记录且非恢复场景，按首次执行处理' }
}
