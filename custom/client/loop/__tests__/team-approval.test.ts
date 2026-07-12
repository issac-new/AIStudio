// overlay/custom/client/loop/__tests__/team-approval.test.ts
import { describe, it, expect, vi } from 'vitest'

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

import { TeamApprovalManager, type ApprovalRequest } from '../../../server/loop/engine/team-approval'

function makeRequest(): ApprovalRequest {
  return {
    contractId: 'task/test-001',
    loopId: 'loop-1',
    approvers: ['@alice:matrix.org', '@bob:matrix.org'],
    summary: 'Fix auth token leak',
    worktreeId: 'wt-1',
    timestamp: new Date().toISOString(),
  }
}

describe('TeamApprovalManager', () => {
  it('requests approval via Matrix message', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    const mgr = new TeamApprovalManager(client, '!room:matrix.org')
    const promise = mgr.requestApproval(makeRequest())
    // Simulate approval
    mgr.handleApprovalResponse('task/test-001', '@alice:matrix.org', 'approved')
    const decision = await promise
    expect(decision).toBe('approved')
    expect(client.sendMessage).toHaveBeenCalled()
  })

  it('lists pending requests', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const mgr = new TeamApprovalManager(createClient(), '!room:matrix.org')
    const req = makeRequest()
    // Don't await — keep it pending. Awaiting registers the entry synchronously,
    // then awaits the Matrix send; we only need the registration side effect.
    const p = mgr.requestApproval(req)
    // Allow the microtask queue to flush so sendMessage resolves; the entry is
    // already registered synchronously inside requestApproval before send.
    await Promise.resolve()
    const pending = mgr.getPendingRequests('loop-1')
    expect(pending.length).toBe(1)
    expect(pending[0].contractId).toBe('task/test-001')
    // Resolve the promise to avoid dangling timer rejection.
    mgr.handleApprovalResponse('task/test-001', '@alice:matrix.org', 'approved')
    await p
  })

  it('handleApprovalResponse is a no-op for unknown contract', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const mgr = new TeamApprovalManager(createClient(), '!room:matrix.org')
    expect(() => mgr.handleApprovalResponse('unknown', '@x:y.z', 'approved')).not.toThrow()
  })
})
