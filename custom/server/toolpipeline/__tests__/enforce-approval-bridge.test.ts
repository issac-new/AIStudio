// H3 交互审批桥守门：store 幂等+consume-on-pass、纯桥只转确认类（硬边界不越权）、
// 钩子端到端（拒→挂单→批→重试放行→三连重试再拒）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'enf-bridge-'))

beforeAll(() => {
  process.env.HERMES_ENFORCE_APPROVALS_DIR = dir
  process.env.HERMES_TOOL_ENFORCE = '1'
})
afterAll(() => {
  delete process.env.HERMES_ENFORCE_APPROVALS_DIR
  delete process.env.HERMES_TOOL_ENFORCE
  rmSync(dir, { recursive: true, force: true })
})

describe('执法审批 store（幂等 + 一单一执行）', () => {
  it('同 callHash 幂等挂单；裁决后状态如实；consume-on-pass 只放行一次', async () => {
    const s = await import('../enforce-approvals')
    const hash = s.callHashOf('terminal_exec', { command: 'rm -rf /tmp/x' }, 'chen')
    const r1 = s.createEnforceApproval({ callHash: hash, tool: 'terminal_exec', inputPreview: 'rm -rf …', profileId: 'chen', rule: 'mode-needs-approval', risk: 'high' })
    const r2 = s.createEnforceApproval({ callHash: hash, tool: 'terminal_exec', inputPreview: 'rm -rf …', profileId: 'chen', rule: 'mode-needs-approval', risk: 'high' })
    expect(r2.id).toBe(r1.id) // 幂等
    expect(s.consumeApprovalIfReady(hash)).toBe(false) // 未批不放行
    const dec = s.decideEnforceApproval(r1.id, 'approve', 'qa-lead')
    expect(dec?.status).toBe('approved')
    expect(s.decideEnforceApproval(r1.id, 'reject', 'qa-lead')?.status).toBe('approved') // 已裁决幂等
    expect(s.consumeApprovalIfReady(hash)).toBe(true)  // 批后第一次放行
    expect(s.consumeApprovalIfReady(hash)).toBe(false) // 第二次拒——一单一执行
    expect(s.listPendingEnforceApprovals()).toHaveLength(0)
  })
})

describe('纯桥 applyApprovalBridge（只转确认类，硬边界不越权）', () => {
  it('RA 档 approved→放行(approval-passed)；未批→文案带指引；否决→文案如实', async () => {
    const { applyApprovalBridge } = await import('../enforce-gate')
    const ra = { enforcing: true, allow: false, rule: 'mode-needs-approval', error: '原拒绝理由' } as const
    expect(applyApprovalBridge(ra, { approved: true })).toMatchObject({ allow: true, rule: 'approval-passed' })
    const pending = applyApprovalBridge(ra, { approved: false, ticket: { id: 'enf:abc', status: 'pending' } })
    expect((pending as { error: string }).error).toContain('enf:abc')
    expect((pending as { error: string }).error).toContain('一单一执行')
    const rejected = applyApprovalBridge(ra, { approved: false, ticket: { id: 'enf:abc', status: 'rejected' } })
    expect((rejected as { error: string }).error).toContain('已被否决')
  })

  it('硬边界与放行类不经桥（OFF/风险上限/insight 原样返回）', async () => {
    const { applyApprovalBridge } = await import('../enforce-gate')
    const off = { enforcing: true, allow: false, rule: 'mode-off', error: 'x' } as const
    const cap = { enforcing: true, allow: false, rule: 'ladder-risk-cap', error: 'x' } as const
    const pass = { enforcing: true, allow: true, rule: 'mode-pass' } as const
    for (const v of [off, cap, pass]) {
      expect(applyApprovalBridge(v, { approved: true })).toBe(v) // 批单不越权：硬边界即使已批也原样
    }
  })
})

describe('钩子端到端（拒→挂单→批→重试放行→再试拒）', () => {
  it('RA 档全链：收件箱视角挂单→批准→同调用重试 approval-passed→第三次重新挂单', async () => {
    const gate = await import('../enforce-gate')
    const store = await import('../enforce-approvals')
    process.env.HERMES_TOOL_ENFORCE_MODE = 'default' // default 档 exec=RA
    try {
      const hook = gate.ekkoEnforceGateHook()
      const input = { command: 'npm test' }
      const ctx = { profileId: 'bridge-e2e' }

      const d1 = await hook.preExecute!.call(undefined, 'terminal_exec', input, ctx)
      expect(d1).toMatchObject({ allow: false })
      expect((d1 as { error: string }).error).toContain('enf:')
      const ticket = store.listPendingEnforceApprovals(1)[0] // 事实上无其他 pending
      expect(ticket?.id.startsWith('enf:')).toBe(true)
      expect(ticket?.profileId).toBe('bridge-e2e')

      store.decideEnforceApproval(ticket!.id, 'approve', 'qa-lead')
      const d2 = await hook.preExecute!.call(undefined, 'terminal_exec', input, ctx)
      expect(d2).toBeUndefined() // 放行=不拦（preExecute 无返回即放行）

      const d3 = await hook.preExecute!.call(undefined, 'terminal_exec', input, ctx)
      expect(d3).toMatchObject({ allow: false }) // 一单一执行：第三次重新挂单拒绝
    } finally {
      delete process.env.HERMES_TOOL_ENFORCE_MODE
    }
  })
})
