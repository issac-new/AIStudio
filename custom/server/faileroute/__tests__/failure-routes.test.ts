// overlay[faileroute] 失败路由表测试：五类全覆盖、升档覆盖、标注行格式。
import { describe, it, expect } from 'vitest'
import { FAILURE_CLASSES, ROUTE_TABLE, resolveRoute, hintLineFor } from '../failure-routes'

describe('失败路由显式表', () => {
  it('五类失败各有路由规则（action/回退点/携带物/既有件锚齐备）', () => {
    expect(FAILURE_CLASSES).toHaveLength(5)
    for (const c of FAILURE_CLASSES) {
      const r = ROUTE_TABLE[c]
      expect(r.failureClass).toBe(c)
      expect(['in_place_fix', 'upstream_redispatch', 'human_gate']).toContain(r.action)
      expect(r.fallbackTo.length).toBeGreaterThan(0)
      expect(r.carry.length).toBeGreaterThan(0)
      expect(r.existingAnchor.length).toBeGreaterThan(0)
    }
  })

  it('三档回退齐全：原地修/回上游/人闸各在表中（中间档=direction_wrong）', () => {
    expect(ROUTE_TABLE.test_fail.action).toBe('in_place_fix')
    expect(ROUTE_TABLE.direction_wrong.action).toBe('upstream_redispatch')
    expect(ROUTE_TABLE.non_convergent.action).toBe('human_gate')
  })

  it('test_fail 重试≥3 升档人闸（防原地修死循环）', () => {
    const d = resolveRoute('test_fail', { attempts: 3 })
    expect(d.rule.action).toBe('human_gate')
    expect(d.overrideReason).toContain('已尝试 3 次')
    const d2 = resolveRoute('test_fail', { attempts: 2 })
    expect(d2.rule.action).toBe('in_place_fix')
    expect(d2.overrideReason).toBeUndefined()
  })

  it('预算触顶与停滞超时都走人闸但回退点不同', () => {
    expect(resolveRoute('budget_exhausted').rule.fallbackTo).toContain('escalation')
    expect(resolveRoute('stall_timeout').rule.fallbackTo).toContain('定性')
  })

  it('未知类型如实抛错；标注行含类型/动作/携带/依据', () => {
    expect(() => resolveRoute('nonsense' as never)).toThrow('未知失败类型')
    const line = hintLineFor(ROUTE_TABLE.direction_wrong)
    expect(line).toContain('direction_wrong → 带证据回上游')
    expect(line).toContain('携带：失败证据')
    expect(line).toContain('依据：')
  })
})
