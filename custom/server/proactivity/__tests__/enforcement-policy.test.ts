// overlay/proactivity 执法策略守门测试（挂账清偿批 H4）：存储 CRUD/校验/坏档隔离
// + proactivityPolicyForProfile 事实装配（L4 才解析 goalStatus，台账缺席不猜数）。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  _resetPolicyDirForTests,
  _usePolicyDirForTests,
  getPolicy,
  listPolicies,
  proactivityPolicyForProfile,
  removePolicy,
  upsertPolicy,
  validatePolicyInput,
} from '../enforcement-policy'
import { confirmAlignment, upsertAlignment } from '../goal-alignment'

const DAY = 86_400_000
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'proact-policy-'))
  _usePolicyDirForTests(dir)
})

afterAll(() => {
  _resetPolicyDirForTests()
  rmSync(dir, { recursive: true, force: true })
})

describe('策略存储行为', () => {
  it('upsert→list→get→remove 全链 + 幂等按 profile', () => {
    const e1 = upsertPolicy({ profile: 'coding-agent', level: 'L4', contract: { goalExplicit: true, acceptanceCriteria: false } })
    expect(e1.updatedAt).toBeGreaterThan(0)
    upsertPolicy({ profile: 'reviewer', level: 'L1' })
    expect(listPolicies()).toHaveLength(2)
    upsertPolicy({ profile: 'coding-agent', level: 'L5' })  // 同 profile 覆盖
    expect(listPolicies()).toHaveLength(2)
    expect(getPolicy('coding-agent')!.level).toBe('L5')
    expect(getPolicy('coding-agent')!.contract).toBeUndefined()  // 覆盖不带契约=契约清除
    expect(removePolicy('coding-agent')).toBe(true)
    expect(removePolicy('coding-agent')).toBe(false)
    expect(listPolicies()).toHaveLength(1)
  })

  it('校验：非法 profile/level/contract/goalId 拒绝', () => {
    expect(validatePolicyInput({ profile: 'a b', level: 'L4' })).toHaveLength(1)
    expect(validatePolicyInput({ profile: 'a', level: 'L9' as never })).toHaveLength(1)
    expect(validatePolicyInput({ profile: 'a', level: 'L4', contract: { goalExplicit: 'yes' } as never })).toHaveLength(1)
    expect(validatePolicyInput({ profile: 'a', level: 'L4', goalId: 'bad id' })).toHaveLength(1)
    expect(validatePolicyInput({ profile: 'a', level: 'L4', goalId: '' })).toHaveLength(0)  // 空=清除关联，合法
    expect(() => upsertPolicy({ profile: 'bad id', level: 'L4' })).toThrow()
  })

  it('坏档隔离：垃圾 JSON→从空起步并留 .corrupt-* 档', () => {
    writeFileSync(join(dir, 'policy.json'), '{oops')
    expect(listPolicies()).toEqual([])
    expect(readdirSync(dir).some((f) => f.startsWith('policy.json.corrupt-'))).toBe(true)
  })
})

describe('proactivityPolicyForProfile 事实装配', () => {
  it('无入参/无条目 → null（缺配置不执法）', () => {
    expect(proactivityPolicyForProfile(undefined)).toBeNull()
    expect(proactivityPolicyForProfile('nobody')).toBeNull()
  })

  it('L4 无 goalId → 不解析 goalStatus（漂移判定不参与）', () => {
    upsertPolicy({ profile: 'p1', level: 'L4', contract: { goalExplicit: true, acceptanceCriteria: true } })
    const lite = proactivityPolicyForProfile('p1')!
    expect(lite.level).toBe('L4')
    expect(lite.contract!.acceptanceCriteria).toBe(true)
    expect(lite.goalStatus).toBeUndefined()
  })

  it('L4 + goalId：台账有目标→解析状态（stale 传导）；台账缺目标→不猜数', () => {
    upsertAlignment({ goalId: 'milestone:m1', goalSummary: '把里程碑推到上线' })
    // 从未确认且超 1 天宽限 → never-confirmed（用旧 createdAt 构造）
    writeFileSync(join(dir, 'alignment.json'), JSON.stringify({
      entries: [{ goalId: 'milestone:m1', goalSummary: '把里程碑推到上线', createdAt: Date.now() - 3 * DAY, confirmations: [] }],
    }))
    upsertPolicy({ profile: 'p2', level: 'L4', goalId: 'milestone:m1', contract: { goalExplicit: true, acceptanceCriteria: true } })
    expect(proactivityPolicyForProfile('p2')!.goalStatus).toBe('never-confirmed')
    // 确认后 → fresh（confirmAlignment 走真实台账）
    confirmAlignment('milestone:m1', { by: 'tester' })
    expect(proactivityPolicyForProfile('p2')!.goalStatus).toBe('fresh')
    // 关联不存在目标 → 不解析（fail-soft）
    upsertPolicy({ profile: 'p3', level: 'L4', goalId: 'absent:goal' })
    expect(proactivityPolicyForProfile('p3')!.goalStatus).toBeUndefined()
  })

  it('非 L4 不解析 goalStatus（漂移防线只约束 L4）', () => {
    upsertPolicy({ profile: 'p4', level: 'L3', goalId: 'whatever:x' })
    expect(proactivityPolicyForProfile('p4')!.goalStatus).toBeUndefined()
  })
})
