// custom/server/orchestrator/decision.ts
// Decision 记录（2026-10-31 A+B 批 spec D9）。
// 四值 verdict 与强度分开存：verdict 表示「评估结论」，strength 表示「依据强度」。
// 本模块只记录，不执行；执行由调用方按 verdict 决定（本批不自动派发）。
import { insertDecision, listDecisions } from './store'
import type { AuthStrength, Decision, DecisionVerdict } from './types'

function newDecisionId(): string {
  const t = Date.now().toString(36).padStart(9, '0')
  const r = Math.random().toString(36).slice(2, 10).padStart(8, '0')
  return `dec_${t}${r}`
}

export function recordDecision(input: {
  triggerId: string
  threadId?: string | null
  verdict: DecisionVerdict
  strength: AuthStrength
  ruleIds?: string[]
  policyVersion: number
  decidedBy: string
  decidedAt?: number
}): Decision {
  const decision: Decision = {
    id: newDecisionId(),
    triggerId: input.triggerId,
    threadId: input.threadId ?? null,
    verdict: input.verdict,
    strength: input.strength,
    ruleIds: Array.isArray(input.ruleIds) ? input.ruleIds.slice() : [],
    policyVersion: Number.isFinite(input.policyVersion) ? Math.max(0, Math.floor(input.policyVersion)) : 0,
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt ?? Date.now(),
  }
  insertDecision(decision)
  return decision
}

export function recentDecisions(limit = 50): Decision[] {
  return listDecisions(limit)
}
