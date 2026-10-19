// 改进闭环纯函数守门：摘要/行为对比/晋级门禁十类阻塞。
import { describe, it, expect } from 'vitest'
import {
  behaviorContrast, candidateDiversity, diffSummary, evaluatePromotion, findGraderMarkers,
  findGraderMarkersInPath, sha256, submitReadiness, variantSetDigest,
} from '../loop'
import type { Probe, ProbeMetrics, Proposal, Variant } from '../types'

function metrics(over: Partial<ProbeMetrics> = {}): ProbeMetrics {
  return {
    evalRunId: 'run-base',
    setId: 'set-1',
    k: 2,
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

function recordedProbe(p: Proposal, variantId: string, over: Partial<ProbeMetrics> = {}): Probe {
  const base = p.baseline ?? metrics()
  const evidence: ProbeMetrics = metrics({
    evalRunId: `run-${variantId}`,
    regression: { runId: 'run-reg', suiteName: '回归样本库', total: 2, failed: 0, failedTaskIds: [] },
    ...over,
  })
  return {
    id: `pr-${variantId}`,
    variantId,
    status: 'recorded',
    evidence,
    contrast: behaviorContrast(base, evidence),
    createdAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
  }
}

function fixture(): Proposal {
  const variants = [variant('v1', 'candidate one'), variant('v2', 'candidate two')]
  const now = new Date().toISOString()
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
      at: now,
    },
    composition: { variantId: 'v1', digest: variants[0].digest, rationale: '通过率提升', actor: 'reviewer', at: now },
    promotion: null,
    rollback: null,
    createdBy: 'operator',
    createdAt: now,
    updatedAt: now,
  }
  p.probes = [recordedProbe(p, 'v1', { passAt1: 0.8, passAtK: 0.8, resultPassRate: 0.8 }), recordedProbe(p, 'v2', { passAt1: 0.7, passAtK: 0.7 })]
  return p
}

describe('diffSummary / digest', () => {
  it('数出增删行且摘要随内容变化', () => {
    const d = diffSummary('a\nb\nc', 'a\nB\nc\nd')
    expect(d.unchanged).toBe(2)
    expect(d.added).toBe(2)
    expect(d.removed).toBe(1)
    expect(variantSetDigest([variant('v1', 'x')])).not.toBe(variantSetDigest([variant('v1', 'y')]))
  })
})

describe('源码级防泄漏与多样性', () => {
  it('评测判词标记按源文清单识别', () => {
    expect(findGraderMarkers('clean content')).toEqual([])
    expect(findGraderMarkers('{"pass_rate": 0.9}')).toContain('"pass_rate"')
    expect(findGraderMarkers('deterministic_eval_summary: ok')).toContain('deterministic_eval_summary')
  })

  it('文件路径/标签命中判词 marker 也拒绝', () => {
    expect(findGraderMarkersInPath('reports/pass_rate.json')).toContain('"pass_rate"')
    expect(findGraderMarkersInPath('clean/SKILL.md')).toEqual([])
  })

  it('逐行 Jaccard：重复候选可见塌缩', () => {
    const a = variant('v1', 'line1\nline2')
    const b = variant('v2', 'line1\nline2')
    const c = variant('v3', 'line1\nline3')
    expect(candidateDiversity([a, b]).nDistinct).toBe(1)
    expect(candidateDiversity([a, b]).meanLineJaccard).toBe(1)
    expect(candidateDiversity([a, c]).meanLineJaccard).toBeCloseTo(1 / 3)
    expect(candidateDiversity([a, c]).nDistinct).toBe(2)
  })
})

