// 评审治理·收敛规则守门：轮次上限、diff-only、去重、nit 预算、验证票、合并就绪度。
import { describe, it, expect } from 'vitest'
import {
  addApproval, addFinding, answerFinding, blockingFindings, createCase, dedupeKeyOf,
  mergeReadiness, startRound, verifyFinding,
} from '../convergence'
import { DEFAULT_POLICY, type ReviewCase, type ReviewPolicy } from '../types'

const policy: ReviewPolicy = {
  ...DEFAULT_POLICY,
  convergence: { ...DEFAULT_POLICY.convergence, nitBudgetPerRound: 1 },
}

function open(headCommit = 'c1'): ReviewCase {
  return createCase({
    caseId: 'case-1',
    title: '评审案例',
    headCommit,
    changedPaths: ['packages/server/src/feature.ts'],
    diffLines: 20,
  }, policy)
}

function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  // strict:false 下布尔字面量不收窄，统一用 error 字段判别（同服务端）。
  if ('error' in r) throw new Error(`expected ok, got ${(r as { detail?: string }).detail}`)
  return r as Extract<T, { ok: true }>
}

describe('开案例与轮次', () => {
  it('第 1 轮自动生成，风险档与人工名额随策略计算', () => {
    const c = open()
    expect(c.rounds).toHaveLength(1)
    expect(c.rounds[0].diffOnly).toBe(false)
    expect(c.risk.tier).toBe('medium')
    expect(c.risk.requiredHumanApprovals).toBe(1)
  })

  it('第 3 轮起只看新增 diff；第 4 轮封顶 409 语义', () => {
    const r2 = must(startRound(open(), { headCommit: 'c2' }, policy)).case
    expect(r2.rounds).toHaveLength(2)
    expect(r2.rounds[1].diffOnly).toBe(false)
    const r3 = must(startRound(r2, { headCommit: 'c3' }, policy)).case
    expect(r3.rounds[2].diffOnly).toBe(true)
    const capped = startRound(r3, { headCommit: 'c4' }, policy)
    expect(capped.ok).toBe(false)
    if ('error' in capped) {
      expect(capped.code).toBe('round_cap_reached')
      expect(capped.detail).toContain('重新审视方案')
    }
  })

  it('新提交使旧审批失效', () => {
    const withApproval = addApproval(open(), {
      actor: 'alice', actorKind: 'human', decision: 'approve', commit: 'c1',
    })
    expect(mergeReadiness(withApproval, policy).humanApprovals).toBe(1)
    const r2 = must(startRound(withApproval, { headCommit: 'c2' }, policy)).case
    expect(mergeReadiness(r2, policy).humanApprovals).toBe(0)
    expect(r2.approvals[0].invalidatedBy).toBe('new_commit')
  })

  it('同一提交重开轮次不失效审批', () => {
    const withApproval = addApproval(open(), {
      actor: 'alice', actorKind: 'human', decision: 'approve', commit: 'c1',
    })
    const r2 = must(startRound(withApproval, {}, policy)).case
    expect(mergeReadiness(r2, policy).humanApprovals).toBe(1)
  })
})

