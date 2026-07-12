// overlay/custom/client/loop/__tests__/integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { LocalStore } from '../../../server/loop/store/local-store'
import { LoopEngine } from '../../../server/loop/engine/loop-engine'
import { Verifier } from '../../../server/loop/engine/verifier'
import { BudgetGuard } from '../../../server/loop/engine/budget-guard'
import { StuckDetector } from '../../../server/loop/engine/stuck-detector'
import { HookManager } from '../../../server/loop/engine/hooks'
import { WorktreeManager } from '../../../server/loop/engine/worktree-manager'
import { SubagentDispatcher } from '../../../server/loop/engine/subagent-dispatcher'
import { WebhookConnector } from '../../../server/loop/connectors/webhook-connector'
import type { LoopInstance, LoopEvent } from '../types'

const TEST_DIR = '.loop-integration-test'

function makeLoop(): LoopInstance {
  return {
    id: 'integration-loop', name: 'Integration Test', goal: 'test',
    stopCondition: 'all done', pattern: 'daily-triage',
    schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Loop Integration', () => {
  let store: LocalStore
  let events: LoopEvent[]

  beforeEach(() => {
    store = new LocalStore(TEST_DIR)
    events = []
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  it('full tick cycle: create → discover (webhook) → handoff → validate → persist → schedule', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)

    const webhookConnector = new WebhookConnector()
    webhookConnector.enqueue(loop.id, { source: 'ci', eventType: 'test.failed', payload: { id: 1 } })

    const engine = new LoopEngine({
      store,
      webhookConnector,
      verifier: new Verifier({ requestHumanApproval: vi.fn().mockResolvedValue('approved' as const) }),
      dispatcher: new SubagentDispatcher({ invokeAgent: vi.fn().mockResolvedValue('done') }),
      worktreeManager: { create: vi.fn().mockResolvedValue('wt-1'), remove: vi.fn() } as any as WorktreeManager,
      budgetGuard: new BudgetGuard((e) => { events.push(e) }),
      stuckDetector: new StuckDetector(store),
      hookManager: new HookManager(),
      emitEvent: (e) => { events.push(e) },
    })

    await engine.tick(loop.id)

    // Verify events
    expect(events.some(e => e.type === 'loop.stage-transition')).toBe(true)
    expect(events.some(e => e.type === 'loop.task-discovered')).toBe(true)
    expect(events.some(e => e.type === 'loop.task-handed-off')).toBe(true)
    expect(events.some(e => e.type === 'loop.verification-complete')).toBe(true)
    expect(events.some(e => e.type === 'loop.tick-complete')).toBe(true)

    // Verify STATE.md was regenerated
    const mdPath = `${TEST_DIR}/STATE.md`
    expect(existsSync(mdPath)).toBe(true)
    const md = await fs.readFile(mdPath, 'utf-8')
    expect(md).toContain('integration-loop')

    // Verify loop status updated
    const updated = await store.getLoop(loop.id)
    expect(updated!.stats.currentIteration).toBe(1)
  })

  it('budget guard blocks tick when over budget', async () => {
    const loop = makeLoop()
    loop.stats.totalCost = 250 // over maxCostTotal of 200
    await store.createLoop(loop)

    const engine = new LoopEngine({
      store,
      verifier: new Verifier(),
      dispatcher: new SubagentDispatcher(),
      worktreeManager: { create: vi.fn(), remove: vi.fn() } as any as WorktreeManager,
      budgetGuard: new BudgetGuard((e) => { events.push(e) }),
      stuckDetector: new StuckDetector(store),
      hookManager: new HookManager(),
      emitEvent: (e) => { events.push(e) },
    })

    await engine.tick(loop.id)

    expect(events.some(e => e.type === 'loop.budget-warning')).toBe(true)
    const updated = await store.getLoop(loop.id)
    expect(updated!.status).toBe('paused') // throw mode → paused
  })
})
