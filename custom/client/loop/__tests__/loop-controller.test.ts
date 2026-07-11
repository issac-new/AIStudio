// overlay/custom/client/loop/__tests__/loop-controller.test.ts
//
// Integration smoke test for the Loop Engineering REST controller.
//
// Verifies that createLoopRouter() returns a @koa/router Router instance whose
// `.routes` method is callable when wired with mock loop subsystem dependencies.
// The controller is constructed with mock implementations of LoopStateStore,
// Scheduler, and WebhookConnector so the test does not touch the filesystem
// (LocalStore) or spawn subagents.
import { describe, it, expect, vi } from 'vitest'
// Note: server tests can't use @ alias; use relative imports

describe('Loop Controller (integration)', () => {
  it('createLoopRouter returns a Router', async () => {
    const { createLoopRouter } = await import('../../../server/loop/controllers/loop')
    const mockStore = {
      listLoops: vi.fn().mockResolvedValue([]),
      getLoop: vi.fn(), createLoop: vi.fn(), updateLoop: vi.fn(), deleteLoop: vi.fn(),
      appendContract: vi.fn(), getContract: vi.fn(), queryContracts: vi.fn().mockResolvedValue([]),
      updateContract: vi.fn(), appendVerification: vi.fn(), appendEvent: vi.fn(),
      queryEvents: vi.fn().mockResolvedValue([]), detectDrift: vi.fn(),
    }
    const mockSched = { scheduleLoop: vi.fn(), manualTick: vi.fn(), handleWebhook: vi.fn() }
    const mockWC = { enqueue: vi.fn() }
    const router = createLoopRouter(mockStore as any, mockSched as any, mockWC as any)
    expect(router).toBeDefined()
    expect(router.routes).toBeDefined()
    expect(typeof router.routes).toBe('function')
  })
})
