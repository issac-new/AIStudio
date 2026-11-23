// RSI 数学诊断守门（2026-11-23 吸收轮）：期望最大值、选择偏差、收缩衰减、代理-真实背离。
// 全部为纯函数与只读集成的边界断言——诊断不得影响任何 ok/blockers 判定。
import { describe, it, expect } from 'vitest'
import {
  buildTheoryReport,
  decayAudit,
  expectedMaxZ,
  normalCdf,
  proxyDivergence,
  selectionBiasAudit,
} from '../loop-theory'
import { behaviorContrast, diffSummary, evaluatePromotion, evolutionReport, sha256, variantSetDigest } from '../loop'
import type { Champion, Probe, ProbeMetrics, Proposal, Variant } from '../types'

function metrics(over: Partial<ProbeMetrics> = {}): ProbeMetrics {
  return {
    evalRunId: 'run-base',
    setId: 'set-1',
    k: 3,
    passAt1: 0.5,
    passAtK: 0.5,
    resultPassRate: 0.5,
    trajectoryPassRate: 0.6,
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

function variant(id: string, content: string): Variant {
  return { id, label: id, content, digest: sha256(content), diffSummary: diffSummary('base', content) }
}

function recordedProbe(variantId: string, over: Partial<ProbeMetrics> = {}): Probe {
  const base = metrics()
  const evidence = metrics({ evalRunId: `run-${variantId}`, ...over })
  return {
    id: `pr-${variantId}`,
    variantId,
    status: 'recorded',
    evidence,
    contrast: behaviorContrast(base, evidence),
    createdAt: '2026-11-01T00:00:00Z',
    recordedAt: '2026-11-01T00:00:00Z',
  }
}

function fixtureProposal(over: Partial<Proposal> = {}): Proposal {
  const variants = [variant('v1', 'candidate one'), variant('v2', 'candidate two'), variant('v3', 'candidate three')]
  return {
    id: 'hw-001',
    title: '提示词收紧',
    hypothesis: '收紧输出约束可减少返工',
    surfaceKey: 'system_prompt',
    targetPath: 'profiles/p1/SOUL.md',
    risk: 'medium',
    mode: 'parallel',
    domain: 'general',
    status: 'composed',
    budgetCapUsd: 5,
    evidenceRefs: ['task:t1'],
    experienceIds: [],
    baselineRunId: 'run-base',
    baseline: metrics(),
    base: { content: 'base', digest: sha256('base'), revision: null, exists: true },
    variants,
    probes: [],
    approval: {
      decision: 'approved',
      actor: 'reviewer',
      note: '',
      variantSetDigest: variantSetDigest(variants),
      at: '2026-11-01T00:00:00Z',
    },
    composition: { variantId: 'v1', digest: variants[0].digest, rationale: '通过率提升', actor: 'reviewer', at: '2026-11-01T00:00:00Z' },
    promotion: null,
    rollback: null,
    createdBy: 'operator',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...over,
  }
}

function champion(proposalId: string, surfaceKey: Champion['surfaceKey'], at: string, variantId = 'v1'): Champion {
  return {
    id: `ch-${proposalId}`,
    surfaceKey,
    proposalId,
    variantId,
    digest: sha256(`${proposalId}-${variantId}`),
    label: `champ-${proposalId}`,
    previousDigest: null,
    previousProposalId: null,
    targetPath: null,
    applied: true,
    promotedAt: at,
    promotedBy: 'reviewer',
  }
}

describe('期望最大值 E[max Z_k]（选择偏差的系数）', () => {
  it('k=1 为 0；k=2 等于解析值 1/√π；随 k 单调增', () => {
    expect(expectedMaxZ(1)).toBe(0)
    expect(expectedMaxZ(2)).toBeCloseTo(1 / Math.sqrt(Math.PI), 3)
    const values = [2, 3, 4, 5, 10].map((k) => expectedMaxZ(k))
    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeGreaterThan(values[i - 1])
    expect(values[4]).toBeGreaterThan(1.5)
    expect(values[4]).toBeLessThan(1.6)
  })

  it('正态 CDF 端点正确', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(-8)).toBeLessThan(1e-10)
    expect(normalCdf(8)).toBeCloseTo(1, 6)
  })
})

