// overlay/goalbudget 域：Goal 三预算字段显式化（八源 goal 域归一增量，矩阵 §3.9 goal 八源）。
//
// 八源裁决（goal 域以 hermes goals.py 为基座——每轮裁判+GoalGate+预算字段已有）：
// 增量=三预算字段显式化——步数（maxSteps）/ token（maxTokens）/ 时限（maxWallClockMs）
// 三维独立记账、独立触顶判定；任一触顶即 exhausted（衔接 goalautonomy"预算触顶三档同停"）。
export interface GoalBudget {
  maxSteps: number
  maxTokens: number
  maxWallClockMs: number
}

export interface GoalUsage {
  steps: number
  tokens: number
  elapsedMs: number
}

export type BudgetDimension = 'steps' | 'tokens' | 'wallclock'

export interface BudgetCheck {
  exhausted: boolean
  /** 已触顶的维度（未触顶为空）。 */
  breached: BudgetDimension[]
  /** 各维剩余量（steps/tokens 为个数，wallclock 为毫秒；触顶为 0）。 */
  remaining: Record<BudgetDimension, number>
}

/** 三预算触顶判定（显式三字段语义）。 */
export function budgetCheck(budget: GoalBudget, usage: GoalUsage): BudgetCheck {
  const remSteps = Math.max(0, budget.maxSteps - usage.steps)
  const remTokens = Math.max(0, budget.maxTokens - usage.tokens)
  const remClock = Math.max(0, budget.maxWallClockMs - usage.elapsedMs)
  const breached: BudgetDimension[] = []
  if (remSteps === 0) breached.push('steps')
  if (remTokens === 0) breached.push('tokens')
  if (remClock === 0) breached.push('wallclock')
  return {
    exhausted: breached.length > 0,
    breached,
    remaining: { steps: remSteps, tokens: remTokens, wallclock: remClock },
  }
}

/** 用量快进语义：一维触顶后 usage 不回退（幂等累加由调用方记账）。 */
export function advanceUsage(usage: GoalUsage, delta: Partial<GoalUsage>): GoalUsage {
  return {
    steps: usage.steps + (delta.steps ?? 0),
    tokens: usage.tokens + (delta.tokens ?? 0),
    elapsedMs: usage.elapsedMs + (delta.elapsedMs ?? 0),
  }
}
