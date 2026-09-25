// overlay/goalautonomy 域：Goal 自主档（qoder §三差距表 P2 吸收，矩阵 §3.2 qoder P2）。
//
// qoder 语义（Goal"自主到底"档——Quest Goal 模式）：goal 的推进自主度分档——
// - **autonomous**（自主到底）：一路做完，只在不可达/重大分叉才停；
// - **checkin**（步进确认）：每步向人确认；
// - **assistive**（辅助）：只建议不执行。
// 衔接 hermes goals.py（goal 预算）与 goal-budget（三预算）：本层=自主度判定
// （停不停/停在哪些点），执行归 loop/goal 运行时。
export type AutonomyMode = 'autonomous' | 'checkin' | 'assistive'

export interface GoalStopFacts {
  /** 目标可达性（goal 域：impossible 判定）。 */
  reachable: boolean
  /** 是否重大分叉（多方案选择/风险操作）。 */
  majorFork: boolean
  /** 预算是否触顶（goal-budget exhausted）。 */
  budgetExhausted: boolean
}

export interface GoalStopDecision {
  stop: boolean
  reason: string
}

/** 自主档→停不停判定（qoder 自主到底语义：分档决定停点）。 */
export function shouldStop(mode: AutonomyMode, facts: GoalStopFacts): GoalStopDecision {
  if (!facts.reachable) {
    return { stop: true, reason: '目标不可达（goal impossible）——三档同停' }
  }
  if (facts.budgetExhausted) {
    return { stop: true, reason: '预算触顶（goal-budget exhausted）——三档同停' }
  }
  if (mode === 'assistive') {
    return { stop: true, reason: 'assistive 档：只建议不执行，每步停' }
  }
  if (mode === 'checkin') {
    return { stop: true, reason: 'checkin 档：步进确认，每步向人确认' }
  }
  if (facts.majorFork) {
    return { stop: true, reason: 'autonomous 档：重大分叉才停（qoder 自主到底例外点）' }
  }
  return { stop: false, reason: 'autonomous 档：一路推进' }
}
