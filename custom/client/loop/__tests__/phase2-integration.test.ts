// overlay/custom/client/loop/__tests__/phase2-integration.test.ts
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
import { MatrixBot } from '../../../server/loop/engine/matrix-bot'
import { TeamApprovalManager, type ApprovalRequest } from '../../../server/loop/engine/team-approval'
import type { LoopInstance, LoopEvent } from '../types'

vi.mock('matrix-js-sdk', () => ({
  createClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue('$event:id'),
    sendStateEvent: vi.fn().mockResolvedValue('$event:id'),
    startClient: vi.fn(),
    stopClient: vi.fn(),
    getStateEvent: vi.fn().mockResolvedValue(null),
    roomState: vi.fn().mockResolvedValue([]),
    createMessagesRequest: vi.fn().mockResolvedValue({ chunk: [] }),
  })),
}))

const TEST_DIR = '.loop-phase2-test'

function makeLoop(): LoopInstance {
  return {
    id: 'phase2-loop', name: 'Phase2 Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'matrix',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('Phase 2 Integration (Team Layer)', () => {
  let store: LocalStore
  let events: LoopEvent[]
  let matrixBot: MatrixBot
  let approvalMgr: TeamApprovalManager

  beforeEach(async () => {
    store = new LocalStore(TEST_DIR)
    events = []
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    matrixBot = new MatrixBot(client, '!room:matrix.org')
    approvalMgr = new TeamApprovalManager(client, '!room:matrix.org')
  })

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await fs.rm(TEST_DIR, { recursive: true, force: true })
  })

  it('full tick with webhook discovery + Matrix bot notifications', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)

    const webhookConnector = new WebhookConnector()
    webhookConnector.enqueue(loop.id, { source: 'ci', eventType: 'test.failed', payload: { id: 1 } })

    const engine = new LoopEngine({
      store,
      webhookConnector,
      verifier: new Verifier({ requestHumanApproval: vi.fn().mockResolvedValue('approved' as const) }),
      dispatcher: new SubagentDispatcher({ invokeAgent: vi.fn().mockResolvedValue('done') }),
      worktreeManager: { create: vi.fn().mockResolvedValue('wt-1'), remove: vi.fn() } as any,
      budgetGuard: new BudgetGuard((e) => { events.push(e) }),
      stuckDetector: new StuckDetector(store),
      hookManager: new HookManager(),
      emitEvent: async (e) => {
        events.push(e)
        await matrixBot.notify(e)  // Bot formats and sends to Matrix
      },
    })

    await engine.tick(loop.id)

    // Verify events
    expect(events.some(e => e.type === 'loop.stage-transition')).toBe(true)
    expect(events.some(e => e.type === 'loop.task-discovered')).toBe(true)
    expect(events.some(e => e.type === 'loop.tick-complete')).toBe(true)
  })

  it('team approval flow resolves via Matrix', async () => {
    const request: ApprovalRequest = {
      contractId: 'task/phase2-001',
      loopId: 'phase2-loop',
      approvers: ['@alice:matrix.org'],
      summary: 'Test approval',
      worktreeId: 'wt-1',
      timestamp: new Date().toISOString(),
    }

    const promise = approvalMgr.requestApproval(request)
    approvalMgr.handleApprovalResponse('task/phase2-001', '@alice:matrix.org', 'approved')
    const decision = await promise
    expect(decision).toBe('approved')
  })
})
