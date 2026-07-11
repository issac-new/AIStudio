// overlay/custom/client/loop/__tests__/matrix-store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock matrix-js-sdk before importing MatrixStore
vi.mock('matrix-js-sdk', () => {
  const mockClient = {
    startClient: vi.fn(),
    stopClient: vi.fn(),
    sendStateEvent: vi.fn().mockResolvedValue('$event:id'),
    sendMessage: vi.fn().mockResolvedValue('$event:id'),
    getStateEvent: vi.fn().mockResolvedValue(null),
    roomState: vi.fn().mockResolvedValue([]),
    createMessagesRequest: vi.fn().mockResolvedValue({ chunk: [] }),
  }
  return {
    createClient: vi.fn(() => mockClient),
  }
})

import { MatrixStore } from '../../../server/loop/store/matrix-store'
import type { LoopInstance } from '../types'

function makeLoop(id: string = 'matrix-test-loop'): LoopInstance {
  return {
    id, name: 'Matrix Test', goal: 'test', stopCondition: 'done',
    pattern: 'daily-triage', schedule: { mode: 'manual', timezone: 'UTC' },
    stage: 'discovery', status: 'idle', autonomyLevel: 'L1', stateAdapter: 'matrix',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    lastTickAt: null, nextTickAt: null,
    budget: { maxCostPerTick: 50, maxCostTotal: 200, killMode: 'throw', warningThreshold: 0.8 },
    stats: { totalIterations: 0, tasksDiscovered: 0, tasksCompleted: 0, tasksBlocked: 0, totalCost: 0, currentIteration: 0 },
  }
}

describe('MatrixStore', () => {
  let store: MatrixStore

  beforeEach(() => {
    vi.clearAllMocks()
    store = new MatrixStore({
      homeserverUrl: 'https://matrix.org',
      accessToken: 'test-token',
      userId: '@bot:matrix.org',
      roomId: '!test:matrix.org',
    })
  })

  it('creates a loop via state event', async () => {
    const loop = makeLoop()
    await store.createLoop(loop)
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    expect(client.sendStateEvent).toHaveBeenCalled()
  })

  it('returns null for non-existent loop', async () => {
    const result = await store.getLoop('nonexistent')
    expect(result).toBeNull()
  })

  it('lists loops (empty when no state events)', async () => {
    const loops = await store.listLoops()
    expect(loops).toEqual([])
  })

  it('detects no drift (Matrix is source of truth)', async () => {
    const report = await store.detectDrift('any')
    expect(report.hasDrift).toBe(false)
  })

  it('safeId replaces slashes for Matrix state keys', async () => {
    await store.appendContract({
      id: 'task/fix-bug-001',
      loopId: 'matrix-test-loop',
      source: { type: 'github-issue', ref: '#1', summary: 'test', rawPayload: {} },
      readPlan: { requiredReads: [] },
      writeBoundary: ['packages/**'],
      verificationIntent: { programmatic: [], judge: null, human: null },
      resultTemplate: { artifactType: 'patch', requiredFiles: [] },
      worktreeId: null, assignee: 'maker', status: 'queued', attempts: 0, maxAttempts: 3,
    })
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    // sendStateEvent wrapper calls client.sendStateEvent(roomId, type, content, key)
    // so the state key is the 4th positional arg (index 3)
    const call = client.sendStateEvent.mock.calls[0]
    expect(call[3]).toBe('task__fix-bug-001') // state key with __ not /
  })
})
