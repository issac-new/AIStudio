// overlay/browserloop 域：浏览器回路（antigravity §四 P1-6 吸收，矩阵 §3.1 antigravity P2）。
//
// antigravity 语义（代理驱动浏览器回路：截图→动作→录制回流）：browser subagent
// 闭环——**截图**（看页面）→**动作**（点击/输入）→**录制回流**（操作录像回传作证据）。
// 衔接 413 证据台账（录制即工件）与 browsersec（准入）：本层=回路阶段判定纯函数。
export type LoopStage = 'screenshot' | 'action' | 'recording'

export interface BrowserStep {
  stepId: string
  stage: LoopStage
  at: number
  /** 录制回流产物（recording 阶段的工件引用——回流证据）。 */
  artifactRef?: string
}

export interface LoopState {
  /** 当前阶段序（截图→动作→录制循环）。 */
  stage: LoopStage
  completedCycles: number
  /** 录制回流计数（证据台账数）。 */
  recorded: number
}

const NEXT: Record<LoopStage, LoopStage> = { screenshot: 'action', action: 'recording', recording: 'screenshot' }

/** 回路推进（截图→动作→录制→截图…；每录完一循环+1）。 */
export function advanceLoop(state: LoopState, step: BrowserStep): LoopState {
  if (step.stage !== state.stage) return state  // 阶段错位不动（严格回路）
  const next: LoopState = { ...state, stage: NEXT[state.stage] }
  if (state.stage === 'recording') {
    next.completedCycles += 1
    next.recorded += step.artifactRef ? 1 : 0  // 录制回流有工件才计
  }
  return next
}

/** 回路汇总（驾驶视图：循环数/证据数）。 */
export function loopSummary(steps: readonly BrowserStep[]): { cycles: number; artifacts: number } {
  return {
    cycles: steps.filter((s) => s.stage === 'recording').length,
    artifacts: steps.filter((s) => s.stage === 'recording' && s.artifactRef).length,
  }
}
