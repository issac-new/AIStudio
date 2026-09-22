// custom/server/loop/engine/loop-guard.ts
// Loop Guard：防死循环 retry_count + Leader 介入
// 依赖：无外部依赖（纯逻辑）

export type LoopActionType = 'CONTINUE' | 'BLOCKED_BY_POLICY' | 'AUTO_FIXED' | 'LEADER_INTERVENTION' | 'RETRY'

export interface LoopAction {
  type: LoopActionType
  ruleId?: string
  /** CONTINUE 态可省略 message/taskId（无阻断语义） */
  message?: string
  taskId?: string
  policy?: string
  retryCount?: number
}

// ─── 防死循环机制 ──────────────────────────────────────

export const MAX_RETRY_COUNT = 5
export const LEADER_THRESHOLD = 3 // 连续 BLOCKED 达到此值触发 Leader 介入

export interface RetryState {
  taskId: string
  retryCount: number
  lastAction: LoopActionType
  consecutiveBlocked: number
  history: LoopAction[]
}

/**
 * 记录一次 loop 动作
 * 返回是否应触发 Leader 介入
 */
export function recordRetry(state: RetryState, action: LoopAction): { shouldLeaderIntervene: boolean; updatedState: RetryState } {
  state.history.push(action)
  state.lastAction = action.type

  if (action.type === 'BLOCKED_BY_POLICY') {
    state.consecutiveBlocked++
    state.retryCount++
  } else {
    state.consecutiveBlocked = 0
  }

  const shouldLeaderIntervene = state.consecutiveBlocked >= LEADER_THRESHOLD
  return { shouldLeaderIntervene, updatedState: state }
}

/**
 * 检查是否达到最大重试次数
 */
export function isMaxRetriesExceeded(state: RetryState): boolean {
  return state.retryCount >= MAX_RETRY_COUNT
}

/**
 * Leader 介入决策
 * 条件：连续 BLOCKED >= LEADER_THRESHOLD 或 retry_count >= MAX_RETRY_COUNT
 */
export function shouldLeaderIntervene(state: RetryState): boolean {
  return (
    state.consecutiveBlocked >= LEADER_THRESHOLD ||
    state.retryCount >= MAX_RETRY_COUNT
  )
}

/**
 * 构建 Leader 介入动作
 */
export function buildLeaderIntervention(taskId: string, state: RetryState): LoopAction {
  return {
    type: 'LEADER_INTERVENTION',
    taskId,
    message: `任务 ${taskId} 连续 ${state.consecutiveBlocked} 次被架构规则阻塞，已达到 Leader 介入阈值 (${LEADER_THRESHOLD})，请人工审查`,
    retryCount: state.retryCount,
  }
}

/**
 * 安全重试包装器
 * 在重试前检查是否超过上限
 */
export function safeRetry<T>(
  taskId: string,
  state: RetryState,
  fn: () => Promise<T>,
): Promise<{ result?: T; action?: LoopAction; error?: string }> {
  if (isMaxRetriesExceeded(state)) {
    return Promise.resolve({
      error: `Max retries (${MAX_RETRY_COUNT}) exceeded for task ${taskId}`,
      action: buildLeaderIntervention(taskId, state),
    })
  }
  return fn().then(
    (result) => ({ result }),
    (err) => ({ error: err.message }),
  )
}
