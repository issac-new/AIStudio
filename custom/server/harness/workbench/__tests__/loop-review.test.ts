// 审阅结论（2026-11-26 Palantir 架构吸收轮）：置信档、限制与支撑读数、基线与候选的评估条件可比性。
// 纪律：只披露不拦截——置信档不改变晋级门的通过与否。
import { describe, it, expect } from 'vitest'
import { evaluatorComparabilityOf, reviewAssessment } from '../loop-review'
import { behaviorContrast, diffSummary, evaluatePromotion, hypothesisRetries, proposerEvolutionHistory, sha256, variantSetDigest } from '../loop'
import type { Probe, ProbeMetrics, Proposal, RegularizationDerived, ReviewAssessment, SelectionBiasAudit, Variant } from '../types'

const JUDGE = { models: ['m'], backend: 'llm', tauYes: 0.7, tauNo: 0.3 }
const FINGERPRINT = { setHash: 'paper-1', setRevision: 1, judge: JUDGE }
const NOW = new Date().toISOString()

function metrics(over: Partial<ProbeMetrics> = {}): ProbeMetrics {
  return {
    evalRunId: 'run-base',
    setId: 'set-1',
    setRevision: 1,
    evaluator: FINGERPRINT,
    k: 3,
    passAt1: 0.5,
    passAtK: 0.5,
    resultPassRate: 0.5,
    trajectoryPassRate: 0.5,
    unknownRatio: 0,
    riskVeto: false,
    judgeOnline: true,
    statisticallyInsufficient: false,
    tokens: 1000,
    costUsd: 1,
    steps: 10,
    latencyMs: 1000,
    ...over,
  }
}

/** 证据齐全的候选读数：采样 3 次、回归全过、等预算基线、反事实、执行证迹命中、耗时读数都在。 */
function fullEvidence(over: Partial<ProbeMetrics> = {}): ProbeMetrics {
  return metrics({
    evalRunId: 'run-v1',
    passAt1: 0.8,
    passAtK: 0.8,
    resultPassRate: 0.8,
    regression: { runId: 'run-reg', suiteName: '回归样本库', total: 4, failed: 0, failedTaskIds: [] },
    equalBudgetBaseline: { runId: 'run-eq', setId: 'set-1', passAt1: 0.5 },
    counterfactual: { runId: 'run-cf', setId: 'cf-1', passAt1: 0.8 },
    executionTrace: { status: 'observed', markers: ['s1'], hit: ['s1'], hitRatio: 1, scannedChars: 1000, source: 'stream-json', at: NOW },
    ...over,
  })
}

function variant(id: string, content: string): Variant {
  return { id, label: id, content, digest: sha256(content), diffSummary: diffSummary('base', content) }
}

function reg(over: Partial<RegularizationDerived> = {}): RegularizationDerived {
  return {
    round: 1, horizon: 20, editBudget: 4, maxEditCount: 1, editBudgetExceeded: false,
    noiseDelta: 0.05, noiseRuns: 2, stalled: false, stallWindow: 3, firstOnSurface: false, hypothesisRetry: [],
    ...over,
  }
}

function bias(verdict: SelectionBiasAudit['verdict'], note = '选择偏差说明'): SelectionBiasAudit {
  return { poolSize: 2, best: 0.8, runnerUp: 0.78, gap: 0.02, expectedOptimismZ: null, expectedOptimism: null, adjustedBest: null, realizedGap: null, verdict, note }
}

function proposal(over: Partial<Proposal> = {}): Proposal {
  const variants = [variant('v1', 'candidate one')]
  const p: Proposal = {
    id: 'hw-001',
    title: '提示词收紧',
    hypothesis: '收紧输出约束可减少返工',
    surfaceKey: 'system_prompt',
    targetPath: 'profiles/p1/SOUL.md',
    risk: 'medium',
    mode: 'parallel',
    domain: 'general',
    status: 'composed',
    noise: { runIds: ['a', 'b'], setId: 'set-1', delta: 0.05, method: 'half-range', samples: [0.5, 0.6], computedAt: NOW },
    heldout: { runId: 'h1', n: 10, passRate: 0.8 },
    budgetCapUsd: 5,
    evidenceRefs: ['task:t1'],
    experienceIds: [],
    baselineRunId: 'run-base',
    baseline: metrics(),
    base: { content: 'base', digest: sha256('base'), revision: null, exists: true },
    variants,
    probes: [],
    approval: { decision: 'approved', actor: 'reviewer', note: '', variantSetDigest: variantSetDigest(variants), at: NOW },
    composition: { variantId: 'v1', digest: variants[0].digest, rationale: '通过率提升', actor: 'reviewer', at: NOW },
    promotion: null,
    rollback: null,
    createdBy: 'drafter',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }
  p.probes = [probeOf(p, 'v1', fullEvidence())]
  return p
}

