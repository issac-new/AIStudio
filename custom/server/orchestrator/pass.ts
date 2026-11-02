// custom/server/orchestrator/pass.ts
// 评估轮（2026-10-31 C 批 C2）：把 pending Trigger 逐条送语义评估并落 Decision。
// 与 A+B 的分工：ingest 只做程序准入并落 Trigger；本模块补 Slow Path。
// 推进规则（spec §4.2）：仅当源 mode=auto 且 verdict=accept 时把 Trigger 置 routed；
// observe/off 下只记 Decision，不改状态。
import { getAdmission } from './admission'
import { evaluateTrigger } from './evaluator'
import { recordDecision } from './decision'
import { currentPolicyVersion } from './policy-version'
import { listTriggers, setTriggerStatus, bumpEvalAttempts } from './store'
import type { SemanticVerdict, Trigger } from './types'

export interface EvaluationPassResult {
  evaluated: number
  accepted: number
  ignored: number
  unavailable: number
  /** 因 mode 不是 auto 而没有推进状态的条数（observe/off）。 */
  recordedOnly: number
  /** 失败达到上限、已停止重试的条数（2026-11-02 补）。 */
  retryExhausted: number
  details: Array<{ triggerId: string; verdict: string; reasons: string[]; promoted: boolean }>
}

/** 同一条 Trigger 允许的评估失败次数；超过即置 ignored，避免每轮 tick 重复烧模型。 */
export const EVAL_RETRY_LIMIT = 2

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
    evaluated: 0, accepted: 0, ignored: 0, unavailable: 0, recordedOnly: 0, retryExhausted: 0, details: [],
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
    // 2026-11-02 实测修正：Trigger.status 表达「评估是否已完成」，不表达「是否实际派发」。
    // 原实现 observe 下 kept pending，导致每轮 tick 对同一批事件重复调模型。
    // 实际派发仍由 mode 决定（auto+accept 才落 routed 供下游消费；observe 只记录）。
    if (verdict.verdict === 'accept') {
      setTriggerStatus(trigger.id, 'routed')
    } else if (verdict.verdict === 'ignore') {
      setTriggerStatus(trigger.id, 'ignored')
    } else {
      // unavailable：累计失败次数，达到上限就停手。
      const attempts = bumpEvalAttempts(trigger.id)
      if (attempts >= EVAL_RETRY_LIMIT) {
        setTriggerStatus(trigger.id, 'ignored')
        result.retryExhausted++
      }
    }
    if (!(autoMode && verdict.verdict === 'accept')) result.recordedOnly++
    result.details.push({
      triggerId: trigger.id, verdict: verdict.verdict, reasons: verdict.reasons,
      promoted: autoMode && verdict.verdict === 'accept',
    })
  }
  return result
}
