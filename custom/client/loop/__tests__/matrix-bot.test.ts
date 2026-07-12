// overlay/custom/client/loop/__tests__/matrix-bot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { MatrixBot } from '../../../server/loop/engine/matrix-bot'
import type { LoopEvent } from '../types'

describe('MatrixBot', () => {
  let bot: MatrixBot
  let client: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const { createClient } = await import('matrix-js-sdk')
    client = createClient()
    bot = new MatrixBot(client, '!room:matrix.org')
  })

  it('formats loop.created event', async () => {
    const event: LoopEvent = {
      type: 'loop.created',
      loop: { id: 'l1', name: 'Test Loop' } as any,
      ts: new Date().toISOString(),
    }
    await bot.notify(event)
    expect(client.sendMessage).toHaveBeenCalled()
    const call = client.sendMessage.mock.calls[0]
    expect(call[1].body).toContain('Loop created')
    expect(call[1].body).toContain('Test Loop')
  })

  it('formats loop.tick-complete event', async () => {
    const event: LoopEvent = {
      type: 'loop.tick-complete',
      loopId: 'l1',
      iteration: 5,
      stats: { totalIterations: 5 } as any,
      ts: new Date().toISOString(),
    }
    await bot.notify(event)
    expect(client.sendMessage).toHaveBeenCalled()
    const call = client.sendMessage.mock.calls[0]
    expect(call[1].body).toContain('tick #5')
  })

  it('formats loop.stuck event', async () => {
    const event: LoopEvent = {
      type: 'loop.stuck',
      loopId: 'l1',
      reason: 'max-attempts',
      ts: new Date().toISOString(),
    }
    await bot.notify(event)
    expect(client.sendMessage).toHaveBeenCalled()
    const call = client.sendMessage.mock.calls[0]
    expect(call[1].body).toContain('STUCK')
    expect(call[1].body).toContain('max-attempts')
  })

  it('sends approval notification with mentions', async () => {
    await bot.notifyApprovalNeeded('l1', 'task/test-001', 'Fix bug', ['@alice:matrix.org'])
    expect(client.sendMessage).toHaveBeenCalled()
    const call = client.sendMessage.mock.calls[0]
    expect(call[1].body).toContain('Approval needed')
    expect(call[1].body).toContain('@alice:matrix.org')
  })

  it('returns null for unknown event types', async () => {
    const event = { type: 'unknown', loopId: 'l1', ts: new Date().toISOString() } as any
    await bot.notify(event)
    // Should not call sendMessage for unknown event types
    expect(client.sendMessage).not.toHaveBeenCalled()
  })
})
