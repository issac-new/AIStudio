// overlay[clusterinspector×faileroute] 路由标注测试：检测器映射 + emit 载荷携带。
import { describe, it, expect } from 'vitest'
import { DETECTOR_FAILURE_CLASS, routeHintForDetector } from '../route-hint'
import { resolveRoute } from '../../faileroute/failure-routes'

describe('巡检→失败路由标注', () => {
  it('映射表只含停滞族与失控环；hint 行含类型/动作/携带/依据', () => {
    expect(Object.keys(DETECTOR_FAILURE_CLASS).sort()).toEqual([
      'card.blocked-stale', 'dispatcher.stuck', 'kanban.stale-worker', 'machine.silent',
      'session.runaway-loop', 'session.stalled', 'task.agent-silent',
    ].sort())
    const hint = routeHintForDetector('card.blocked-stale') as string
    expect(hint).toContain('stall_timeout → 人闸')
    expect(hint).toContain('携带：')
    expect(hint).toContain('依据：')
    expect(routeHintForDetector('session.runaway-loop')).toContain('non_convergent')
  })

  it('无映射检测器返回 null（不带 hint 不误导）', () => {
    expect(routeHintForDetector('gateway.unreachable')).toBeNull()
    expect(routeHintForDetector('load.imbalance')).toBeNull()
  })

  it('hint 与 resolveRoute 同源（映射值进表解析）', () => {
    for (const [detector, fc] of Object.entries(DETECTOR_FAILURE_CLASS)) {
      expect(routeHintForDetector(detector)).toBe(resolveRoute(fc).hintLine)
    }
  })
})
