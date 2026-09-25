// 列级编排守门（行 195：列绑定/门禁前置/失败策略）。
import { describe, it, expect } from 'vitest'
import { onColumnEnter, applyFailures, type ColumnAutomation } from '../automation-steps'

const auto = (over: Partial<ColumnAutomation> = {}): ColumnAutomation => ({
  column: 'review',
  steps: [
    { stepId: 's1', command: 'npm test', requiresGate: true },
    { stepId: 's2', command: 'npm run lint', requiresGate: false },
    { stepId: 's3', command: 'npm run build', requiresGate: true },
  ],
  failurePolicy: 'fail-fast', ...over,
})

describe('onColumnEnter（门禁前置）', () => {
  it('门禁未过：requiresGate 步骤 skip（skip 非失败不即停），非门禁步照常', () => {
    const plan = onColumnEnter(auto(), false)
    expect(plan.items.map((i) => i.skipped)).toEqual([true, false, true])
    expect(plan.items[0].skipReason).toContain('门禁未过')
    expect(plan.items[2].skipReason).toContain('门禁未过')
    expect(plan.items[1].skipped).toBe(false)
  })
  it('门禁过：全执行', () => {
    const plan = onColumnEnter(auto(), true)
    expect(plan.items.every((i) => !i.skipped)).toBe(true)
    expect(plan.column).toBe('review')
  })
  it('continue 策略：门禁未过只跳门禁步不即停', () => {
    const plan = onColumnEnter(auto({ failurePolicy: 'continue' }), false)
    expect(plan.items.map((i) => i.skipped)).toEqual([true, false, true])
  })
})

describe('applyFailures（失败回放）', () => {
  it('fail-fast：首失败后全 skip', () => {
    const plan = onColumnEnter(auto(), true)
    const applied = applyFailures(plan, 'fail-fast', ['s2'])
    expect(applied.items[0].skipped).toBe(false)
    expect(applied.items[2].skipped).toBe(true)
    expect(applied.items[2].skipReason).toContain('fail-fast')
  })
})