describe('选择偏差审计（原文 §4.1）', () => {
  it('空池与单候选：不编造缺口', () => {
    expect(selectionBiasAudit({ scores: [null, undefined] })).toMatchObject({ poolSize: 0, verdict: 'insufficient', gap: null })
    expect(selectionBiasAudit({ scores: [0.7] })).toMatchObject({ poolSize: 1, verdict: 'single_candidate', gap: null, realizedGap: null })
  })

  it('最优-次优间隔落在噪声带内 → top2_within_noise；超过 → robust', () => {
    expect(selectionBiasAudit({ scores: [0.7, 0.699], noiseDelta: 0.02 }).verdict).toBe('top2_within_noise')
    expect(selectionBiasAudit({ scores: [0.7, 0.6], noiseDelta: 0.02 }).verdict).toBe('robust')
  })

  it('显式 σ 时算期望乐观值；间隔被乐观值淹没 → selection_dominated', () => {
    const audit = selectionBiasAudit({ scores: [0.7, 0.699], sigma: 0.05 })
    expect(audit.expectedOptimismZ).toBeCloseTo(expectedMaxZ(2), 6)
    expect(audit.expectedOptimism).toBeCloseTo(0.05 * expectedMaxZ(2), 6)
    expect(audit.adjustedBest).toBeCloseTo(0.7 - 0.05 * expectedMaxZ(2), 6)
    expect(audit.verdict).toBe('selection_dominated')
    expect(selectionBiasAudit({ scores: [0.7, 0.6], sigma: 0.01 }).verdict).toBe('robust')
  })

  it('留出读数三态：确认 / 噪声内 / 缺口', () => {
    expect(selectionBiasAudit({ scores: [0.7, 0.6], heldoutPassRate: 0.72 })).toMatchObject({ verdict: 'heldout_confirms', realizedGap: -0.02 })
    expect(selectionBiasAudit({ scores: [0.7, 0.6], heldoutPassRate: 0.69, noiseDelta: 0.02 }).verdict).toBe('heldout_within_noise')
    const gap = selectionBiasAudit({ scores: [0.7, 0.6], heldoutPassRate: 0.55, noiseDelta: 0.02 })
    expect(gap.verdict).toBe('heldout_gap')
    expect(gap.realizedGap).toBeCloseTo(0.15, 6)
    expect(gap.note).toContain('分布迁移')
  })
})

describe('收缩衰减（原文 §1.3）', () => {
  it('正增益少于 3 轮：样本不足，不给 γ', () => {
    const audit = decayAudit([
      { round: 1, delta: 0.05 },
      { round: 2, delta: 0.04 },
    ])
    expect(audit).toMatchObject({ rounds: 2, gamma: null, classification: 'insufficient', ceiling: 'unknown' })
  })

  it('几何衰减：γ̂ 与下一轮增益可算，噪声带内判到顶', () => {
    const audit = decayAudit([
      { round: 1, delta: 0.09 },
      { round: 2, delta: 0.03 },
      { round: 3, delta: 0.01, noiseDelta: 0.02 },
    ])
    expect(audit.gamma).toBeCloseTo(1 / 3, 2)
    expect(audit.r2).toBeCloseTo(1, 2)
    expect(audit.classification).toBe('geometric_decay')
    expect(audit.predictedNextGain).toBeCloseTo(1 / 300, 3)
    expect(audit.ceiling).toBe('reached')
    expect(audit.note).toContain('元改进')
  })

  it('不衰减（恒定增益）：γ̂≈1，分类 no_decay；噪声带缺省时到顶留空', () => {
    const audit = decayAudit([
      { round: 1, delta: 0.05 },
      { round: 2, delta: 0.05 },
      { round: 3, delta: 0.05 },
    ])
    expect(audit.gamma).toBeCloseTo(1, 6)
    expect(audit.classification).toBe('no_decay')
    expect(audit.ceiling).toBe('unknown')
  })

  it('非正增益轮剔除并计数（混入会压低 γ、误判到顶）', () => {
    const audit = decayAudit([
      { round: 1, delta: 0.09 },
      { round: 2, delta: -0.01 },
      { round: 3, delta: 0.03 },
      { round: 4, delta: 0 },
      { round: 5, delta: 0.01 },
    ])
    expect(audit.rounds).toBe(3)
    expect(audit.excludedNonPositive).toBe(2)
    expect(audit.classification).toBe('geometric_decay')
  })
})

