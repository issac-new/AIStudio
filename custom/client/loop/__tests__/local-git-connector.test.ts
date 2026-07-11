// overlay/custom/client/loop/__tests__/local-git-connector.test.ts
import { describe, it, expect } from 'vitest'
import { LocalGitConnector } from '../../../server/loop/connectors/local-git-connector'
import type { LoopInstance } from '../types'

function makeLoop(): LoopInstance {
  return { id: 'l', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' }, stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null, budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 }, stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 } }
}

describe('LocalGitConnector', () => {
  it('returns empty array when no unpushed commits (or no upstream)', async () => {
    const connector = new LocalGitConnector('/tmp')
    const result = await connector.discover(makeLoop())
    expect(result).toEqual([])
  })
})
