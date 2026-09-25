// GOAL-05 让位守门（用户消息>自治目标：让位/续跑/不抢）。
import { describe, it, expect } from 'vitest'
import { preempt, resumeGoal, type PreemptState } from '../goal-preemption'

describe('preempt（GOAL-05 优先级序）', () => {
  it('运行中用户消息到达=让位；空闲则直走不迁移', () => {
    const p = preempt('running', { kind: 'user-message', at: 1 })
    expect(p.yields).toBe(true)
    expect(p.stateAfter).toBe('yielded')
    expect(p.order).toEqual(['user-message'])
    const idle = preempt('idle', { kind: 'user-message', at: 2 })
    expect(idle.yields).toBe(false)
    expect(idle.stateAfter).toBe('idle')
  })
  it('yielded 态 goal-turn 不抢位；running 态 goal 正常推进', () => {
    expect(preempt('yielded', { kind: 'goal-turn', at: 3 }).order).toEqual([])
    const g = preempt('running', { kind: 'goal-turn', at: 4 })
    expect(g.stateAfter).toBe('running')
    expect(g.order).toEqual(['goal-turn'])
  })
})

describe('resumeGoal（让位点续跑）', () => {
  it('yielded→running；其余态原样', () => {
    expect(resumeGoal('yielded')).toBe('running')
    expect(resumeGoal('idle')).toBe('idle')
    const states: PreemptState[] = ['idle', 'running', 'yielded']
    expect(states).toHaveLength(3)
  })
})