describe('代理-真实背离（原文 §4.2）', () => {
  it('少于 2 轮双读数：样本不足', () => {
    expect(proxyDivergence([{ proxyDelta: 0.05, realizedDelta: null }]).verdict).toBe('insufficient')
  })

  it('连续两轮代理涨、真实跌 → diverging；单轮 → watch；同向 → none', () => {
    expect(
      proxyDivergence([
        { proxyDelta: 0.05, realizedDelta: -0.01 },
        { proxyDelta: 0.03, realizedDelta: -0.02 },
      ]),
    ).toMatchObject({ verdict: 'diverging', streak: 2, divergingRounds: 2 })
    expect(
      proxyDivergence([
        { proxyDelta: 0.05, realizedDelta: 0.01 },
        { proxyDelta: 0.03, realizedDelta: -0.02 },
      ]),
    ).toMatchObject({ verdict: 'watch', streak: 1 })
    expect(
      proxyDivergence([
        { proxyDelta: 0.05, realizedDelta: 0.01 },
        { proxyDelta: 0.03, realizedDelta: 0.02 },
      ]).verdict,
    ).toBe('none')
  })
})

describe('集成：晋级报告与进化报告（只读，不改 ok/blockers）', () => {
  it('晋级报告带选择偏差读数，且不改变 ok/blockers 语义', () => {
    const proposal = fixtureProposal({
      probes: [recordedProbe('v1', { passAt1: 0.7 }), recordedProbe('v2', { passAt1: 0.6 }), recordedProbe('v3', { passAt1: 0.55 })],
      noise: { runIds: ['a', 'b'], setId: 'set-1', delta: 0.02, method: 'half-range', samples: [0.5, 0.52], computedAt: 'now' },
    })
    const report = evaluatePromotion({ proposal })
    expect(report.selectionBias).toBeDefined()
    expect(report.selectionBias?.poolSize).toBe(3)
    expect(report.selectionBias?.verdict).toBe('robust')
    // 诊断字段不参与判定：同样输入的 ok 只由既有门决定（这里断言类型不被劫持）
    expect(typeof report.ok).toBe('boolean')
    expect(report.blockers.every((b) => typeof b.code === 'string')).toBe(true)
  })

  it('进化报告装配各面衰减、代理背离与多候选审计', () => {
    const rounds = [
      { id: 'hw-001', delta: 0.09, at: '2026-11-01T00:00:00Z', heldout: 0.49 },
      { id: 'hw-002', delta: 0.03, at: '2026-11-02T00:00:00Z', heldout: 0.49 },
      { id: 'hw-003', delta: 0.01, at: '2026-11-03T00:00:00Z', heldout: 0.48 },
    ]
    const proposals = rounds.map((r) =>
      fixtureProposal({
        id: r.id,
        status: 'promoted',
        updatedAt: r.at,
        probes: [
          recordedProbe('v1', { passAt1: 0.5 + r.delta, heldoutBaselinePassRate: 0.5 }),
          recordedProbe('v2', { passAt1: 0.5 }),
          recordedProbe('v3', { passAt1: 0.48 }),
        ],
        heldout: { runId: `heldout-${r.id}`, n: 40, passRate: r.heldout },
      }),
    )
    const champions = rounds.map((r) => champion(r.id, 'system_prompt', r.at))
    const report = evolutionReport(['system_prompt'], proposals, champions)
    expect(report.theory).toBeDefined()
    const surface = report.theory?.surfaces.find((s) => s.surfaceKey === 'system_prompt')
    expect(surface?.decay.classification).toBe('geometric_decay')
    expect(surface?.decay.rounds).toBe(3)
    expect(report.theory?.proxyDivergence.verdict).toBe('diverging')
    expect(report.theory?.selectionBias).toHaveLength(3)
    expect(report.theory?.note).toContain('不参与 ok/blockers')
  })

  it('同一提案跨评测集不混用：只取众数集合的读数', () => {
    const proposal = fixtureProposal({
      probes: [
        recordedProbe('v1', { passAt1: 0.7, setId: 'set-a' }),
        recordedProbe('v2', { passAt1: 0.6, setId: 'set-a' }),
        recordedProbe('v3', { passAt1: 0.55, setId: 'set-a' }),
        recordedProbe('v4', { passAt1: 0.9, setId: 'set-b' }),
        recordedProbe('v5', { passAt1: 0.2, setId: 'set-b' }),
      ],
    })
    const report = buildTheoryReport({ surfaces: [], proposals: [proposal], champions: [] })
    expect(report.selectionBias[0].audit.poolSize).toBe(3)
    expect(report.selectionBias[0].audit.best).toBeCloseTo(0.7, 6)
  })

  it('buildTheoryReport 对空台账不编造数字', () => {
    const report = buildTheoryReport({ surfaces: [], proposals: [], champions: [] })
    expect(report.surfaces).toEqual([])
    expect(report.selectionBias).toEqual([])
    expect(report.proxyDivergence.verdict).toBe('insufficient')
  })
})
