// overlay/btw 域：侧问（cc §六 P2 吸收，矩阵 §3.7 P2；kimi /btw 同源合并）。
//
// cc/kimi 语义（/btw 侧问：主回合外侧问不打断主任务）：长任务跑着时人有小问题——
// **侧问通道**：旁路提问/回答（不进主任务流），答完侧问**合并回注**（作为一条
// 旁注合入主上下文——不改主任务方向）。隔离语义：side 目录与主目分流。
export interface BtwExchange {
  exchangeId: string
  question: string
  answer: string | null
  at: number
  /** 是否已合并回注主上下文。 */
  merged: boolean
}

/** 侧问状态判定（cc 语义：未答=等待；答完=待合并；合并后=归档）。 */
export type BtwState = 'waiting' | 'answered' | 'merged'

export function btwState(x: BtwExchange): BtwState {
  if (x.merged) return 'merged'
  return x.answer ? 'answered' : 'waiting'
}

/** 合并回注文本（侧问→主上下文旁注——不改主方向）。 */
export function mergeBtwNote(x: BtwExchange): string | null {
  if (x.merged || !x.answer) return null
  return `[btw 旁注] Q: ${x.question}\nA: ${x.answer}\n（侧问旁注，不改主任务方向）`
}
