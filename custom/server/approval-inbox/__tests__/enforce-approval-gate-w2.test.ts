// W2 执法审批闸门：具名主体必填、发起人不得自批、批单钉 requestedBy/runId。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  callHashOf,
  createEnforceApproval,
  decideEnforceApprovalGuarded,
} from '../../toolpipeline/enforce-approvals'

describe('执法审批闸门（W2）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'enf-approval-'))
    process.env.HERMES_ENFORCE_APPROVALS_DIR = dir
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.HERMES_ENFORCE_APPROVALS_DIR
  })

  function hang(requestedBy?: string) {
    return createEnforceApproval({
      callHash: callHashOf('terminal_exec', { command: 'deploy' }, 'profile-1'),
      tool: 'terminal_exec',
      inputPreview: 'command=deploy',
      profileId: 'profile-1',
      rule: 'mode-needs-approval',
      risk: 'high',
      ...(requestedBy ? { requestedBy } : {}),
      runId: 'run-42',
    })
  }

  it('挂单记录携带 requestedBy/runId（批单钉回触发执行流）', () => {
    const rec = hang('user-a')
    expect(rec.requestedBy).toBe('user-a')
    expect(rec.runId).toBe('run-42')
  })

  it('匿名裁决拒绝（actor-required）', () => {
    hang('user-a')
    const r = decideEnforceApprovalGuarded('enf:nope', 'approve', 'anonymous')
    expect(r).toMatchObject({ tag: 'error', code: 'actor-required' })
  })

  it('发起人自批拒绝（self-approval-forbidden）', () => {
    const rec = hang('user-a')
    const r = decideEnforceApprovalGuarded(rec.id, 'approve', 'user-a')
    expect(r).toMatchObject({ tag: 'error', code: 'self-approval-forbidden' })
    // 批单仍在 pending（闸门拒绝不产生裁决副作用）
    const again = decideEnforceApprovalGuarded(rec.id, 'approve', 'user-b')
    expect(again.tag).toBe('record')
  })

  it('他人裁决放行；不存在的单 not-found', () => {
    const rec = hang('user-a')
    const r = decideEnforceApprovalGuarded(rec.id, 'approve', 'user-b')
    expect(r.tag).toBe('record')
    if (r.tag === 'record') {
      expect(r.rec.status).toBe('approved')
      expect(r.rec.decidedBy).toBe('user-b')
    }
    expect(decideEnforceApprovalGuarded('enf:missing', 'approve', 'user-b')).toMatchObject({ tag: 'error', code: 'not-found' })
  })

  it('旧档批单（无 requestedBy）：任何具名主体可裁（兼容在途单）', () => {
    const rec = hang()
    const r = decideEnforceApprovalGuarded(rec.id, 'approve', 'user-any')
    expect(r.tag).toBe('record')
  })
})
