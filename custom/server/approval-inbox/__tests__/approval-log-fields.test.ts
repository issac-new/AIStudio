// 审批记录凭证字段（P0-2）守门：scope/expiresAt/source 自动补齐与显式覆盖。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appendApprovalLog, approvalScopeMeta, queryApprovalLog } from '../approval-log'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'approval-log-'))
  process.env.HERMES_APPROVALS_LOG_FILE = join(dir, 'history.json')
  process.env.HERMES_GOV_EVENT_DIR = join(dir, 'gov')
})

afterEach(() => {
  delete process.env.HERMES_APPROVALS_LOG_FILE
  delete process.env.HERMES_GOV_EVENT_DIR
  rmSync(dir, { recursive: true, force: true })
})

describe('approvalScopeMeta', () => {
  it('按决策映射范围与期限', () => {
    const now = 1_000_000
    expect(approvalScopeMeta('once', now)).toMatchObject({ scope: 'once' })
    expect(approvalScopeMeta('session', now)).toMatchObject({ scope: 'session', expiresAt: now + 8 * 3_600_000 })
    expect(approvalScopeMeta('always', now)).toEqual({ scope: 'always' })
    expect(approvalScopeMeta('approved_scoped', now)).toMatchObject({ scope: 'scoped' })
    expect(approvalScopeMeta('request_changes', now)).toEqual({ scope: 'task' })
  })
})

describe('appendApprovalLog 凭证字段', () => {
  it('默认人工来源，自动补 scope/期限', () => {
    const before = Date.now()
    const entry = appendApprovalLog({
      id: 'a1', actor: 'alice', targetKind: 'command', targetId: 't1', targetTitle: 'demo',
      decision: 'session',
    })
    expect(entry.scope).toBe('session')
    expect(entry.source).toBe('human')
    expect(entry.expiresAt).toBeGreaterThanOrEqual(before + 8 * 3_600_000)
    expect(queryApprovalLog(1)[0]).toMatchObject({ id: 'a1', scope: 'session', source: 'human' })
  })

  it('always 无期限；显式 source 可标为策略自动', () => {
    const alw = appendApprovalLog({
      id: 'a2', actor: 'system', targetKind: 'command', targetId: 't2', targetTitle: 'demo',
      decision: 'always', source: 'policy',
    })
    expect(alw.scope).toBe('always')
    expect(alw.expiresAt).toBeUndefined()
    expect(alw.source).toBe('policy')
  })

  it('显式 scope/expiresAt 不被默认覆盖', () => {
    const entry = appendApprovalLog({
      id: 'a3', actor: 'alice', targetKind: 'command', targetId: 't3', targetTitle: 'demo',
      decision: 'once', scope: 'scoped', expiresAt: 42,
    })
    expect(entry.scope).toBe('scoped')
    expect(entry.expiresAt).toBe(42)
  })
})
