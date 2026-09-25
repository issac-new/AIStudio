// A2A 协议面守门（routa：卡片校验/终态判定/externalTaskId 幂等映射）。
import { describe, it, expect } from 'vitest'
import { bindExternalTask, isTerminal, validateAgentCard } from '../a2a-protocol'

describe('A2A 契约（routa v0.3 语义）', () => {
  it('Agent Card 校验（名/技能/端点）', () => {
    expect(validateAgentCard({ name: 'x', skills: ['s'], endpoint: 'https://a.b' })).toEqual([])
    expect(validateAgentCard({ name: '', skills: [], endpoint: 'ftp://x' })).toHaveLength(3)
  })

  it('终态集；externalTaskId 幂等映射', () => {
    expect(isTerminal('completed')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('working')).toBe(false)
    expect(isTerminal('submitted')).toBe(false)
    let tasks = bindExternalTask([], 'ext-1', 'local-1')
    expect(tasks[0]).toMatchObject({ externalTaskId: 'ext-1', localTaskId: 'local-1', state: 'submitted' })
    tasks = bindExternalTask(tasks, 'ext-1', 'local-2')  // 幂等重映射
    expect(tasks).toHaveLength(1)
    expect(tasks[0].localTaskId).toBe('local-2')
    expect(bindExternalTask(tasks, 'ext-2', 'local-3')).toHaveLength(2)
  })
})
