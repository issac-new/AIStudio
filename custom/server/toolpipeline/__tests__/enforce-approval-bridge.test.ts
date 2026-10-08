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
    process.env.HERMES_ENFORCE_SUSPEND = '0' // 本用例测"拒→重试"快速路径；挂起语义见下节
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
      delete process.env.HERMES_ENFORCE_SUSPEND
    }
  })
})

describe('瀑布级挂起（H3 理想形态：拒→挂起→批→自动续跑，agent 无需重试）', () => {
  it('挂起中批准→钩子放行（续跑）且批单已消费', async () => {
    const gate = await import('../enforce-gate')
    const store = await import('../enforce-approvals')
    process.env.HERMES_TOOL_ENFORCE_MODE = 'default'
    process.env.HERMES_ENFORCE_SUSPEND_POLL_MS = '50'
    try {
      const hook = gate.ekkoEnforceGateHook()
      const input = { command: 'npm run deploy:prod' }
      const ctx = { profileId: 'suspend-e2e' }
      const p = hook.preExecute!('terminal_exec', input, ctx) // 不 await——此刻应挂起
      await new Promise((r) => setTimeout(r, 150))            // 挂起窗口
      const ticket = store.listPendingEnforceApprovals(5).find((t) => t.profileId === 'suspend-e2e')
      expect(ticket).toBeTruthy()
      store.decideEnforceApproval(ticket!.id, 'approve', 'qa-lead')
      const v = await p // 批准即续跑：undefined=放行（瀑布继续执行工具本体）
      expect(v).toBeUndefined()
    } finally {
      delete process.env.HERMES_TOOL_ENFORCE_MODE
      delete process.env.HERMES_ENFORCE_SUSPEND_POLL_MS
    }
  })

  it('挂起中否决→拒且文案如实', async () => {
    const gate = await import('../enforce-gate')
    const store = await import('../enforce-approvals')
    process.env.HERMES_TOOL_ENFORCE_MODE = 'default'
    process.env.HERMES_ENFORCE_SUSPEND_POLL_MS = '50'
    try {
      const hook = gate.ekkoEnforceGateHook()
      const input = { command: 'curl -X POST bank.api/transfer' }
      const ctx = { profileId: 'suspend-reject' }
      const p = hook.preExecute!('terminal_exec', input, ctx)
      await new Promise((r) => setTimeout(r, 150))
      const ticket = store.listPendingEnforceApprovals(5).find((t) => t.profileId === 'suspend-reject')
      store.decideEnforceApproval(ticket!.id, 'reject', 'qa-lead')
      const v = (await p) as { allow: boolean; error: string }
      expect(v.allow).toBe(false)
      expect(v.error).toContain('已被否决')
    } finally {
      delete process.env.HERMES_TOOL_ENFORCE_MODE
      delete process.env.HERMES_ENFORCE_SUSPEND_POLL_MS
    }
  })

  it('TTL 超时→拒但单留收件箱（活性等待有封顶，方案 §4.3-26）', async () => {
    const gate = await import('../enforce-gate')
    const store = await import('../enforce-approvals')
    process.env.HERMES_TOOL_ENFORCE_MODE = 'default'
    process.env.HERMES_ENFORCE_SUSPEND_TTL_MS = '200'
    process.env.HERMES_ENFORCE_SUSPEND_POLL_MS = '50'
    try {
      const hook = gate.ekkoEnforceGateHook()
      const input = { command: 'bash risky.sh' }
      const ctx = { profileId: 'suspend-timeout' }
      const v = (await hook.preExecute!('terminal_exec', input, ctx)) as { allow: boolean; error: string }
      expect(v.allow).toBe(false)
      expect(v.error).toContain('超时')
      const ticket = store.listPendingEnforceApprovals(5).find((t) => t.profileId === 'suspend-timeout')
      expect(ticket).toBeTruthy() // 单不撤——批后重试即放行
    } finally {
      delete process.env.HERMES_TOOL_ENFORCE_MODE
      delete process.env.HERMES_ENFORCE_SUSPEND_TTL_MS
      delete process.env.HERMES_ENFORCE_SUSPEND_POLL_MS
    }
  })

  it('waitEnforceDecision 同进程即时唤醒（不等轮询拍）', async () => {
    const store = await import('../enforce-approvals')
    const hash = store.callHashOf('terminal_exec', { command: 'wake-test' }, 'waker')
    store.createEnforceApproval({ callHash: hash, tool: 'terminal_exec', inputPreview: 'wake', profileId: 'waker', rule: 'mode-needs-approval', risk: 'medium' })
    process.env.HERMES_ENFORCE_SUSPEND_POLL_MS = '5000' // 轮询拍拉大——只靠即时唤醒
    const t0 = Date.now()
    setTimeout(() => {
      const rec = store.listPendingEnforceApprovals(10).find((r) => r.profileId === 'waker')
      store.decideEnforceApproval(rec!.id, 'approve', 'qa')
    }, 80)
    const out = await store.waitEnforceDecision(hash, 4000)
    expect(out).toBe('approved')
    expect(Date.now() - t0).toBeLessThan(2000) // 5s 轮询拍下亚秒返回=唤醒生效
    delete process.env.HERMES_ENFORCE_SUSPEND_POLL_MS
  })
})

