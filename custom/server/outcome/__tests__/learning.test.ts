// 批二 T6 守门：结算触发学习候选（双闸/幂等/形状）与同口径对照投影
//（effect 三态/口径逐字/单结果恒 unknown）——spec §五逐条。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateLearningCandidate, learningGatesOn, type SettlementForLearning } from '../learning'
import { buildOutcomeComparison, pickBaseline, type SettledOutcomeForComparison } from '../comparison'
import type { OutcomeContract, OutcomeMeasurement } from '../types'

let expDir = ''
beforeEach(() => { expDir = mkdtempSync(join(tmpdir(), 'exp-learn-')); process.env.EXP_STORE = expDir })
afterEach(() => { delete process.env.EXP_STORE; rmSync(expDir, { recursive: true, force: true }) })

function contract(outcomeId: string, over: Partial<OutcomeContract> = {}): OutcomeContract {
  return {
    schemaVersion: 1, outcomeId, rootTaskId: `tk-${outcomeId}`, version: 1,
    title: '发布事故率下降', valueStatement: 'v',
    ownerPersonId: 'p-1', verificationOwnerId: 'p-2',
    measures: [{ measureId: 'm1', name: '事故数', definition: '滚动 30 天 P0 事故数', unit: '次', operator: 'lte', baseline: null, target: 0, sourceRef: 'incidents://x' }],
    acceptance: { statements: [], requiredEvidenceKinds: [] },
    scope: { included: [], excluded: [] },
    riskTier: 'medium', defaultReversibility: 'reversible',
    contextPolicy: { allowedScopes: [], excludedSourceKinds: [] },
    learningOptIn: true, status: 'settled', createdAt: 1, updatedAt: 1,
    ...over,
  } as OutcomeContract
}

const settlement = (id: string, signedAt = 100): SettlementForLearning =>
  ({ settlementId: id, verdict: 'achieved', rationale: '两个度量全部达标，证据链完整可复核，准予收口。', signedAt })

describe('generateLearningCandidate（结算→候选）', () => {
  it('双闸：learningOptIn=false 或 EXPERIENCE_INJECT≠1 均不生成', () => {
    expect(learningGatesOn(contract('oc-a'), '1')).toBe(true)
    expect(learningGatesOn(contract('oc-a', { learningOptIn: false }), '1')).toBe(false)
    expect(learningGatesOn(contract('oc-a'), '0')).toBe(false)
    const r = generateLearningCandidate(contract('oc-a', { learningOptIn: false }), settlement('s1'), '1')
    expect(r.generated).toBe(false)
    expect(r.reason).toContain('双闸未开')
  })

  it('双闸开：生成 candidate 态候选（带 outcomeId/sourceSettlementId 锚，statement 含 verdict）；status 非 approved', () => {
    const r = generateLearningCandidate(contract('oc-a'), settlement('s1'), '1')
    expect(r.generated).toBe(true)
    expect(r.candidateId).toMatch(/^exp-/)
    const raw = JSON.parse(require('node:fs').readFileSync(join(expDir, 'exp-candidates.json'), 'utf8'))
    const c = raw.candidates[0]
    expect(c.status).toBe('candidate')
    expect(c.outcomeId).toBe('oc-a')
    expect(c.sourceSettlementId).toBe('s1')
    expect(c.statement).toContain('achieved')
  })

  it('幂等：同 settlementId 再触发跳过（不重复生成）', () => {
    const first = generateLearningCandidate(contract('oc-a'), settlement('s1'), '1')
    const second = generateLearningCandidate(contract('oc-a'), settlement('s1'), '1')
    expect(first.generated).toBe(true)
    expect(second.generated).toBe(false)
    expect(second.reason).toContain('幂等跳过')
    expect(second.candidateId).toBe(first.candidateId)
  })
})

// ---------- 对照投影 ----------

function settled(outcomeId: string, m1Actual: number | null, signedAt: number, defOverride?: string): SettledOutcomeForComparison {
  const c = contract(outcomeId)
  if (defOverride) c.measures[0].definition = defOverride
  const ms: OutcomeMeasurement[] = [{
    measurementId: `mea-${outcomeId}`, outcomeId, measureId: 'm1', contractVersion: 1,
    actual: m1Actual, availability: m1Actual === null ? 'pending' : 'available',
    evidenceRefs: ['evid://1'], observedAt: signedAt - 1, recordedBy: 'x', recordedAt: signedAt - 1,
  }]
  return { contract: c, measurements: ms, settlement: { settlementId: `set-${outcomeId}`, verdict: 'achieved', signedAt } }
}

describe('buildOutcomeComparison（同口径对照）', () => {
  it('单结果（无基线）→ effect=unknown＋缺口说明，不宣称改善（spec §五红线）', () => {
    const r = buildOutcomeComparison(settled('oc-only', 0, 200), [])
    expect(r.effect).toBe('unknown')
    expect(r.baselineOutcomeId).toBeNull()
    expect(r.gapNote).toContain('不足两个同口径')
    expect(r.rows[0].evaluation.actual).toBe(0)
  })

  it('同口径两结果：基线未达标→本次达标=improved；口径漂移（definition 不同）不算同口径→基线 null→unknown', () => {
    const improved = buildOutcomeComparison(settled('oc-new', 0, 200), [settled('oc-old', 5, 100)])
    expect(improved.baselineOutcomeId).toBe('oc-old')
    expect(improved.effect).toBe('improved')
    expect(improved.rows[0].baseline?.actual).toBe(5)
    // B5：对照行带本合同自带的基线声明（与 baseline 字段不同义——那是另一份合同的实测）
    expect(improved.rows[0].declaredBaseline).toBeTruthy()
    expect(typeof improved.rows[0].declaredBaseline!.baseline === 'number' || improved.rows[0].declaredBaseline!.baseline === null).toBe(true)
    const drifted = buildOutcomeComparison(settled('oc-new2', 0, 200), [settled('oc-old2', 5, 100, '口径已改')])
    expect(drifted.baselineOutcomeId).toBeNull() // 无同口径基线可挑
    expect(drifted.effect).toBe('unknown')
  })

  it('达成数持平→unknown（无变化不构成改善迹象）；退化→degraded', () => {
    const flat = buildOutcomeComparison(settled('oc-n', 5, 200), [settled('oc-o', 5, 100)])
    expect(flat.effect).toBe('unknown')
    expect(flat.gapNote).toContain('持平')
    const worse = buildOutcomeComparison(settled('oc-n2', 8, 200), [settled('oc-o2', 0, 100)])  // 基线达标→本次未达标
    expect(worse.effect).toBe('degraded')
  })

  it('基线挑选取 signedAt 最新；pickBaseline 只认至少一同口径度量', () => {
    const older = settled('oc-b1', 5, 100)
    const newer = settled('oc-b2', 6, 150)
    const pick = pickBaseline(settled('oc-e', 0, 200), [older, newer])
    expect(pick?.contract.outcomeId).toBe('oc-b2')
    const noOverlap = pickBaseline(settled('oc-e2', 0, 200), [settled('x', 5, 100, '完全另一个口径')])
    expect(noOverlap).toBeNull()
  })
})
