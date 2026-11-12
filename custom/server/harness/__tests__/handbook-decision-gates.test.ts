// handbook 四关的判定层夹具（2026-11-12 吸收批 2）。
// 不复制手册的 Node 挑战实现，只断言本仓恢复/记忆/效率决策的边界：
// 超时≠失败、未结算不重放、跨租户不写、超预算不派。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decideActionRecovery } from '../../toolcontract/action-recovery'
import { decideResume, type ResumeFacts } from '../../resume/resume-planner'
import { decideMemoryWrite } from '../../memscope/memory-write-guard'
import { BudgetLeaseStore } from '../../tokenbudget/budget-lease'

function emptyFacts(): ResumeFacts {
  return {
    runId: 'r1',
    sessionId: 's1',
    graph: { found: false },
    handoff: { found: false },
    progress: { found: false },
  }
}

describe('关 1：退款超时', () => {
  it('sent（超时/断线）只允许查外部状态，不允许直接重试', () => {
    const decision = decideActionRecovery({ status: 'sent', ageMs: 5_000, staleAfterMs: 60_000 })
    expect(decision.decision).toBe('check_external')
    expect(decision.decision).not.toBe('retry')
  })

  it('confirmed 直接复用，不再发第二次退款', () => {
    expect(decideActionRecovery({ status: 'confirmed' }).decision).toBe('reuse')
  })
})

describe('关 2：恢复', () => {
  it('新鲜检查点也不能越过未结算动作', () => {
    const facts = emptyFacts()
    facts.graph = { found: true, superStep: 9, pendingInterrupts: 0, ageMs: 1_000, next: 'next: step10' }
    facts.unsettled = { found: true, count: 1, actions: [{ key: 'k', tool: 'refund', status: 'sent' }] }
    const plan = decideResume(facts)
    expect(plan.decision).toBe('manual_gate')
    expect(plan.reasons.join(' ')).toContain('refund')
  })

  it('无未结算动作时恢复判定保持原三档', () => {
    const facts = emptyFacts()
    facts.graph = { found: true, superStep: 9, pendingInterrupts: 0, ageMs: 1_000, next: 'next: step10' }
    expect(decideResume(facts).decision).toBe('auto_resume')
  })
})

describe('关 3：记忆作用域', () => {
  it('跨租户读/写、模型自述完成、缺来源都不允许写', () => {
    expect(decideMemoryWrite({
      tenantId: 't1', userId: 'u1', ownerTenantId: 't2', evidence: 'confirmed', sourceRef: 'trace:1',
    }).allow).toBe(false)
    expect(decideMemoryWrite({
      tenantId: 't1', userId: 'u1', evidence: 'model_done', sourceRef: 'trace:1',
    }).allow).toBe(false)
    expect(decideMemoryWrite({
      tenantId: 't1', userId: 'u1', evidence: 'confirmed',
    }).allow).toBe(false)
  })

  it('本轮确认、带来源、同租户同用户 → 允许', () => {
    expect(decideMemoryWrite({
      tenantId: 't1', userId: 'u1', evidence: 'confirmed', sourceRef: 'trace:1',
    }).allow).toBe(true)
  })
})

describe('关 4：效率（预算租约）', () => {
  it('租约预留耗尽后拒绝继续预留（并发 run 不会在支出可见前全放行）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'handbook-budget-'))
    try {
      const store = new BudgetLeaseStore({ path: join(dir, 'leases.json'), now: () => 1_000 })
      expect(store.derive({ leaseId: 'r', limitUsd: 1 }).lease).toBeTruthy()
      expect(store.reserve('r', 1).lease).toBeTruthy()
      expect(store.available('r')).toBe(0)
      expect(store.reserve('r', 0.01).lease).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
