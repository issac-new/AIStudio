// 评审治理·度量与熔断守门。
import { describe, it, expect } from 'vitest'
import { computeMetrics, evaluateBreaker, humanWaitMs } from '../metrics'
import { createCase } from '../convergence'
import {
  DEFAULT_POLICY, type ReviewCase, type ReviewEvalCase, type ReviewFinding, type ReviewSignal,
} from '../types'

const now = 1_000_000_000
const policy = DEFAULT_POLICY

function makeCase(id: string, over: Partial<ReviewCase> = {}): ReviewCase {
  const base = createCase({
    caseId: id,
    title: id,
    headCommit: `${id}-c1`,
    changedPaths: ['packages/server/src/x.ts'],
  }, policy, null, now - 1000)
  return { ...base, ...over }
}

function finding(id: string, over: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    findingId: id,
    file: 'a.ts',
    line: 1,
    body: 'x',
    severity: 'nit',
    origin: 'new',
    authorKind: 'agent',
    round: 1,
    dedupeKey: `${id}`,
    state: 'open',
    deferred: false,
    duplicateCount: 0,
    verifications: [],
    createdAt: now,
    ...over,
  }
}

describe('回滚熔断', () => {
  const sig = (kind: ReviewSignal['kind'], at: number): ReviewSignal => ({ signalId: `${kind}-${at}`, kind, at })

  it('回滚率超过阈值即激活', () => {
    const signals: ReviewSignal[] = [
      ...Array.from({ length: 10 }, (_, i) => sig('merge', now - 1000 - i)),
      sig('revert', now - 500),
    ]
    const b = evaluateBreaker(signals, policy, now)
    expect(b.active).toBe(true)
    expect(b.revertRate).toBeCloseTo(0.1)
    expect(b.reasons.join(' ')).toContain('revert_rate')
  })

  it('事故数达到阈值即激活', () => {
    const b = evaluateBreaker([sig('incident', now - 10), sig('incident', now - 20)], policy, now)
    expect(b.active).toBe(true)
    expect(b.reasons.join(' ')).toContain('incidents')
  })

  it('窗口外信号忽略；无合并样本时回滚率为 null', () => {
    const old = now - policy.circuitBreaker.windowHours * 3600_000 - 1
    const b = evaluateBreaker([sig('revert', old), sig('merge', now - 10)], policy, now)
    expect(b.reverts).toBe(0)
    expect(b.revertRate).toBe(0)
    expect(b.active).toBe(false)
    const empty = evaluateBreaker([], policy, now)
    expect(empty.revertRate).toBeNull()
    expect(empty.active).toBe(false)
  })
})

describe('评审判度聚合', () => {
  const cases: ReviewCase[] = [
    makeCase('a', {
      state: 'merged',
      rounds: [{ round: 1, changedPaths: [], startedAt: now, diffOnly: false, findingsAdded: 0, nitCount: 0 }],
      approvals: [{ approvalId: 'a1', actorKind: 'human', decision: 'approve', commit: 'a-c1', at: now - 500 }],
    }),
    makeCase('b', {
      state: 'ready',
      rounds: [{ round: 1, changedPaths: [], startedAt: now, diffOnly: false, findingsAdded: 0, nitCount: 0 }],
    }),
    makeCase('c', {
      state: 'merged',
      rounds: [
        { round: 1, changedPaths: [], startedAt: now, diffOnly: false, findingsAdded: 0, nitCount: 0 },
        { round: 2, changedPaths: [], startedAt: now, diffOnly: false, findingsAdded: 0, nitCount: 0 },
      ],
      approvals: [
        { approvalId: 'c1', actorKind: 'human', decision: 'approve', commit: 'c-c1', at: now - 400 },
        { approvalId: 'c2', actorKind: 'human', decision: 'approve', commit: 'c-c1', at: now - 300 },
      ],
    }),
    makeCase('d', {
      state: 'open',
      rounds: Array.from({ length: 5 }, (_, i) => ({
        round: i + 1, changedPaths: [], startedAt: now, diffOnly: i + 1 > 2, findingsAdded: 0, nitCount: 0,
      })),
      findings: [
        finding('f1', { severity: 'important', state: 'open' }),
        finding('f2', { severity: 'preexisting', origin: 'preexisting', state: 'deferred', deferred: true }),
        finding('f3', { state: 'resolved', resolution: 'fixed', answeredAt: now }),
        finding('f4', { state: 'dismissed', resolution: 'wrong', answeredAt: now }),
        finding('f5', { state: 'dismissed', resolution: 'intentional', answeredAt: now }),
        finding('f6', { state: 'dismissed', resolution: 'didnt_matter', answeredAt: now }),
      ],
    }),
  ]

  it('一轮通过率/平均轮次/5+ 轮占比/人工审批中位/噪声率/存量占比', () => {
    const evalCases: ReviewEvalCase[] = [{
      evalCaseId: 'ev1', caseId: 'd', source: 'manual', title: 'x', expected: 'y', createdAt: now,
    }]
    const m = computeMetrics(cases, [], policy, evalCases, now)
    expect(m.cases).toBe(4)
    expect(m.merged).toBe(2)
    expect(m.active).toBe(1)
    expect(m.firstRoundPassRate).toBeCloseTo(2 / 3)   // a/b 一轮过；c 两轮
    expect(m.meanRounds).toBeCloseTo((1 + 1 + 2 + 5) / 4)
    expect(m.fivePlusShare).toBeCloseTo(1 / 4)
    expect(m.humanApprovalsMedian).toBe(0.5)           // 1/0/2/0 → 中位 (0+1)/2
    expect(m.noiseRate).toBe(0.75)                     // fixed + 三个噪声 → 3/4
    expect(m.preexistingShare).toBeCloseTo(1 / 6)
    expect(m.deferredBacklog).toBe(1)
    expect(m.openImportant).toBe(1)
    expect(m.evalCases).toBe(1)
  })

  it('人工等待时间 = 创建到首个有效人工审批', () => {
    expect(humanWaitMs(cases[0])).toBe(500)
    expect(humanWaitMs(cases[1])).toBeNull()
  })
})
