// overlay/swarm 域：批量并行子代理扇出（kimi §四 P2-6 吸收，矩阵 §3.3 P2）。
//
// kimi 语义（AgentSwarm items 扇出：批量并行子任务一键扇出）：一个主任务分解成
// N 个并行子任务（items）批量派发——每 item 一条子代理 run（128 排队语义）。
// Ycode 形状：扇出计划纯函数（主任务→子任务列表+并发上限+排队数），派发执行
// 走 P3 派单链（单 pending 槽照常兜底）。
export interface FanoutItem {
  itemId: string
  text: string
  /** 目标 agent（zcode 引擎族）。 */
  agent: string
}

export interface FanoutPlan {
  items: FanoutItem[]
  /** 并发上限（kimi 128 排队语义的护栏：>上限进排队）。 */
  concurrencyLimit: number
  /** 排队数（items 超限部分）。 */
  queued: number
}

const DEFAULT_CONCURRENCY = 8

/** 主任务→扇出计划（items 文本进子任务；并发限流+排队计数）。 */
export function planFanout(
  mainTask: string,
  itemTexts: readonly string[],
  opts: { agent?: string; concurrencyLimit?: number } = {},
): FanoutPlan {
  const limit = opts.concurrencyLimit && opts.concurrencyLimit > 0 ? opts.concurrencyLimit : DEFAULT_CONCURRENCY
  const agent = opts.agent ?? 'zcode'
  const items: FanoutItem[] = itemTexts
    .filter((t) => t.trim().length > 0)
    .map((t, i) => ({ itemId: `${mainTask.slice(0, 24).replace(/\s+/g, '-')}-${i}`, text: t, agent }))
  return {
    items,
    concurrencyLimit: limit,
    queued: Math.max(0, items.length - limit),
  }
}