describe('behaviorContrast', () => {
  it('结果层提升 → improved；过程层只给差异不给质量结论', () => {
    const c = behaviorContrast(metrics(), metrics({ passAt1: 0.8, tokens: 1200 }))
    expect(c.quality).toBe('improved')
    expect(c.passAt1Delta).toBeCloseTo(0.3)
    expect(c.tokenDeltaPct).toBeCloseTo(0.2)
  })

  it('回归失败/风险否决 → regressed', () => {
    expect(behaviorContrast(metrics(), metrics({ regression: { runId: 'r', suiteName: '回归样本库', total: 3, failed: 1, failedTaskIds: ['x'] } })).quality).toBe('regressed')
    expect(behaviorContrast(metrics(), metrics({ riskVeto: true })).quality).toBe('regressed')
  })

  it('无通过率/判定离线/未知占比过高 → unknown（不猜）', () => {
    expect(behaviorContrast(metrics({ passAt1: null, passAtK: null }), metrics({ passAt1: null, passAtK: null })).quality).toBe('unknown')
    expect(behaviorContrast(metrics(), metrics({ judgeOnline: false })).quality).toBe('unknown')
    expect(behaviorContrast(metrics(), metrics({ unknownRatio: 0.8 })).quality).toBe('unknown')
  })
})

