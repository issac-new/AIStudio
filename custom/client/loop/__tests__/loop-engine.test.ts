// overlay/custom/client/loop/__tests__/loop-engine.test.ts
import { describe, it, expect, vi } from 'vitest'
import { LoopEngine } from '../../../server/loop/engine/loop-engine'
import type { LoopStateStore } from '../../../server/loop/store/state-store'
import type { LoopInstance, TaskContract, LoopEvent, VerificationRecord } from '../types'

function makeLoop(): LoopInstance {
  return {
    id: 'test-loop', name: 'Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'local',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

function makeMockStore(loop: LoopInstance): LoopStateStore {
  const contracts: TaskContract[] = []
  return {
    createLoop: vi.fn(),
    getLoop: vi.fn().mockResolvedValue(loop),
    listLoops: vi.fn().mockResolvedValue([loop]),
    updateLoop: vi.fn().mockImplementation(async (id, patch) => { Object.assign(loop, patch) }),
    deleteLoop: vi.fn(),
    appendContract: vi.fn().mockImplementation(async (c) => { contracts.push(c) }),
    getContract: vi.fn().mockImplementation(async (id) => contracts.find(c => c.id === id) ?? null),
    queryContracts: vi.fn().mockResolvedValue([]),
    updateContract: vi.fn(),
    appendVerification: vi.fn(),
    appendEvent: vi.fn(),
    queryEvents: vi.fn().mockResolvedValue([]),
    detectDrift: vi.fn().mockResolvedValue({ hasDrift: false, details: '' }),
  }
}

describe('LoopEngine', () => {
  it('completes a tick with no discoveries (idle → scheduling)', async () => {
    const loop = makeLoop()
    const store = makeMockStore(loop)
    const events: LoopEvent[] = []
    const engine = new LoopEngine({
      store: store as any,
      verifier: { verify: vi.fn() } as any,
      dispatcher: { dispatch: vi.fn() } as any,
      worktreeManager: { create: vi.fn(), remove: vi.fn() } as any,
      budgetGuard: { check: vi.fn().mockReturnValue({ allow: true }) } as any,
      stuckDetector: { check: vi.fn().mockResolvedValue(null), handleStuck: vi.fn() } as any,
      hookManager: { run: vi.fn().mockResolvedValue({ decision: 'allow' }) } as any,
      emitEvent: (e) => { events.push(e) },
    })
    await engine.tick('test-loop')
    expect(loop.stats.currentIteration).toBe(1)
    expect(events.some(e => e.type === 'loop.tick-complete')).toBe(true)
  })

  it('transitions through discovery → handoff → validation → persistence → scheduling', async () => {
    const loop = makeLoop()
    loop.schedule.mode = 'manual'
    const store = makeMockStore(loop)
    const events: LoopEvent[] = []
    const mockContract: TaskContract = {
      id: 'task/test-001', loopId: 'test-loop',
      source: { type: 'github-issue', ref: '#1', summary: 'test bug', rawPayload: {} },
      readPlan: { requiredReads: [] },
      writeBoundary: ['packages/**'],
      verificationIntent: { programmatic: [], judge: null, human: null },
      resultTemplate: { artifactType: 'patch', requiredFiles: [] },
      worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    }
    const mockVerify = vi.fn().mockResolvedValue({
      contractId: 'task/test-001',
      results: { programmatic: [], judge: null, human: null },
      overall: 'passed', finalResponseGuard: true,
    } as VerificationRecord)

    const engine = new LoopEngine({
      store: store as any,
      githubConnector: { discover: vi.fn().mockResolvedValue([mockContract]) } as any,
      verifier: { verify: mockVerify } as any,
      dispatcher: { dispatch: vi.fn() } as any,
      worktreeManager: { create: vi.fn().mockResolvedValue('wt-1'), remove: vi.fn() } as any,
      budgetGuard: { check: vi.fn().mockReturnValue({ allow: true }) } as any,
      stuckDetector: { check: vi.fn().mockResolvedValue(null), handleStuck: vi.fn() } as any,
      hookManager: { run: vi.fn().mockResolvedValue({ decision: 'allow' }) } as any,
      emitEvent: (e) => { events.push(e) },
    })
    await engine.tick('test-loop')

    const transitions = events.filter(e => e.type === 'loop.stage-transition') as any[]
    expect(transitions.length).toBeGreaterThanOrEqual(4)
    expect(transitions[0].to).toBe('discovery')
    expect(transitions.some(t => t.to === 'handoff')).toBe(true)
    expect(transitions.some(t => t.to === 'validation')).toBe(true)
    expect(transitions.some(t => t.to === 'persistence')).toBe(true)
    expect(transitions.some(t => t.to === 'scheduling')).toBe(true)
  })
})
