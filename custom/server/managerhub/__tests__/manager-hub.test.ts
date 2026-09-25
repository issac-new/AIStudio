// 指挥中心聚合守门（antigravity：驾驶视图排序/working/idle/要人总数）。
import { describe, it, expect } from 'vitest'
import { managerHub, type AgentStatusCard } from '../manager-hub'

const card = (id: string, over: Partial<AgentStatusCard> = {}): AgentStatusCard => ({
  agentId: id, availability: 'online', workload: 'idle', needsHuman: 0, ...over,
})

describe('指挥中心聚合（antigravity 语义）', () => {
  it('驾驶视图排序（working 优先+要人计数）；汇总计数', () => {
    const hub = managerHub([
      card('a', { workload: 'idle' }),
      card('b', { workload: 'working', needsHuman: 2 }),
      card('c', { workload: 'queued', needsHuman: 1 }),
    ])
    expect(hub.agents.map((x) => x.agentId)).toEqual(['b', 'c', 'a'])  // working>queued>idle
    expect(hub.working).toBe(1)
    expect(hub.idle).toBe(1)
    expect(hub.needsHumanTotal).toBe(3)
    expect(managerHub([])).toMatchObject({ working: 0, needsHumanTotal: 0 })
  })
})