describe('重启遗留挂起扫描（中间态：waitingAt 标记+boot 提醒）', () => {
  it('waitingAt 生命周期：等待中置位、结束清除', async () => {
    const s = await import('../enforce-approvals')
    const h = s.callHashOf('t', { c: 'lifecycle' }, 'wl')
    s.createEnforceApproval({ callHash: h, tool: 't', inputPreview: 'x', profileId: 'wl', rule: 'r', risk: 'low' })
    process.env.HERMES_ENFORCE_SUSPEND_POLL_MS = '50'
    const rec0 = s.listPendingEnforceApprovals(10).find((r) => r.profileId === 'wl')!
    const waitP = s.waitEnforceDecision(h, 5000)
    await new Promise((r) => setTimeout(r, 120))
    // 等待中：标记在案（直接读文件核——listPending 只回 pending 面）
    const file = (await import('fs')).readFileSync(join(storeDirOf(), 'enforce-approvals.json'), 'utf-8')
    expect(file).toContain('"waitingAt"')
    s.decideEnforceApproval(rec0.id, 'approve', 'wl-qa')
    await waitP
    const file2 = (await import('fs')).readFileSync(join(storeDirOf(), 'enforce-approvals.json'), 'utf-8')
    expect(file2).not.toContain('"waitingAt"')
    delete process.env.HERMES_ENFORCE_SUSPEND_POLL_MS
  }, 6000)

  it('boot 扫描：遗留 waitingAt→govbus 提醒+清标记（幂等）；无标记单不报', async () => {
    const { writeFileSync, mkdirSync, readFileSync } = await import('fs')
    const govDir = `/tmp/gov-boot-${process.pid}-${Date.now()}`
    process.env.HERMES_GOV_EVENT_DIR = govDir
    try {
      // 模拟崩溃现场：store 里留一张 waitingAt 在案的单
      const h = s_hashOf('t', { c: 'crash' }, 'crash-profile')
      writeStoreRaw({ seq: 1, records: { [`enf:${h.slice(0, 12)}`]: {
        id: `enf:${h.slice(0, 12)}`, callHash: h, tool: 'terminal_exec', inputPreview: 'rm -rf /tmp/q',
        profileId: 'crash-profile', rule: 'mode-needs-approval', risk: 'high',
        status: 'pending', createdAt: Date.now() - 60_000, waitingAt: Date.now() - 30_000,
      } } })
      const s = await import('../enforce-approvals')
      const n1 = await s.reportLostSuspensionsOnBoot()
      expect(n1).toBe(1)
      const { queryGovEvents } = await import('../../govbus/event-log')
      const ev = queryGovEvents({ domain: 'approval' })[0]
      expect(ev?.type).toBe('tool.enforce_suspend_lost')
      expect(ev?.summary).toContain('仍在收件箱')
      // 幂等：标记已清，再扫不重报
      const n2 = await s.reportLostSuspensionsOnBoot()
      expect(n2).toBe(0)
      expect(readFileSync(join(storeDirOf(), 'enforce-approvals.json'), 'utf-8')).not.toContain('"waitingAt"')
    } finally {
      delete process.env.HERMES_GOV_EVENT_DIR
      const { rmSync } = await import('fs')
      rmSync(govDir, { recursive: true, force: true })
    }
  })
})

// 测试助手：直写 store 文件（模拟崩溃现场）与目录定位
function storeDirOf(): string {
  return process.env.HERMES_ENFORCE_APPROVALS_DIR!
}
import { join } from 'node:path'
import { writeFileSync as _wf, mkdirSync as _md } from 'node:fs'
function writeStoreRaw(shape: unknown): void {
  _md(storeDirOf(), { recursive: true })
  _wf(join(storeDirOf(), 'enforce-approvals.json'), JSON.stringify(shape, null, 2))
}
import { createHash } from 'node:crypto'
function s_hashOf(tool: string, input: Record<string, unknown>, profileId: string): string {
  const canonical = JSON.stringify(Object.keys(input).sort().reduce<Record<string, unknown>>((a, k) => { a[k] = input[k]; return a }, {}))
  return createHash('sha256').update(`${profileId} ${tool} ${canonical}`).digest('hex')
}
