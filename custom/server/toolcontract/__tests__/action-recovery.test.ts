import { describe, it, expect } from 'vitest'
import { decideActionRecovery } from '../action-recovery'

describe('动作恢复判定（handbook 四关之一：超时≠失败）', () => {
  it('已确认 → reuse；明确失败可重试 → retry；不可重试 → manual', () => {
    expect(decideActionRecovery({ status: 'confirmed' }).decision).toBe('reuse')
    expect(decideActionRecovery({ status: 'failed', retryable: true }).decision).toBe('retry')
    expect(decideActionRecovery({ status: 'failed', retryable: false }).decision).toBe('manual')
    expect(decideActionRecovery({ status: 'failed' }).decision).toBe('manual')
  })

  it('sent/intended 一律先查外部状态，禁止直接重放', () => {
    expect(decideActionRecovery({ status: 'sent' }).decision).toBe('check_external')
    expect(decideActionRecovery({ status: 'intended' }).decision).toBe('check_external')
    expect(decideActionRecovery({ status: 'sent', ageMs: 10_000, staleAfterMs: 1_000 }).decision).toBe('check_external')
  })

  it('blocked → manual；无记录首次执行 → retry；恢复场景无记录 → check_external', () => {
    expect(decideActionRecovery({ status: 'blocked' }).decision).toBe('manual')
    expect(decideActionRecovery({}).decision).toBe('retry')
    expect(decideActionRecovery({ recovering: true }).decision).toBe('check_external')
  })
})
