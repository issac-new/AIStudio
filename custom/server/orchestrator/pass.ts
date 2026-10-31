// custom/server/orchestrator/pass.ts
// 评估轮（2026-10-31 C 批 C2）：把 pending Trigger 逐条送语义评估并落 Decision。
// 与 A+B 的分工：ingest 只做程序准入并落 Trigger；本模块补 Slow Path。
// 推进规则（spec §4.2）：仅当源 mode=auto 且 verdict=accept 时把 Trigger 置 routed；
// observe/off 下只记 Decision，不改状态。
import { getAdmission } from './admission'
import { evaluateTrigger } from './evaluator'
import { recordDecision } from './decision'
import { currentPolicyVersion } from './policy-version'
import { listTriggers, setTriggerStatus } from './store'
import type { SemanticVerdict, Trigger } from './types'

export interface EvaluationPassResult {
  evaluated: number
  accepted: number
  ignored: number
  unavailable: number
  /** 因 mode 不是 auto 而没有推进状态的条数（observe/off）。 */
  recordedOnly: number
  details: Array<{ triggerId: string; verdict: string; reasons: string[]; promoted: boolean }>
}

/** 同线程上下文：取该 threadKey 最近的若干条已入库事件（含当前条）。 */
function contextOf(trigger: Trigger, all: Trigger[]): Trigger[] {
  return all.filter(t => t.threadKey === trigger.threadKey).slice(-5)
}

export async function evaluatePending(opts: {
  limit?: number
  env?: NodeJS.ProcessEnv
  evaluate?: (trigger: Trigger, context: Trigger[]) => Promise<SemanticVerdict>
} = {}): Promise<EvaluationPassResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200)
  const pending = listTriggers(limit, 'pending')
  const all = listTriggers(500)
  const evaluate = opts.evaluate
    ?? ((trigger: Trigger, context: Trigger[]) => evaluateTrigger(trigger, { context, env: opts.env }))

  const result: EvaluationPassResult = {
    evaluated: 0, accepted: 0, ignored: 0, unavailable: 0, recordedOnly: 0, details: [],
  }

  for (const trigger of pending) {
    const verdict = await evaluate(trigger, contextOf(trigger, all))
    result.evaluated++
    if (verdict.verdict === 'accept') result.accepted++
    else if (verdict.verdict === 'ignore') result.ignored++
    else result.unavailable++

    recordDecision({
      triggerId: trigger.id,
      threadId: null,
      verdict: verdict.verdict,
      // 语义评估天然是规则/模型推断，不是人明确请求。
      strength: 'inferred',
      ruleIds: verdict.reasons.length ? verdict.reasons : ['semantic:no_reason'],
      policyVersion: currentPolicyVersion('source-admission'),
      decidedBy: 'orchestrator:evaluator',
    })

    const admission = getAdmission(trigger.sourceId)
    const autoMode = admission?.mode === 'auto'
    const promote = autoMode && verdict.verdict === 'accept'
    if (promote) {
      setTriggerStatus(trigger.id, 'routed')
    } else if (autoMode && verdict.verdict === 'ignore') {
      setTriggerStatus(trigger.id, 'ignored')
    } else {
      // observe/off 或 unavailable：保持 pending，等人工或下次评估。
      result.recordedOnly++
    }
    result.details.push({
      triggerId: trigger.id, verdict: verdict.verdict, reasons: verdict.reasons, promoted: promote,
    })
  }
  return result
}
