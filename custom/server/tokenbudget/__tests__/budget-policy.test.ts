// 预算策略（残余项⑤）守门：策略解析、纯判定、状态动作与阻断开关。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetBudgetCacheForTests,
  budgetBlocked,
  budgetStatus,
  evaluateBudget,
  listBudgetPolicies,
  removeBudgetPolicy,
  resolveBudgetPolicy,
  setBudgetPolicy,
} from '../budget-policy'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'budget-policy-'))
  process.env.BUDGET_POLICY_FILE = join(dir, 'policies.json')
  process.env.RUN_MANIFEST_DIR = join(dir, 'manifests')
  process.env.HERMES_TRACES_DIR = join(dir, 'traces')
  delete process.env.HERMES_BUDGET_ENFORCE
  _resetBudgetCacheForTests()
})

afterEach(() => {
  delete process.env.BUDGET_POLICY_FILE
  delete process.env.RUN_MANIFEST_DIR
  delete process.env.HERMES_TRACES_DIR
  delete process.env.HERMES_BUDGET_ENFORCE
  _resetBudgetCacheForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('策略存取与解析', () => {
  it('用户级优先于 profile 级；同键覆盖；可删除', () => {
    setBudgetPolicy({ userId: 'u1', dailyUsd: 10, action: 'warn' })
    setBudgetPolicy({ profileId: 'p1', dailyUsd: 5, action: 'block' })
    expect(resolveBudgetPolicy('u1', 'p1')).toMatchObject({ userId: 'u1', dailyUsd: 10, action: 'warn' })
    expect(resolveBudgetPolicy('u2', 'p1')).toMatchObject({ profileId: 'p1', action: 'block' })
    setBudgetPolicy({ userId: 'u1', dailyUsd: 20, action: 'block' })
    expect(listBudgetPolicies().filter((p) => p.userId === 'u1')).toHaveLength(1)
    expect(resolveBudgetPolicy('u1')?.dailyUsd).toBe(20)
    expect(removeBudgetPolicy({ userId: 'u1' })).toBe(true)
    expect(resolveBudgetPolicy('u1')).toBeNull()
    expect(removeBudgetPolicy({ userId: 'nope' })).toBe(false)
  })

  it('非法策略拒绝', () => {
    expect(() => setBudgetPolicy({ userId: 'u1', dailyUsd: -1, action: 'block' })).toThrow()
    expect(() => setBudgetPolicy({ dailyUsd: 1, action: 'block' } as never)).toThrow()
  })
})

describe('evaluateBudget 与状态', () => {
  it('纯判定：达到/超过限额触发动作，无限额放行', () => {
    expect(evaluateBudget(5, 10, 'block')).toEqual({ exceeded: false, action: 'allow' })
    expect(evaluateBudget(10, 10, 'block')).toEqual({ exceeded: true, action: 'block' })
    expect(evaluateBudget(11, 10, 'downgrade')).toEqual({ exceeded: true, action: 'downgrade' })
    expect(evaluateBudget(100, null, 'block')).toEqual({ exceeded: false, action: 'allow' })
  })

  it('限额 0 且当日无支出 → 已超限；enforce 开启才阻断', () => {
    setBudgetPolicy({ userId: 'u1', dailyUsd: 0, action: 'block' })
    const status = budgetStatus({ userId: 'u1' })
    expect(status).toMatchObject({ spentUsd: 0, limitUsd: 0, action: 'block', enforce: false })
    expect(status.note).toContain('已达/超过')
    expect(budgetBlocked({ userId: 'u1' })).toBe(false)
    process.env.HERMES_BUDGET_ENFORCE = '1'
    expect(budgetBlocked({ userId: 'u1' })).toBe(true)
  })

  it('未配置策略 → allow 且 note 说明只观测', () => {
    const status = budgetStatus({ userId: 'ghost' })
    expect(status).toMatchObject({ action: 'allow', limitUsd: null })
    expect(status.note).toContain('未配置')
  })
})
