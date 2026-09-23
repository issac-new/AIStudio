import { describe, expect, it } from 'vitest'
import { verifyPushResult } from '../push-verify'

describe('push-verify（dev-branch-missing：push 后须验远端 ref）', () => {
  it('远端 ref 与本地 HEAD 一致 → ok', () => {
    const r = verifyPushResult('a'.repeat(40), 'a'.repeat(40) + '\trefs/heads/feat/x', true)
    expect(r).toEqual({ ok: true, remoteRef: 'a'.repeat(40), sha: 'a'.repeat(40) })
  })
  it('远端无该 ref → not-pushed（chen 假完成的真因）', () => {
    const r = verifyPushResult('a'.repeat(40), '', true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not-pushed')
  })
  it('远端 ref 与本地分叉 → diverged', () => {
    const r = verifyPushResult('a'.repeat(40), 'b'.repeat(40) + '\trefs/heads/feat/x', true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('diverged')
  })
  it('ls-remote 失败（网络/权限）→ offline，不得当已推送', () => {
    const r = verifyPushResult('a'.repeat(40), '', false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('offline')
  })
})
