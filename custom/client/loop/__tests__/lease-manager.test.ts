// overlay/custom/client/loop/__tests__/lease-manager.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('matrix-js-sdk', () => {
  const mockClient = {
    createMessagesRequest: vi.fn().mockResolvedValue({ chunk: [] }),
    sendMessage: vi.fn().mockResolvedValue('$event:id'),
    sendStateEvent: vi.fn().mockResolvedValue('$event:id'),
    startClient: vi.fn(),
    stopClient: vi.fn(),
    getStateEvent: vi.fn().mockResolvedValue(null),
    roomState: vi.fn().mockResolvedValue([]),
  }
  return { createClient: vi.fn(() => mockClient) }
})

import { LeaseManager } from '../../../server/loop/engine/lease-manager'

describe('LeaseManager', () => {
  it('acquires lease when no competing bids', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    const mgr = new LeaseManager(client, '!room:matrix.org', 'instance-A')
    // ELECTION_WINDOW is 5s — we can't wait that long in a test
    // Mock getRecentLeaseBids to return only our bid
    vi.spyOn(mgr as any, 'sleep').mockResolvedValue(undefined)
    const result = await mgr.tryAcquireLease('loop-1')
    expect(result).toBe(true)
  })

  it('loses lease when a competing instance has lower timestamp', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    // Mock messages to include a competing bid with lower timestamp
    client.createMessagesRequest.mockResolvedValue({
      chunk: [{
        getContent: () => ({
          instanceId: 'instance-B',
          loopId: 'loop-1',
          timestamp: Date.now() - 1000, // 1 second earlier
        }),
        getType: () => 'm.room.message',
      }],
    })
    const mgr = new LeaseManager(client, '!room:matrix.org', 'instance-A')
    vi.spyOn(mgr as any, 'sleep').mockResolvedValue(undefined)
    const result = await mgr.tryAcquireLease('loop-1')
    expect(result).toBe(false)
  })

  it('releases lease without error', async () => {
    const { createClient } = await import('matrix-js-sdk')
    const client = createClient()
    const mgr = new LeaseManager(client, '!room:matrix.org', 'instance-A')
    await expect(mgr.releaseLease('loop-1')).resolves.not.toThrow()
  })
})
