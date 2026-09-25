// overlay/dispatchpreview 域：分派预演 WillEnqueueRun（routa/multica #7 派单链衔接，矩阵 §3.6 行 180 P1）。
//
// 语义（写读共用谓词）：派单前预演"这次会不会真入队"——**预演与实际写入走同一个谓词**
// willEnqueueRun，防预演说进、实际被拒（或反之）的两面派。
// 判定因子：并发上限/重复任务在跑/全局暂停/去重键冲突——任一拦即不入队，reasons 全列。
export interface DispatchFacts {
  inProgress: number
  maxInProgress: number
  /** 同任务是否已在跑（重复派）。 */
  taskAlreadyRunning: boolean
  /** 全局暂停（如人工冻结）。 */
  paused: boolean
  /** 去重键（同 key 在跑即冲突）。 */
  dedupeKey: string
  runningDedupeKeys: readonly string[]
}

export interface EnqueueDecision {
  willEnqueue: boolean
  reasons: string[]
}

/** 写读共用谓词：预演与实际入队共用本函数（唯一事实源）。 */
export function willEnqueueRun(facts: DispatchFacts): EnqueueDecision {
  const reasons: string[] = []
  if (facts.paused) reasons.push('paused：全局暂停')
  if (facts.taskAlreadyRunning) reasons.push('duplicate：同任务已在跑')
  if (facts.inProgress >= facts.maxInProgress) {
    reasons.push(`capacity：inProgress ${facts.inProgress} >= max ${facts.maxInProgress}`)
  }
  if (facts.runningDedupeKeys.includes(facts.dedupeKey)) {
    reasons.push(`dedupe：同 key ${facts.dedupeKey} 在跑`)
  }
  return { willEnqueue: reasons.length === 0, reasons }
}

/** 预演面（读）：同一谓词包装出人可读预演卡。 */
export function dispatchPreview(facts: DispatchFacts): string {
  const d = willEnqueueRun(facts)
  return d.willEnqueue
    ? 'WillEnqueueRun：yes'
    : `WillEnqueueRun：no — ${d.reasons.join('; ')}`
}