function probeOf(p: Proposal, variantId: string, evidence: ProbeMetrics): Probe {
  return { id: `pr-${variantId}`, variantId, status: 'recorded', evidence, contrast: behaviorContrast(p.baseline ?? metrics(), evidence), createdAt: NOW, recordedAt: NOW }
}

/** 造好提案后替换选中候选的读数与对比。 */
function withEvidence(p: Proposal, over: Partial<ProbeMetrics>, contrastOver: Partial<Probe['contrast']> = {}): Proposal {
  const evidence = fullEvidence(over)
  const probe = p.probes[0]
  probe.evidence = evidence
  probe.contrast = { ...behaviorContrast(p.baseline!, evidence), ...contrastOver } as Probe['contrast']
  return p
}

const assess = (p: Proposal, selectionBias: SelectionBiasAudit | undefined = undefined, noiseDelta: number | null = reg().noiseDelta): ReviewAssessment =>
  reviewAssessment({ proposal: p, selectionBias, noiseDelta })

describe('审阅结论：置信档', () => {
  it('选中候选没有已记录探测 → 未知，并写明原因', () => {
    const p = proposal()
    p.probes[0].status = 'planned'
    const a = assess(p)
    expect(a.confidence).toBe('unknown')
    expect(a.evaluatorComparability).toBe('unknown')
    expect(a.limitations).toEqual(['选中候选没有已记录的探测读数，无法评估结论的可信度'])
    expect(a.strengths).toEqual([])
  })

  it('证据齐全、单候选、批准人与提出人不同 → 充分：没有任何限制', () => {
    const a = assess(proposal())
    expect(a.confidence).toBe('sufficient')
    expect(a.limitations).toEqual([])
    expect(a.evaluatorComparability).toBe('same')
    expect(a.strengths.some((s) => s.includes('噪声带已标定'))).toBe(true)
    expect(a.strengths.some((s) => s.includes('密封留出读数（10 题'))).toBe(true)
    expect(a.strengths.some((s) => s.includes('历史回归 4 项全部通过'))).toBe(true)
    expect(a.strengths.some((s) => s.includes('命中 1/1'))).toBe(true)
  })

  it('质量判定未知 → 不足', () => {
    const a = assess(withEvidence(proposal(), {}, { quality: 'unknown' }))
    expect(a.confidence).toBe('insufficient')
    expect(a.limitations.some((l) => l.includes('质量判定未知'))).toBe(true)
  })

  it('采样少于 3 次 → 不足，即使其他证据齐全', () => {
    const a = assess(withEvidence(proposal(), { k: 2 }))
    expect(a.confidence).toBe('insufficient')
    expect(a.limitations.some((l) => l.includes('k=2'))).toBe(true)
  })

  it('基线与候选的评估条件不同 → 不足，并逐字段列出', () => {
    const p = withEvidence(proposal(), { evaluator: { setHash: 'paper-2', setRevision: 1, judge: { ...JUDGE, models: ['m2'] } } })
    const a = assess(p)
    expect(a.confidence).toBe('insufficient')
    expect(a.evaluatorComparability).toBe('changed')
    expect(a.evaluatorChangedFields).toEqual(['setHash', 'judge'])
    expect(a.limitations.some((l) => l.includes('评估条件不同（setHash、judge）'))).toBe(true)
  })

  it('噪声未标定 → 有限，支撑读数里不再写噪声带', () => {
    const a = assess(proposal(), undefined, null)
    expect(a.confidence).toBe('limited')
    expect(a.limitations).toContain('噪声带未标定：增益无法与评测噪声区分')
    expect(a.strengths.some((s) => s.includes('噪声带已标定'))).toBe(false)
  })

  it('未绑定留出读数 → 有限', () => {
    const a = assess(proposal({ heldout: null }))
    expect(a.confidence).toBe('limited')
    expect(a.limitations).toContain('未绑定密封留出读数：没有独立于优化集的验证数据')
  })

  it('基线缺指纹、评估条件无法比较 → 有限，不按相同处理', () => {
    const a = assess(proposal({ baseline: metrics({ evaluator: null }) }))
    expect(a.confidence).toBe('limited')
    expect(a.evaluatorComparability).toBe('unknown')
    expect(a.limitations).toContain('基线与候选的评估条件无法比较：缺试卷或裁判指纹')
  })

  it('批准人与提出人是同一人 → 有限', () => {
    const p = proposal()
    p.approval!.actor = 'drafter'
    const a = assess(p)
    expect(a.confidence).toBe('limited')
    expect(a.limitations).toContain('批准人与提出人是同一人：这次批准不构成独立复核')
  })

  it('多候选择优有偏差风险 → 有限，并带上选择偏差的说明', () => {
    const a = assess(proposal(), bias('top2_within_noise', '最优-次优间隔落在噪声带内'))
    expect(a.confidence).toBe('limited')
    expect(a.limitations.some((l) => l.includes('多候选择优存在偏差风险') && l.includes('最优-次优间隔落在噪声带内'))).toBe(true)
  })

  it('留出读数确认了选择 → 进支撑读数', () => {
    const a = assess(proposal(), bias('heldout_confirms', '留出读数确认了选择'))
    expect(a.confidence).toBe('sufficient')
    expect(a.strengths).toContain('留出读数确认了选择')
  })

  it('增益有意义但缺等预算基线、反事实、执行证迹 → 三条限制各写一条', () => {
    const a = assess(withEvidence(proposal(), { equalBudgetBaseline: null, counterfactual: null, executionTrace: null }))
    expect(a.confidence).toBe('limited')
    expect(a.limitations.some((l) => l.includes('未绑定等预算基线'))).toBe(true)
    expect(a.limitations.some((l) => l.includes('未绑定反事实变体运行'))).toBe(true)
    expect(a.limitations.some((l) => l.includes('未采集到执行证迹'))).toBe(true)
  })

  it('没有增益时不要求算力归因与反事实（那些门只在有增益时才有意义）', () => {
    const p = withEvidence(proposal(), { passAt1: 0.5, passAtK: 0.5, resultPassRate: 0.5, equalBudgetBaseline: null, counterfactual: null })
    const a = assess(p)
    expect(a.limitations.some((l) => l.includes('未绑定等预算基线'))).toBe(false)
    expect(a.limitations.some((l) => l.includes('未绑定反事实变体运行'))).toBe(false)
  })

  it('缺耗时读数 → 有限', () => {
    const a = assess(withEvidence(proposal(), { latencyMs: null }))
    expect(a.limitations).toContain('没有耗时读数：无法判断执行时间的变化')
  })

  it('成本与耗时都下降：写进支撑读数，带百分比；不出现在限制里', () => {
    const a = assess(withEvidence(proposal(), { costUsd: 0.8, latencyMs: 800 }))
    expect(a.strengths).toContain('单次调用成本相对基线下降 20.0%')
    expect(a.strengths).toContain('执行耗时相对基线下降 20.0%')
    expect(a.limitations.some((l) => l.includes('耗时'))).toBe(false)
  })

  it('耗时上升：写进限制并注明现行规则不拦', () => {
    const a = assess(withEvidence(proposal(), { latencyMs: 1250 }))
    expect(a.limitations).toContain('执行耗时相对基线上升 25.0%：现行规则不拦耗时回退')
    expect(a.strengths.some((l) => l.includes('耗时'))).toBe(false)
  })

  it('限制里不重复已经是阻断项的事实（回归失败、质量倒退）', () => {
    const p = withEvidence(
      proposal(),
      { regression: { runId: 'run-reg', suiteName: '回归样本库', total: 4, failed: 2, failedTaskIds: ['r1', 'r2'] } },
      { quality: 'regressed' },
    )
    const a = assess(p)
    expect(a.limitations.some((l) => l.includes('回归'))).toBe(false)
    expect(a.limitations.some((l) => l.includes('倒退'))).toBe(false)
  })
})

