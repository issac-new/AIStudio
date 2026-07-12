// overlay/custom/client/loop/__tests__/stuck-detector.test.ts
import { describe, it, expect, vi } from 'vitest'
import { StuckDetector } from '../../../server/loop/engine/stuck-detector'
import type { LoopStateStore } from '../../../server/loop/store/state-store'
import type { LoopInstance } from '../types'

function makeMockStore(contracts: any[], events: any[]): LoopStateStore {
  return {
    getLoop: vi.fn(), createLoop: vi.fn(), listLoops: vi.fn(),
    updateLoop: vi.fn(), deleteLoop: vi.fn(),
    appendContract: vi.fn(), getContract: vi.fn(),
    queryContracts: vi.fn().mockResolvedValue(contracts),
    updateContract: vi.fn(), appendVerification: vi.fn(),
    appendEvent: vi.fn(),
    queryEvents: vi.fn().mockResolvedValue(events),
    detectDrift: vi.fn().mockResolvedValue({ hasDrift: false, details: '' }),
  } as any
}

describe('StuckDetector', () => {
  it('returns null when everything is fine', async () => {
    const store = makeMockStore([], [])
    const detector = new StuckDetector(store)
    const loop = { id: 'l', status: 'idle', stats: { totalCost: 0 } } as any
    expect(await detector.check(loop)).toBeNull()
  })

  it('detects max-attempts when a contract exceeds maxAttempts', async () => {
    const store = makeMockStore([{ id: 'c1', attempts: 3, maxAttempts: 3, status: 'in-progress' }], [])
    const detector = new StuckDetector(store)
    const loop = { id: 'l', status: 'running', stats: { totalCost: 0 } } as any
    expect(await detector.check(loop)).toBe('max-attempts')
  })

  it('detects validation-loop when 3+ fails in recent events', async () => {
    const fails = [
      { type: 'loop.verification-complete', passed: false, ts: new Date().toISOString() },
      { type: 'loop.verification-complete', passed: false, ts: new Date().toISOString() },
      { type: 'loop.verification-complete', passed: false, ts: new Date().toISOString() },
    ]
    const store = makeMockStore([], fails)
    const detector = new StuckDetector(store)
    const loop = { id: 'l', status: 'idle', stats: { totalCost: 0 } } as any
    expect(await detector.check(loop)).toBe('validation-loop')
  })
})
