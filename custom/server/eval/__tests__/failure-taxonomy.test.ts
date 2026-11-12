import { describe, it, expect } from 'vitest'
import { canonicalOfBadCase, canonicalOfSwarmCategory, CANONICAL_FAILURE_CATEGORIES } from '../failure-taxonomy'
import { buildGoldenTasks } from '../golden-set'

describe('失败分类 canonical（旧六类只增不改）', () => {
  it('eval 六类映射到 canonical，未知不猜', () => {
    expect(canonicalOfBadCase('risk_violation')).toBe('PRODUCT')
    expect(canonicalOfBadCase('action_loop')).toBe('PRODUCT')
    expect(canonicalOfBadCase('budget_exhausted')).toBe('TIMEOUT')
    expect(canonicalOfBadCase('outcome_mismatch')).toBe('PRODUCT')
    expect(canonicalOfBadCase('trajectory_defect')).toBe('FLOW')
    expect(canonicalOfBadCase('result_defect')).toBe('FLOW')
    expect(canonicalOfBadCase('something_new')).toBe('UNKNOWN')
  })

  it('swarm 词表大小写归一；未知归 UNKNOWN', () => {
    expect(canonicalOfSwarmCategory('env')).toBe('ENV')
    expect(canonicalOfSwarmCategory(' timeout ')).toBe('TIMEOUT')
    expect(canonicalOfSwarmCategory('weird')).toBe('UNKNOWN')
    expect(new Set(CANONICAL_FAILURE_CATEGORIES).size).toBe(7)
  })

  it('黄金集任务仍可按旧 rubric 构建（分类字段不侵入题面）', () => {
    expect(buildGoldenTasks()).toHaveLength(30)
  })
})