describe('评估条件可比性', () => {
  const candidate = { setId: 'set-1', evaluator: FINGERPRINT }

  it('同卷同裁判 → 相同', () => {
    expect(evaluatorComparabilityOf({ setId: 'set-1', evaluator: FINGERPRINT }, candidate)).toEqual({ evaluatorComparability: 'same', evaluatorChangedFields: [] })
  })

  it('试卷指纹变更 → 有变更并列出 setHash', () => {
    expect(evaluatorComparabilityOf({ setId: 'set-1', evaluator: { ...FINGERPRINT, setHash: 'paper-2' } }, candidate).evaluatorChangedFields).toEqual(['setHash'])
  })

  it('裁判变更 → 有变更并列出 judge', () => {
    expect(evaluatorComparabilityOf({ setId: 'set-1', evaluator: { ...FINGERPRINT, judge: { ...JUDGE, tauYes: 0.9 } } }, candidate).evaluatorChangedFields).toEqual(['judge'])
  })

  it('试卷编号不同 → 有变更，setId 排在最前', () => {
    const r = evaluatorComparabilityOf({ setId: 'set-9', evaluator: FINGERPRINT }, candidate)
    expect(r.evaluatorComparability).toBe('changed')
    expect(r.evaluatorChangedFields).toEqual(['setId'])
  })

  it('任一侧缺指纹 → 未知，不按相同处理', () => {
    expect(evaluatorComparabilityOf(null, candidate).evaluatorComparability).toBe('unknown')
    expect(evaluatorComparabilityOf({ setId: 'set-1', evaluator: { ...FINGERPRINT, judge: null } }, candidate).evaluatorComparability).toBe('unknown')
    expect(evaluatorComparabilityOf({ setId: 'set-1', evaluator: null }, candidate).evaluatorComparability).toBe('unknown')
  })
})