describe('发现项与收敛', () => {
  it('important 必须带证据', () => {
    const r = addFinding(open(), { file: 'packages/server/src/feature.ts', line: 3, body: '空指针', severity: 'important' }, policy)
    expect(r.ok).toBe(false)
    if ('error' in r) expect(r.code).toBe('evidence_required')
  })

  it('自造路径与行号被拒', () => {
    const base = open()
    const abs = addFinding(base, { file: '/etc/passwd', line: 1, body: 'x', severity: 'nit' }, policy)
    expect(abs.ok).toBe(false)
    const traversal = addFinding(base, { file: '../secret', line: 1, body: 'x', severity: 'nit' }, policy)
    expect(traversal.ok).toBe(false)
    const line = addFinding(base, { file: 'a.ts', line: 0, body: 'x', severity: 'nit' }, policy)
    expect(line.ok).toBe(false)
  })

  it('同文件同 bug 类去重，只累加 duplicateCount', () => {
    const first = must(addFinding(open(), {
      file: 'packages/server/src/feature.ts', line: 3, body: '这里会空指针', severity: 'nit', bugClass: 'null-deref',
    }, policy))
    const again = must(addFinding(first.case, {
      file: 'packages/server/src/feature.ts', line: 9, body: '同一个空指针问题', severity: 'nit', bugClass: 'null-deref',
    }, policy))
    expect(again.deduped).toBe(true)
    expect(again.case.findings).toHaveLength(1)
    expect(again.finding.duplicateCount).toBe(1)
  })

  it('nit 超预算转延后，不阻塞也不丢账', () => {
    const first = must(addFinding(open(), {
      file: 'packages/server/src/feature.ts', line: 3, body: '命名建议', severity: 'nit', bugClass: 'naming',
    }, policy))
    const second = must(addFinding(first.case, {
      file: 'packages/server/src/feature.ts', line: 4, body: '空行建议', severity: 'nit', bugClass: 'blank-line',
    }, policy))
    expect(second.finding.deferred).toBe(true)
    expect(second.finding.deferredReason).toContain('nit_budget')
    expect(blockingFindings(second.case)).toHaveLength(0)
  })

  it('第 3 轮只看新增 diff：存量问题转夜间扫描', () => {
    const r2 = must(startRound(open(), { headCommit: 'c2' }, policy)).case
    const r3 = must(startRound(r2, { headCommit: 'c3' }, policy)).case
    const stale = must(addFinding(r3, {
      file: 'packages/server/src/old.ts', line: 1, body: '历史遗留问题', severity: 'preexisting',
    }, policy))
    expect(stale.finding.deferred).toBe(true)
    expect(stale.finding.deferredReason).toContain('preexisting_after_round_3')
  })

  it('第 3 轮新增 diff 内的问题仍正常入库', () => {
    const r2 = must(startRound(open(), { headCommit: 'c2' }, policy)).case
    const r3 = must(startRound(r2, { headCommit: 'c3', changedPaths: ['packages/server/src/feature.ts'] }, policy)).case
    const fresh = must(addFinding(r3, {
      file: 'packages/server/src/feature.ts', line: 10, body: '新代码越界', severity: 'important', evidence: 'npm test: FAIL line 10',
    }, policy))
    expect(fresh.finding.deferred).toBe(false)
  })

  it('deferPreexisting=false 时存量问题不再自动延后', () => {
    const noDefer: ReviewPolicy = {
      ...policy,
      convergence: { ...policy.convergence, deferPreexisting: false },
    }
    const r2 = must(startRound(open(), { headCommit: 'c2' }, noDefer)).case
    const r3 = must(startRound(r2, { headCommit: 'c3', changedPaths: ['packages/server/src/old.ts'] }, noDefer)).case
    const stale = must(addFinding(r3, {
      file: 'packages/server/src/old.ts', line: 1, body: '历史遗留问题', severity: 'preexisting',
    }, noDefer))
    expect(stale.finding.deferred).toBe(false)
  })

  it('重要发现需独立验证确认才阻塞；人类作者直接视为确认', () => {
    const agent = must(addFinding(open(), {
      file: 'packages/server/src/feature.ts', line: 3, body: '越界', severity: 'important', evidence: 'test log',
    }, policy))
    expect(blockingFindings(agent.case)).toHaveLength(0)
    const verified = must(verifyFinding(agent.case, agent.finding.findingId, 'confirm', 'verifier-1', 'agent'))
    expect(blockingFindings(verified.case)).toHaveLength(1)
    const rejected = must(verifyFinding(verified.case, agent.finding.findingId, 'reject', 'verifier-2', 'agent'))
    // confirm=1, reject=1 → 不满足 confirm > reject
    expect(blockingFindings(rejected.case)).toHaveLength(0)

    const human = must(addFinding(open(), {
      file: 'packages/server/src/feature.ts', line: 5, body: '人类发现', severity: 'important', evidence: '人工复现',
      authorKind: 'human', author: 'alice',
    }, policy))
    expect(blockingFindings(human.case)).toHaveLength(1)
  })

  it('回答 fixed 收口；wrong/intentional/didnt_matter 关闭并留噪声痕迹', () => {
    const added = must(addFinding(open(), {
      file: 'packages/server/src/feature.ts', line: 3, body: '误报', severity: 'nit',
    }, policy))
    const fixed = must(answerFinding(added.case, added.finding.findingId, 'fixed', 'alice'))
    expect(fixed.finding.state).toBe('resolved')
    const wrong = must(answerFinding(added.case, added.finding.findingId, 'wrong', 'alice'))
    expect(wrong.finding.state).toBe('dismissed')
    expect(wrong.finding.resolution).toBe('wrong')
  })
})

describe('合并就绪度', () => {
  it('人工审批 + 检查绿 + 无阻塞发现 = ready', () => {
    let c = open()
    c = addApproval(c, { actor: 'alice', actorKind: 'human', decision: 'approve', commit: 'c1' })
    c = { ...c, checks: 'green' }
    expect(mergeReadiness(c, policy).ready).toBe(true)
  })

  it('Agent 审批不占人工名额；旧提交审批不算', () => {
    let c = addApproval(open(), { actor: 'review-agent', actorKind: 'agent', decision: 'approve', commit: 'c1' })
    const r = mergeReadiness(c, policy)
    expect(r.humanApprovals).toBe(0)
    expect(r.agentApprovals).toBe(1)
    expect(r.ready).toBe(false)
    c = addApproval(c, { actor: 'alice', actorKind: 'human', decision: 'approve', commit: 'old' })
    expect(mergeReadiness(c, policy).humanApprovals).toBe(0)
  })

  it('解冲突后旧审批失效', () => {
    let c = addApproval(open(), { actor: 'alice', actorKind: 'human', decision: 'approve', commit: 'c1' })
    expect(mergeReadiness(c, policy).humanApprovals).toBe(1)
    c = addApproval(c, { actor: 'bob', actorKind: 'human', decision: 'comment', commit: 'c1', conflictResolved: true })
    expect(mergeReadiness(c, policy).humanApprovals).toBe(0)
    expect(c.approvals[0].invalidatedBy).toBe('conflict_resolution')
  })

  it('人类 request_changes 阻塞合并，即使人工审批数已达标', () => {
    let c = addApproval(open(), { actor: 'alice', actorKind: 'human', decision: 'request_changes', commit: 'c1' })
    c = addApproval(c, { actor: 'bob', actorKind: 'human', decision: 'approve', commit: 'c1' })
    c = { ...c, checks: 'green' }
    const r = mergeReadiness(c, policy)
    expect(r.humanApprovals).toBe(1)
    expect(r.ready).toBe(false)
    expect(r.blockers.join(' ')).toContain('changes_requested')
  })
})

describe('去重键', () => {
  it('bug 类优先于正文；正文归一化后稳定', () => {
    expect(dedupeKeyOf('a.ts', 'Null Deref', 'x')).toBe('a.ts|null-deref')
    expect(dedupeKeyOf('a.ts', undefined, '  这里 有 问题。 ')).toBe(dedupeKeyOf('a.ts', undefined, '这里 有 问题'))
  })
})
