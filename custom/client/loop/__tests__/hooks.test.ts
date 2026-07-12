// overlay/custom/client/loop/__tests__/hooks.test.ts
import { describe, it, expect, vi } from 'vitest'
import { HookManager } from '../../../server/loop/engine/hooks'
import type { LoopInstance } from '../types'

describe('HookManager', () => {
  it('allows when no handlers registered', async () => {
    const hm = new HookManager()
    const loop = { id: 'l' } as any
    const result = await hm.run('pre-tick', loop)
    expect(result.decision).toBe('allow')
  })

  it('deny from a handler short-circuits', async () => {
    const hm = new HookManager()
    hm.register('pre-tick', async () => ({ decision: 'deny' }))
    hm.register('pre-tick', async () => ({ decision: 'allow' }))
    const loop = { id: 'l' } as any
    const result = await hm.run('pre-tick', loop)
    expect(result.decision).toBe('deny')
  })

  it('accumulates additionalContext', async () => {
    const hm = new HookManager()
    hm.register('post-tick', async () => ({ decision: 'allow', additionalContext: 'ctx1' }))
    hm.register('post-tick', async () => ({ decision: 'allow', additionalContext: 'ctx2' }))
    const loop = { id: 'l' } as any
    const result = await hm.run('post-tick', loop)
    expect(result.additionalContext).toBe('ctx1ctx2')
  })

  it('ask escalates but does not deny', async () => {
    const hm = new HookManager()
    hm.register('pre-persistence', async () => ({ decision: 'ask' }))
    const loop = { id: 'l' } as any
    const result = await hm.run('pre-persistence', loop)
    expect(result.decision).toBe('ask')
  })
})
