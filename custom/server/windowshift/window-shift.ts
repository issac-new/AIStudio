// overlay/windowshift 域：token 预算换窗决策（codex §四 P2 吸收，矩阵 §3.8 codex P2）。
//
// codex 语义（token-budget 换窗：免摘要 compact）：上下文超预算不是只有"摘要压缩"
// 一条路——**换窗**（丢旧窗保新窗，不产摘要）更便宜，适合重复性长任务；剪枝
// （丢大结果留骨架）居中。三策略决策：按超限幅度与历史可弃性选。
// 衔接 409 剪枝次序化/400 compact 六段——本层只管"选哪条路"，执行归各自域。
export type OverflowStrategy = 'shift' | 'prune' | 'compact'

export interface OverflowFacts {
  /** 超限 token 数。 */
  overageTokens: number
  /** 旧窗可弃性（true=旧内容纯重复/可再生——shift 划算）。 */
  droppableHistory: boolean
  /** 是否有未验证重要事实（compact 必须——摘要保住事实）。 */
  hasCriticalFacts: boolean
}

export interface OverflowDecision {
  strategy: OverflowStrategy
  detail: string
}

/** 超限→策略（codex 语义：shift 免摘要最便宜；critical 事实强制 compact）。 */
export function chooseOverflowStrategy(facts: OverflowFacts): OverflowDecision {
  // 重要事实必须保住——摘要（compact）是唯一不丢事实的路。
  if (facts.hasCriticalFacts) {
    return { strategy: 'compact', detail: '有未验证重要事实：compact 摘要保事实（shift 会丢）' }
  }
  // 旧窗可弃（重复/可再生）→ 换窗（免摘要，最便宜——codex 换窗语义）。
  if (facts.droppableHistory) {
    return { strategy: 'shift', detail: '旧窗可弃：换窗丢旧保新（免摘要）' }
  }
  // 居中：剪枝骨架（丢大结果留结构）。
  return { strategy: 'prune', detail: `超限 ${facts.overageTokens} token：剪枝骨架（丢大结果留结构）` }
}
