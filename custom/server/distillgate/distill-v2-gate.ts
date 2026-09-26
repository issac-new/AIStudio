// overlay/distillgate 域：distill v2 LLM 摘要触发判定面（mimo P4 二期 v2 预备件）。
//
// 407 v1 注释自注前置条件："LLM 式摘要合并列 v2——等一期 FTS 检索面真实使用
// 反馈后再上，避免闭门造摘要"。本层不做 LLM 调用（条件未到），只落 v2 的
// **触发判定纯函数**：FTS 使用反馈到量后何时值得 LLM 合成——
// - 条件门槛：检索调用数 ≥ N 且重复命中率 ≥ P%（同一查询反复命同一批记忆=有合并价值）；
// - 合成触发：候选簇条数 ≥ 3 且总字符 ≥ 512（太少不值得合成）；
// - 陈旧语义（v1 预留 stale_days）：超期未命中记忆标记 stale，合成时优先消化。
export interface FtsFeedback {
  /** 检索调用累计数。 */
  queryCount: number
  /** 同查询重复命中同批记忆的比例（0-1）。 */
  repeatHitRate: number
}

export interface DistillCandidate {
  memoryId: string
  chars: number
  /** 最后命中时间戳（ms；从未命中=null）。 */
  lastHitAt: number | null
}

export interface V2GateDecision {
  /** 前置条件门槛是否已过（真实使用反馈到量）。 */
  feedbackReady: boolean
  /** 簇是否值得 LLM 合成。 */
  worthSynthesizing: boolean
  /** 簇内陈旧项（超 staleDays 未命中）。 */
  staleIds: string[]
  reason: string
}

const FEEDBACK_MIN_QUERIES = 50
const FEEDBACK_MIN_REPEAT_RATE = 0.2
const CLUSTER_MIN_ITEMS = 3
const CLUSTER_MIN_CHARS = 512

/** v2 触发判定（407 自注前置条件+簇合成门槛+陈旧标记）。 */
export function distillV2Gate(
  feedback: FtsFeedback,
  cluster: readonly DistillCandidate[],
  now: number,
  staleDays = 30,
): V2GateDecision {
  const feedbackReady =
    feedback.queryCount >= FEEDBACK_MIN_QUERIES && feedback.repeatHitRate >= FEEDBACK_MIN_REPEAT_RATE
  const totalChars = cluster.reduce((n, c) => n + c.chars, 0)
  const worthSynthesizing =
    feedbackReady && cluster.length >= CLUSTER_MIN_ITEMS && totalChars >= CLUSTER_MIN_CHARS
  const staleCutoff = now - staleDays * 24 * 3600 * 1000
  const staleIds = cluster
    .filter((c) => c.lastHitAt === null || c.lastHitAt < staleCutoff)
    .map((c) => c.memoryId)
  const reason = !feedbackReady
    ? `前置条件未到：检索 ${feedback.queryCount}/${FEEDBACK_MIN_QUERIES} 次、重复率 ${(feedback.repeatHitRate * 100).toFixed(0)}%（v2 等 FTS 真实反馈，不闭门造摘要）`
    : worthSynthesizing
      ? `簇 ${cluster.length} 条 ${totalChars} 字，值得 LLM 合成（陈旧 ${staleIds.length} 条优先消化）`
      : `簇太小（${cluster.length} 条 ${totalChars} 字），不值得合成`
  return { feedbackReady, worthSynthesizing, staleIds, reason }
}
