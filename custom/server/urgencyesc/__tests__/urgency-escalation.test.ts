// urgency 三档升级守门（路由/打断位/升级必录）。
import { describe, it, expect } from 'vitest'
import { escalate, type Urgency } from '../urgency-escalation'

const req = (urgency: Urgency, over: Partial<{ reason: string }> = {}) => ({
  fromAgent: 'a1', urgency, reason: '需要 coordinator 裁决 X', ...over,
})

describe('escalate（urgency 三档）', () => {
  it('low=queue 不打断；normal=inbox-first 不打断；critical=preempt 打断', () => {
    expect(escalate(req('low'))).toMatchObject({ action: 'queue', interrupts: false, ok: true })
    expect(escalate(req('normal'))).toMatchObject({ action: 'inbox-first', interrupts: false, ok: true })
    expect(escalate(req('critical'))).toMatchObject({ action: 'preempt', interrupts: true, ok: true })
  })
  it('理由为空拒（升级必录），路由仍按档给出', () => {
    const d = escalate(req('critical', { reason: '  ' }))
    expect(d.ok).toBe(false)
    expect(d.refusal).toContain('升级必录')
    expect(d.action).toBe('preempt')
    const urgencies: Urgency[] = ['low', 'normal', 'critical']
    expect(urgencies).toHaveLength(3)
  })
})
