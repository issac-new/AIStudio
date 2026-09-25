// overlay/goalpreempt 域：运行中 queue+GOAL-05 让位（minimax GOAL-05，矩阵 §3.6 行 166 P1）。
//
// minimax GOAL-05 语义（用户消息>自治目标）：自治目标推进中用户消息到达即**让位**：
// - **优先级序**：user-message > goal-turn（用户消息永远插队）；
// - **让位动作**：goal 让出执行位（running→yielded），用户消息先走；
// - **续跑**：用户消息处理完，goal 从让位点续（yielded→resumable）。
// 衔接 queue 让位半边（行 264 域合并）与 goalautonomy 三档停点：本层=让位判定纯函数。
export type PreemptState = 'idle' | 'running' | 'yielded'

export interface PreemptEvent {
  kind: 'user-message' | 'goal-turn'
  at: number
}

export interface PreemptDecision {
  /** 本次事件是否让位（goal 为 user-message 让路）。 */
  yields: boolean
  stateAfter: PreemptState
  /** 本次应执行的事件序（user-message 优先）。 */
  order: Array<'user-message' | 'goal-turn'>
}

/** 让位判定（GOAL-05：用户消息>自治目标）。 */
export function preempt(state: PreemptState, event: PreemptEvent): PreemptDecision {
  if (event.kind === 'user-message') {
    return {
      yields: state === 'running',
      stateAfter: state === 'running' ? 'yielded' : state === 'yielded' ? 'yielded' : 'idle',
      order: ['user-message'],
    }
  }
  // goal-turn：仅在无用户消息占位时推进
  if (state === 'yielded') {
    return { yields: true, stateAfter: 'yielded', order: [] } // 用户未处理完，goal 不抢
  }
  return { yields: false, stateAfter: 'running', order: ['goal-turn'] }
}

/** 用户消息处理完：让位点续跑。 */
export function resumeGoal(state: PreemptState): PreemptState {
  return state === 'yielded' ? 'running' : state
}
