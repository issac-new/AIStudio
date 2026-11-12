import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BudgetLeaseStore, _resetBudgetLeaseStoreForTests, sharedBudgetLeaseStore } from '../budget-lease'
import { budgetStatus, setBudgetPolicy, _resetBudgetCacheForTests } from '../budget-policy'

let dir: string
let path: string
let now: number

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'budget-lease-'))
  path = join(dir, 'leases.json')
  now = 1_000_000
  process.env.BUDGET_POLICY_FILE = join(dir, 'policies.json')
  process.env.RUN_MANIFEST_DIR = join(dir, 'manifests')
  process.env.HERMES_TRACES_DIR = join(dir, 'traces')
  process.env.BUDGET_LEASE_FILE = path
  process.env.HERMES_BUDGET_ENFORCE = '1'
  _resetBudgetLeaseStoreForTests()
  _resetBudgetCacheForTests()
})

afterEach(() => {
  delete process.env.BUDGET_POLICY_FILE
  delete process.env.RUN_MANIFEST_DIR
  delete process.env.HERMES_TRACES_DIR
  delete process.env.BUDGET_LEASE_FILE
  delete process.env.HERMES_BUDGET_ENFORCE
  _resetBudgetLeaseStoreForTests()
  _resetBudgetCacheForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('预算租约（handbook 预算关）', () => {
  it('根租约→子租约派生→预留→结算→可用额单调变化', () => {
    const store = new BudgetLeaseStore({ path, now: () => now })
    expect(store.derive({ leaseId: 'root', limitUsd: 10, userId: 'u1' }).ok).toBe(true)
    expect(store.available('root')).toBe(10)

    expect(store.derive({ leaseId: 'child', parentLeaseId: 'root', limitUsd: 4 }).ok).toBe(true)
    expect(store.available('root')).toBe(6) // 父租约被预留 4
    expect(store.available('child')).toBe(4)

    expect(store.reserve('child', 3).ok).toBe(true)
    expect(store.available('child')).toBe(1)
    expect(store.reserve('child', 2).ok).toBe(false)

    expect(store.settle('child', 1.5).ok).toBe(true)
    expect(store.get('child')).toMatchObject({ reservedUsd: 1.5, spentUsd: 1.5 })
  })

  it('父租约可用额不足拒绝派生；级联撤销释放子租约', () => {
    const store = new BudgetLeaseStore({ path, now: () => now })
    store.derive({ leaseId: 'root', limitUsd: 1 })
    expect(store.derive({ leaseId: 'big', parentLeaseId: 'root', limitUsd: 2 }).ok).toBe(false)

    store.derive({ leaseId: 'a', parentLeaseId: 'root', limitUsd: 0.5 })
    store.derive({ leaseId: 'b', parentLeaseId: 'a', limitUsd: 0.2 })
    const revoked = store.revoke('a')
    expect(revoked.ok).toBe(true)
    if (revoked.ok) expect(revoked.revoked).toEqual(expect.arrayContaining(['a', 'b']))
    expect(store.list().some((l) => l.leaseId === 'b')).toBe(false)
  })

  it('持久化后重读一致；坏文件按空账处理', () => {
    const store = new BudgetLeaseStore({ path, now: () => now })
    store.derive({ leaseId: 'r', limitUsd: 5, userId: 'u1' })
    store.reserve('r', 2)
    const reopened = new BudgetLeaseStore({ path, now: () => now })
    expect(reopened.get('r')).toMatchObject({ limitUsd: 5, reservedUsd: 2 })
  })

  it('预算状态计入未结算预留：预留占满即 block（enforce 开）', () => {
    setBudgetPolicy({ userId: 'u1', dailyUsd: 10, action: 'block' })
    const store = sharedBudgetLeaseStore()
    store.derive({ leaseId: 'r', limitUsd: 10, userId: 'u1', ttlMs: 60_000 })
    expect(store.reserve('r', 10).ok).toBe(true)
    const status = budgetStatus({ userId: 'u1', now })
    expect(status.reservedUsd).toBe(10)
    expect(status.availableUsd).toBe(0)
    expect(status.action).toBe('block')
  })
})
