// overlay：goal 三预算显式化（kimi §四 P2-8 吸收，zcode §七 #7 G5 待排期项，矩阵 §3.10）。
//
// kimi 语义（goal 三预算：token/turn/wallClock）——goal 的停止条件不止轮数：
// - **turn**：轮数上限（N/M turns）；
// - **token**：token 预算（累计用量/上限）；
// - **wallClock**：墙钟时限（已耗/上限，分钟）。
// 三维独立计量、任一触顶即 budget_limited（与 hermes goals.py 预算字段对齐）。
// 本模块=三预算结构+解析（/goal status 回执三段式）+警示线（默认 80%）。
export interface BudgetDim {
  used: number
  max: number
  /** used/max 0-1+；max=0 时 null（无上限不警示）。 */
  progress: number | null
  /** 越警示线（默认 80%）。 */
  warn: boolean
}

export interface GoalThreeBudgets {
  turn: BudgetDim
  token: BudgetDim
  wallClock: BudgetDim
  /** 触顶维（任一 used>=max）；null=都没触顶。 */
  exhausted: 'turn' | 'token' | 'wallClock' | null
}

const WARN_RATIO = 0.8

function dim(used: number, max: number): BudgetDim {
  const progress = max > 0 ? used / max : null
  return { used, max, progress, warn: progress !== null && progress >= WARN_RATIO }
}

export function buildThreeBudgets(turn: [number, number], token: [number, number], wallClockMin: [number, number]): GoalThreeBudgets {
  const t = dim(turn[0], turn[1])
  const tk = dim(token[0], token[1])
  const w = dim(wallClockMin[0], wallClockMin[1])
  const exhausted = t.max > 0 && t.used >= t.max ? 'turn'
    : tk.max > 0 && tk.used >= tk.max ? 'token'
    : w.max > 0 && w.used >= w.max ? 'wallClock'
    : null
  return { turn: t, token: tk, wallClock: w, exhausted }
}

/**
 * /goal status 回执三段式解析（kimi 三预算口径）：
 * "N/M turns · X/Y tokens · A/B min"——任一段缺省该维 max=0（无上限）。
 */
export function parseThreeBudgets(text: string): GoalThreeBudgets | null {
  if (!text) return null
  const turns = text.match(/(\d+)\s*\/\s*(\d+)\s*turns?/i)
  const tokens = text.match(/(\d+)\s*\/\s*(\d+)\s*tokens?/i)
  const mins = text.match(/(\d+)\s*\/\s*(\d+)\s*min/i)
  if (!turns && !tokens && !mins) return null
  return buildThreeBudgets(
    turns ? [Number(turns[1]), Number(turns[2])] : [0, 0],
    tokens ? [Number(tokens[1]), Number(tokens[2])] : [0, 0],
    mins ? [Number(mins[1]), Number(mins[2])] : [0, 0],
  )
}
