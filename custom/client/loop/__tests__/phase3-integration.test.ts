// overlay/custom/client/loop/__tests__/phase3-integration.test.ts
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
import { CentralizedScheduler } from '../../../server/loop/engine/centralized-scheduler'
import type { LoopInstance, LoopEvent } from '../types'

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}))

const TEST_DIR = '.loop-phase3-test'

function makeLoop(): LoopInstance {
  return {
    id: 'phase3-loop', name: 'Phase3 Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'cron', cron: '0 9 * * *', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'saas',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null,
    nextTickAt: new Date(Date.now() - 1000).toISOString(), // past → should tick
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Phase 3 Integration (SaaS Layer)', () => {
  let store: LocalStore
  let events: LoopEvent[]

  beforeEach(() => {
    store = new LocalStore(TEST_DIR)
    events = []
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  it('centralized scheduler polls and ticks eligible loops', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)

    const webhookConnector = new WebhookConnector()

    const engine = new LoopEngine({
      store,
      webhookConnector,
      verifier: new Verifier({ requestHumanApproval: vi.fn().mockResolvedValue('approved' as const) }),
      dispatcher: new SubagentDispatcher({ invokeAgent: vi.fn().mockResolvedValue('done') }),
      worktreeManager: { create: vi.fn().mockResolvedValue('wt-1'), remove: vi.fn() } as any,
      budgetGuard: new BudgetGuard((e) => { events.push(e) }),
      stuckDetector: new StuckDetector(store),
      hookManager: new HookManager(),
      emitEvent: async (e) => { events.push(e) },
    })

    const sched = new CentralizedScheduler(store, engine, 100)
    await sched.poll()
    // poll() fires engine.tick() without awaiting (fire-and-forget design).
    // Flush the microtask/macrotask queue so the tick completes before asserting.
    await new Promise(r => setTimeout(r, 50))

    // Verify the loop was ticked
    expect(events.some(e => e.type === 'loop.tick-complete')).toBe(true)
  })

  it('centralized scheduler skips running loops', async () => {
    const loop = makeLoop()
    loop.status = 'running'
    await store.createLoop(loop)

    const engine = { tick: vi.fn() } as any
    const sched = new CentralizedScheduler(store, engine, 100)
    await sched.poll()

    expect(engine.tick).not.toHaveBeenCalled()
  })
})
