// 评审治理 × 数据飞轮接线守门（round 2 挂账 2）：regressionGate 字段显式接入
// 才拦——blocked 追加 blocker，absent/pass 不阻断（不静默扩权）。
import { describe, it, expect } from 'vitest'
import { addApproval, createCase, mergeReadiness } from '../convergence'
import { DEFAULT_POLICY, type ReviewCase } from '../types'

function readyCase(): ReviewCase {
  const policy = DEFAULT_POLICY
  let c = createCase({
    caseId: 'case-flywheel',
    title: '接线案例',
    headCommit: 'c1',
    changedPaths: ['packages/server/src/feature.ts'],
    diffLines: 20,
  }, policy)
  c = addApproval(c, { actor: 'alice', actorKind: 'human', decision: 'approve', commit: 'c1' }, 1)
  c.checks = 'green'
  return c
}

describe('mergeReadiness × 坏例通过率门', () => {
  it('字段缺席：不受该门管辖（既有就绪判定不变）', () => {
    const r = mergeReadiness(readyCase())
    expect(r.ready).toBe(true)
    expect(r.blockers.join()).not.toContain('regression_gate')
  })

  it('blocked：追加 regression_gate blocker（带 summary）', () => {
    const c = { ...readyCase(), regressionGate: { status: 'blocked' as const, summary: '历史 Bug 复现 2 条（通过率<0.80）' } }
    const r = mergeReadiness(c)
    expect(r.ready).toBe(false)
    const line = r.blockers.find((b) => b.startsWith('regression_gate'))
    expect(line).toContain('历史 Bug 复现 2 条')
  })

  it('pass：不追加 blocker', () => {
    const c = { ...readyCase(), regressionGate: { status: 'pass' as const } }
    expect(mergeReadiness(c).ready).toBe(true)
  })
})