describe('evaluatePromotion', () => {
  it('证据齐备 → 放行', () => {
    const report = evaluatePromotion({ proposal: fixture(), currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(report.ok).toBe(true)
    expect(report.blockers).toEqual([])
  })

  it('未组合/缺批准/批准失效 → 阻塞', () => {
    const p = fixture()
    p.status = 'probing'
    const noApproval = fixture()
    noApproval.approval = null
    const stale = fixture()
    stale.approval = { ...stale.approval!, variantSetDigest: 'stale' }
    const codes = (x: Proposal) => evaluatePromotion({ proposal: x, currentChampion: null, applyRequested: false, applyEnvEnabled: false }).blockers.map((b) => b.code)
    expect(codes(p)).toContain('not_composed')
    expect(codes(noApproval)).toContain('approval_missing')
    expect(codes(stale)).toContain('approval_stale')
  })

  it('选中候选探测不全/质量倒退/质量未知 → 阻塞/警告', () => {
    const incomplete = fixture()
    incomplete.probes = incomplete.probes.filter((pr) => pr.variantId === 'v2')
    const regressed = fixture()
    regressed.probes[0].contrast = behaviorContrast(metrics(), metrics({ passAt1: 0.2 }))
    const unknown = fixture()
    unknown.probes[0].contrast = behaviorContrast(metrics(), metrics({ passAt1: null, passAtK: null }))
    const codes = (x: Proposal) => evaluatePromotion({ proposal: x, currentChampion: null, applyRequested: false, applyEnvEnabled: false }).blockers.map((b) => b.code)
    const warns = (x: Proposal) => evaluatePromotion({ proposal: x, currentChampion: null, applyRequested: false, applyEnvEnabled: false }).warnings.map((w) => w.code)
    expect(codes(incomplete)).toContain('composition_unprobed')
    expect(warns(incomplete)).toContain('probes_incomplete')
    expect(codes(regressed)).toContain('quality_regressed')
    expect(codes(unknown)).not.toContain('quality_unknown')
    const unknownWarn = evaluatePromotion({ proposal: unknown, currentChampion: null, applyRequested: false, applyEnvEnabled: false }).warnings.map((w) => w.code)
    expect(unknownWarn).toContain('quality_unknown')
  })

  it('回归缺失/失败 → 阻塞', () => {
    const missing = fixture()
    delete missing.probes[0].evidence!.regression
    missing.probes[0].contrast = behaviorContrast(metrics(), missing.probes[0].evidence!)
    const failed = fixture()
    failed.probes[0].evidence = { ...failed.probes[0].evidence!, regression: { runId: 'r', suiteName: '回归样本库', total: 4, failed: 2, failedTaskIds: ['a', 'b'] } }
    failed.probes[0].contrast = behaviorContrast(metrics(), failed.probes[0].evidence)
    const codes = (x: Proposal) => evaluatePromotion({ proposal: x, currentChampion: null, applyRequested: false, applyEnvEnabled: false }).blockers.map((b) => b.code)
    expect(codes(missing)).toContain('regression_missing')
    expect(codes(failed)).toContain('quality_regressed')
    expect(codes(failed)).toContain('regression_failed')
  })

  it('选中候选成本缺失/超预算 → 阻塞', () => {
    const missing = fixture()
    missing.probes[0].evidence = { ...missing.probes[0].evidence!, costUsd: null }
    const over = fixture()
    over.budgetCapUsd = 0.5
    const codes = (x: Proposal) => evaluatePromotion({ proposal: x, currentChampion: null, applyRequested: false, applyEnvEnabled: false }).blockers.map((b) => b.code)
    expect(codes(missing)).toContain('cost_missing')
    expect(codes(over)).toContain('budget_exceeded')
  })

  it('单候选并行/候选塌缩 → 警告不阻塞', () => {
    const single = fixture()
    single.variants = [single.variants[0]]
    single.probes = [single.probes[0]]
    single.approval = { ...single.approval!, variantSetDigest: variantSetDigest(single.variants) }
    const one = evaluatePromotion({ proposal: single, currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(one.ok).toBe(true)
    expect(one.warnings.map((w) => w.code)).toContain('parallel_single_candidate')

    const sameA = variant('v1', 'same body')
    const sameB = variant('v2', 'same body')
    const collapse = fixture()
    collapse.variants = [sameA, sameB]
    collapse.probes = [recordedProbe(collapse, 'v1', { passAt1: 0.8 }), recordedProbe(collapse, 'v2', { passAt1: 0.8 })]
    collapse.composition = { variantId: 'v1', digest: sameA.digest, rationale: 'x', actor: 'a', at: 'now' }
    collapse.approval = { ...collapse.approval!, variantSetDigest: variantSetDigest(collapse.variants) }
    const report = evaluatePromotion({ proposal: collapse, currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(report.warnings.map((w) => w.code)).toContain('candidate_collapse')
  })

  it('冠军漂移 → 阻塞', () => {
    const p = fixture()
    const champion = {
      id: 'ch-001', surfaceKey: 'system_prompt' as const, proposalId: 'hw-000', variantId: 'v1',
      digest: 'd', label: 'old', previousDigest: null, previousProposalId: null, targetPath: null,
      applied: false, promotedAt: new Date(Date.now() + 1000).toISOString(), promotedBy: 'x',
    }
    const report = evaluatePromotion({ proposal: p, currentChampion: champion, applyRequested: false, applyEnvEnabled: false })
    expect(report.blockers.map((b) => b.code)).toContain('champion_drift')
  })

  it('写盘路径：环境未开/建议面/目标漂移 → 阻塞', () => {
    const base = evaluatePromotion({ proposal: fixture(), currentChampion: null, applyRequested: true, applyEnvEnabled: false })
    expect(base.blockers.map((b) => b.code)).toContain('apply_env_disabled')

    const advisory = fixture()
    advisory.surfaceKey = 'guardrails'
    const adv = evaluatePromotion({ proposal: advisory, currentChampion: null, applyRequested: true, applyEnvEnabled: true })
    expect(adv.blockers.map((b) => b.code)).toContain('surface_not_managed')

    const drift = evaluatePromotion({
      proposal: fixture(), currentChampion: null, applyRequested: true, applyEnvEnabled: true,
      targetDigestNow: 'changed', targetExists: true,
    })
    expect(drift.blockers.map((b) => b.code)).toContain('target_drift')
  })
})

describe('submitReadiness', () => {
  it('缺标题/假设/证据/基线 → 逐条报', () => {
    const p = fixture()
    p.status = 'draft'
    p.title = ''
    p.hypothesis = ''
    p.evidenceRefs = []
    p.baseline = null
    const codes = submitReadiness(p).map((b) => b.code)
    expect(codes).toEqual(expect.arrayContaining(['title_missing', 'hypothesis_missing', 'evidence_missing', 'baseline_missing']))
  })
})
