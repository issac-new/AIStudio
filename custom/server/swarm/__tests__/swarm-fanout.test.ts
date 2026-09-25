// swarm 扇出守门（kimi：批量分解/并发限流/排队计数/空文本过滤）。
import { describe, it, expect } from 'vitest'
import { planFanout } from '../swarm-fanout'

describe('AgentSwarm 扇出（kimi 语义）', () => {
  it('批量分解+并发限流+排队计数', () => {
    const plan = planFanout('大任务', ['a', 'b', 'c', 'd', 'e'], { concurrencyLimit: 2 })
    expect(plan.items).toHaveLength(5)
    expect(plan.concurrencyLimit).toBe(2)
    expect(plan.queued).toBe(3)
    expect(plan.items[0]).toMatchObject({ text: 'a', agent: 'zcode' })
  })

  it('默认并发 8；空文本过滤；自定义 agent', () => {
    const plan = planFanout('t', ['x', '', '  ', 'y'], { agent: 'codex' })
    expect(plan.items).toHaveLength(2)
    expect(plan.concurrencyLimit).toBe(8)
    expect(plan.queued).toBe(0)
    expect(plan.items[0].agent).toBe('codex')
  })
})
