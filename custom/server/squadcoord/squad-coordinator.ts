// overlay/squadcoord 域：squad leader 协调协议（multica/routa 驾驶舱协作主线，矩阵 §3.6 行 178 P0）。
//
// 协调协议两铁则（行 178：评估必录+dispatch 即停）：
// - **评估必录**：每次派单前必有评估记录（rationale 非空才可派）；
// - **dispatch 即停**：派单后协调器停等该批结果，不再叠加派发（防失控扇出）。
// 状态机：evaluate → dispatched（停等）→ collected（回收后才可再评估）。
// 衔接 mention-dispatch 派单半边（#7）与 workerabs 五态心跳：本层=协调状态纯函数。
export type CoordState = 'evaluating' | 'dispatched' | 'collected'

export interface Evaluation {
  /** 评估结论（必录铁则：rationale 非空）。 */
  rationale: string
  assignees: string[]
}

export interface CoordTransition {
  state: CoordState
  /** 拒绝原因（非法迁移时给出）。 */
  refusal?: string
}

/** 评估→派单（评估必录：rationale 空则拒派）。 */
export function dispatch(state: CoordState, ev: Evaluation): CoordTransition {
  if (state !== 'evaluating') {
    return { state, refusal: 'dispatch 即停：当前批未回收，禁止叠加派发' }
  }
  if (!ev.rationale.trim()) {
    return { state, refusal: '评估必录：rationale 为空禁止派单' }
  }
  if (ev.assignees.length === 0) {
    return { state, refusal: '无承接人' }
  }
  return { state: 'dispatched' }
}

/** 回收结果（dispatched→collected；再评估=collected→evaluating）。 */
export function collect(state: CoordState): CoordTransition {
  if (state !== 'dispatched') return { state, refusal: '仅 dispatched 可回收' }
  return { state: 'collected' }
}

export function reevaluate(state: CoordState): CoordTransition {
  if (state !== 'collected') return { state, refusal: '仅 collected 可开启下一轮评估' }
  return { state: 'evaluating' }
}
