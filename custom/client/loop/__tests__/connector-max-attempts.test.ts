// overlay/custom/client/loop/__tests__/connector-max-attempts.test.ts
// P3 台账（Task 1 审查转来）：三连接器（github/local-git/webhook）的 discover 产物
// 契约消费 loop.maxAttempts——与图编译器 resolveRepairMaxAttempts 同源，
// 消除"契约配 ≥5 时 repair 回边先耗尽"边界。缺省时 createContract 回退 3。
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
  const u = String(url)
  if (u.includes('/issues?')) {
    return { ok: true, json: async () => [{ number: 1, title: 'fix login' }] }
  }
  return { ok: true, json: async () => ({ workflow_runs: [] }) }
}))

// git 命令 mock：local-git 的 @{u}..HEAD 返回一条提交，其余报错（github 的 commits 路径走空）
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))
vi.mock('util', async (orig) => ({
  ...await orig(),
  promisify: () => async (cmd: string, args: string[]) => {
    if (cmd === 'git' && args.includes('@{u}..HEAD')) {
      return { stdout: 'abc1234\nfix thing\n' }
    }
    throw new Error('not a git repo')
  },
}))

import { GithubConnector } from '../../../server/loop/connectors/github-connector'
import { LocalGitConnector } from '../../../server/loop/connectors/local-git-connector'
import { WebhookConnector } from '../../../server/loop/connectors/webhook-connector'
import type { LoopInstance } from '../types'

function makeLoop(over: Partial<LoopInstance> = {}): LoopInstance {
  return {
    id: 'l', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'discovery', status: 'idle',
    autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '',
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('connectors 消费 loop.maxAttempts（P3 台账）', () => {
  it('github：issue 契约带 loop.maxAttempts=5', async () => {
    const result = await new GithubConnector({ repo: 'o/r' }).discover(makeLoop({ maxAttempts: 5 }))
    expect(result.length).toBeGreaterThan(0)
    for (const c of result) expect(c.maxAttempts).toBe(5)
  })

  it('github：loop 未配置 maxAttempts → 契约回退 3（createContract 缺省）', async () => {
    const result = await new GithubConnector({ repo: 'o/r' }).discover(makeLoop())
    expect(result.length).toBeGreaterThan(0)
    for (const c of result) expect(c.maxAttempts).toBe(3)
  })

  it('local-git：unpushed 契约带 loop.maxAttempts=5', async () => {
    const result = await new LocalGitConnector('/tmp').discover(makeLoop({ maxAttempts: 5 }))
    expect(result.length).toBeGreaterThan(0)
    for (const c of result) expect(c.maxAttempts).toBe(5)
  })

  it('webhook：payload 契约带 loop.maxAttempts=7', async () => {
    const connector = new WebhookConnector()
    connector.enqueue('l', { source: 'gh', eventType: 'push', payload: { ref: 'main' } })
    const result = await connector.discover(makeLoop({ maxAttempts: 7 }))
    expect(result).toHaveLength(1)
    expect(result[0].maxAttempts).toBe(7)
  })
})
