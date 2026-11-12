// squad 协调协议守门（评估必录/dispatch 即停/状态机迁移）。
import { describe, it, expect } from 'vitest'
import { dispatch, collect, reevaluate, type CoordState } from '../squad-coordinator'

const ev = { rationale: 'A 任务需双人验证', assignees: ['w1', 'w2'] }

describe('评估必录+dispatch 即停', () => {
  it('rationale 空拒派；dispatched 后再派被拒（即停）', () => {
    expect(dispatch('evaluating', { ...ev, rationale: '  ' }).refusal).toContain('评估必录')
    const d = dispatch('evaluating', ev)
    expect(d.state).toBe('dispatched')
    const again = dispatch('dispatched', ev)
    expect(again.refusal).toContain('dispatch 即停')
    expect(again.state).toBe('dispatched')
  })
  it('无承接人拒派', () => {
    expect(dispatch('evaluating', { ...ev, assignees: [] }).refusal).toContain('无承接人')
  })
})

describe('状态机迁移', () => {
  it('dispatched→collected→evaluating 闭环；非法迁移拒', () => {
    expect(collect('dispatched').state).toBe('collected')
    expect(reevaluate('collected').state).toBe('evaluating')
    expect(collect('evaluating').refusal).toContain('仅 dispatched')
    expect(reevaluate('dispatched').refusal).toContain('仅 collected')
    const states: CoordState[] = ['evaluating', 'dispatched', 'collected']
    expect(states).toHaveLength(3)
  })
})