describe('审阅结论不参与晋级判定', () => {
  const gate = (p: Proposal) => evaluatePromotion({ proposal: p, currentChampion: null, applyRequested: false, applyEnvEnabled: false, regularization: reg() })

  it('采样只有 2 次且已豁免：置信档是不足，通过与否仍只看阻断项（结果为通过）', () => {
    const p = proposal({
      waivers: [{ code: 'min_k', actor: 'reviewer', reason: '接受统计风险', at: NOW }],
    })
    withEvidence(p, { k: 2 })
    const report = gate(p)
    expect(report.assessment?.confidence).toBe('insufficient')
    expect(report.warnings.some((w) => w.code === 'statistical_insufficient_waived')).toBe(true)
    expect(report.blockers).toEqual([])
    expect(report.ok).toBe(true)
    expect(report.ok).toBe(report.blockers.length === 0)
  })

  it('证据齐全但缺批准：置信档是充分，通过与否仍按阻断项（结果为不通过）', () => {
    const p = proposal({ approval: null })
    const report = gate(p)
    expect(report.assessment?.confidence).toBe('sufficient')
    expect(report.blockers.map((b) => b.code)).toContain('approval_missing')
    expect(report.ok).toBe(false)
  })

  it('评估条件有变更：只进审阅结论，不产生新的阻断码或告警码', () => {
    const codes = (r: ReturnType<typeof gate>) => [...r.blockers, ...r.warnings].map((x) => x.code)
    const plain = gate(proposal())
    const changed = gate(withEvidence(proposal(), { evaluator: { ...FINGERPRINT, setHash: 'paper-2' } }))
    expect(changed.assessment?.evaluatorComparability).toBe('changed')
    expect(codes(changed).filter((c) => !codes(plain).includes(c))).toEqual([])
    expect(changed.ok).toBe(plain.ok)
  })
})

describe('原因归属在起草侧的两处消费面', () => {
  const NOW2 = new Date().toISOString()
  function vetoed(id: string, status: Proposal['status'], cause: Proposal['approval']['cause'] | Proposal['rollback']['cause']): Proposal {
    const p = proposal({ id, status: status as Proposal['status'], hypothesis: `同样的假设 ${id}` })
    p.hypothesis = '收紧输出约束可减少返工'
    if (status === 'rejected') p.approval = { decision: 'rejected', actor: 'r', note: '理由', variantSetDigest: 'x', at: NOW2, ...(cause ? { cause } : {}) }
    else p.rollback = { actor: 'r', at: NOW2, reason: '理由', restoredDigest: null, fileRestored: false, ...(cause ? { cause } : {}) }
    return p
  }

  it('事后相似度警示：因外部环境被否决的假设不再算「失败假设」；提案自身、判不清与未分类的仍然算', () => {
    const proposals = [
      vetoed('ext', 'rejected', 'external'),
      vetoed('own', 'rejected', 'proposal'),
      vetoed('und', 'rolled_back', 'undetermined'),
      vetoed('legacy', 'rejected', null),
    ]
    const ids = hypothesisRetries(proposals, 'system_prompt', 'current', '收紧输出约束可减少返工').map((x) => x.proposalId)
    expect(ids).toEqual(expect.arrayContaining(['own', 'und', 'legacy']))
    expect(ids).not.toContain('ext')
  })

  it('进化全史：被否决条目带原因归属；外部环境与未定写明，未分类不写前缀（与引入前逐字一致）', () => {
    const proposals = [
      vetoed('ext', 'rejected', 'external'),
      vetoed('und', 'rolled_back', 'undetermined'),
      vetoed('own', 'rejected', 'proposal'),
      vetoed('legacy', 'rejected', null),
    ]
    const { entries } = proposerEvolutionHistory(proposals, [], 'system_prompt')
    const byId = Object.fromEntries(entries.map((e) => [e.proposalId, e]))
    expect(byId.ext).toMatchObject({ kind: 'rejected', cause: 'external', detail: '裁决驳回［外部环境所致，假设未被证伪］（理由）' })
    expect(byId.und).toMatchObject({ kind: 'rolled_back', cause: 'undetermined', detail: '回滚［原因未定］（理由）' })
    expect(byId.own).toMatchObject({ cause: 'proposal', detail: '裁决驳回（理由）' })
    expect(byId.legacy).toMatchObject({ cause: null, detail: '裁决驳回（理由）' })
  })
})
