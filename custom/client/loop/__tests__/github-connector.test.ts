// overlay/custom/client/loop/__tests__/github-connector.test.ts
import { describe, it, expect, vi } from 'vitest'
import { GithubConnector } from '../../../server/loop/connectors/github-connector'
import type { LoopInstance } from '../types'

function makeLoop(): LoopInstance {
  return { id: 'l', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null, budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 }, stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 } }
}

describe('GithubConnector', () => {
  it('returns empty array when fetch fails', async () => {
    const connector = new GithubConnector({ repo: 'invalid/invalid' })
    const result = await connector.discover(makeLoop())
    expect(result).toEqual([])
  })
})
