// overlay/custom/client/loop/__tests__/webhook-connector.test.ts
import { describe, it, expect } from 'vitest'
import { WebhookConnector } from '../../../server/loop/connectors/webhook-connector'
import type { LoopInstance } from '../types'

function makeLoop(): LoopInstance {
  return { id: 'wh-loop', name: 'n', goal: 'g', stopCondition: 's', pattern: 'daily-triage', schedule: { mode: 'webhook', timezone: 'UTC' }, stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local', createdAt: '', updatedAt: '', lastTickAt: null, nextTickAt: null, budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 }, stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 } }
}

describe('WebhookConnector', () => {
  it('returns empty when no payloads enqueued', async () => {
    const connector = new WebhookConnector()
    const result = await connector.discover(makeLoop())
    expect(result).toEqual([])
  })

  it('returns contracts when payloads are enqueued and clears queue', async () => {
    const connector = new WebhookConnector()
    connector.enqueue('wh-loop', { source: 'ci', eventType: 'workflow.failed', payload: { runId: 42 } })
    const result = await connector.discover(makeLoop())
    expect(result.length).toBe(1)
    expect(result[0].source.type).toBe('webhook')
    expect(result[0].source.ref).toBe('ci:workflow.failed')
    // second discover should be empty
    const result2 = await connector.discover(makeLoop())
    expect(result2).toEqual([])
  })
})
