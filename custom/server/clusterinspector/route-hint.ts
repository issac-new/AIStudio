// overlay[clusterinspector×faileroute] 巡检异常→失败路由标注（2026-10-14 阿里调研
// 轮 E 收尾件）：检测器命中即随 govbus 事件携带 routeHint（失败类型→回退点→携带物
// 的建议行）——监控事件直接引用路由表，处置人照 hint 推进（纪律 48 的 300s 动作
// 时限配「往哪推」的答案）。标注-only：不改派不发指令（改行为必须过人）。
import { resolveRoute, type FailureClass } from '../faileroute/failure-routes'

/** 检测器 → 失败类型映射（仅停滞族与失控环；无映射=不带 hint）。 */
export const DETECTOR_FAILURE_CLASS: Record<string, FailureClass> = {
  'card.blocked-stale': 'stall_timeout',
  'dispatcher.stuck': 'stall_timeout',
  'machine.silent': 'stall_timeout',
  'task.agent-silent': 'stall_timeout',
  'session.stalled': 'stall_timeout',
  'kanban.stale-worker': 'stall_timeout',
  'session.runaway-loop': 'non_convergent',
}

/** 给异常事件算路由 hint 行；无映射检测器返回 null。fail-soft（表解析异常→null）。 */
export function routeHintForDetector(detector: string): string | null {
  const fc = DETECTOR_FAILURE_CLASS[detector]
  if (!fc) return null
  try {
    return resolveRoute(fc).hintLine
  } catch {
    return null
  }
}
