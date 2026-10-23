// 改进闭环纯函数守门：摘要/行为对比/晋级门禁十类阻塞 + RRSI 正则化（2026-10-23）。
import { describe, it, expect } from 'vitest'
import {
  annealedEditBudget, behaviorContrast, candidateDiversity, diffSummary, editCountOfVariant,
  evaluatePromotion, evolutionReport, findBenchmarkLeakage, findGraderMarkers,
  findGraderMarkersInPath, hypothesisRetries, hypothesisSimilarity, leakageBlockers,
  maxEditCount, pruneSignal, rsiConfig, sha256, stallDetection, submitReadiness,
  surfaceRound, variantSetDigest,
} from '../loop'
import type { Champion, Probe, ProbeMetrics, Proposal, ProposalStatus, RegularizationDerived, SurfaceKey, Variant } from '../types'

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

// ---------- RRSI 正则化（2026-10-23 吸收轮） ----------


function reg(over: Partial<RegularizationDerived> = {}): RegularizationDerived {
  return {
    round: 0,
    horizon: 20,
    editBudget: 4,
    maxEditCount: 1,
    editBudgetExceeded: false,
    noiseDelta: null,
    noiseRuns: 0,
    stalled: false,
    stallWindow: 3,
    firstOnSurface: false,
    hypothesisRetry: [],
    ...over,
  }
}

function champ(surfaceKey: SurfaceKey, proposalId: string, at: string, rolledBack = false): Champion {
  return {
    id: `ch-${proposalId}`,
    surfaceKey,
    proposalId,
    variantId: 'v1',
    digest: 'd',
    label: 'l',
    previousDigest: null,
    previousProposalId: null,
    targetPath: null,
    applied: false,
    promotedAt: at,
    promotedBy: 'op',
    ...(rolledBack ? { rolledBack: true } : {}),
  }
}

describe('RSI 退火编辑预算（P1）', () => {
  it('t=0 给满 b_max，t≥T 收到 b_min，单调不增', () => {
    const cfg = rsiConfig()
    expect(annealedEditBudget(0, cfg)).toBe(cfg.bMax)
    expect(annealedEditBudget(cfg.horizon, cfg)).toBe(cfg.bMin)
    expect(annealedEditBudget(cfg.horizon + 5, cfg)).toBe(cfg.bMin)
    let prev = Infinity
    for (let t = 0; t <= cfg.horizon; t += 1) {
      const b = annealedEditBudget(t, cfg)
      expect(b).toBeLessThanOrEqual(prev)
      expect(b).toBeGreaterThanOrEqual(cfg.bMin)
      prev = b
    }
  })

  it('单文件=1；树候选=文件数+删除数；取候选最大值', () => {
    expect(editCountOfVariant(variant('v1', 'x'))).toBe(1)
    expect(editCountOfVariant({
      id: 'v2', label: 'v2', content: '', digest: 'd',
      diffSummary: { added: 0, removed: 0, unchanged: 0 },
      files: [
        { path: 'a.md', content: 'a', digest: 'da' },
        { path: 'b.md', content: 'b', digest: 'db' },
      ],
      deletions: ['old.py'],
    })).toBe(3)
    expect(maxEditCount([variant('v1', 'x')])).toBe(1)
    expect(maxEditCount([])).toBeNull()
  })

  it('轮次=未回滚冠军数（回滚=这轮没发生）', () => {
    const champs = [
      champ('system_prompt', 'hw-1', '2026-10-01T00:00:00Z'),
      champ('system_prompt', 'hw-2', '2026-10-02T00:00:00Z', true),
      champ('skills', 'hw-3', '2026-10-03T00:00:00Z'),
    ]
    expect(surfaceRound(champs, 'system_prompt')).toBe(1)
    expect(surfaceRound(champs, 'skills')).toBe(1)
    expect(surfaceRound(champs, 'memory')).toBe(0)
  })
})

describe('泄漏批评者（S1）', () => {
  const set = {
    id: 'set-1',
    tasks: [
      {
        id: 'task-abc-001',
        problem: '把发票 PDF 按金额排序并生成汇总表',
        expectedBehavior: '输出按金额升序的汇总表格',
        rubric: [{ text: '汇总表是否按金额升序排列' }],
      },
      { id: 't1', problem: '短', expectedBehavior: '短', rubric: [] },
    ],
  }

  it('任务 ID / 题干 / 参照答案 / 断言原文命中即报泄漏', () => {
    const byTaskId = findBenchmarkLeakage([{ where: '候选 1', content: '先查 task-abc-001 再回答' }], set)
    expect(byTaskId.map((f) => f.kind)).toContain('task_id')
    const byProblem = findBenchmarkLeakage([{ where: '候选 1', content: '任务要求：把发票 PDF 按金额排序并生成汇总表' }], set)
    expect(byProblem.map((f) => f.kind)).toContain('problem')
    const byRef = findBenchmarkLeakage([{ where: '候选 1', content: '目标是输出按金额升序的汇总表格' }], set)
    expect(byRef.map((f) => f.kind)).toContain('reference')
    const byAssertion = findBenchmarkLeakage([{ where: '候选 1', content: '自检：汇总表是否按金额升序排列' }], set)
    expect(byAssertion.map((f) => f.kind)).toContain('assertion_text')
  })

  it('泛化内容不命中；过短 id/文本不参与扫描；空集安全', () => {
    expect(findBenchmarkLeakage([{ where: '候选 1', content: '输出前先自检格式与排序要求' }], set)).toEqual([])
    expect(findBenchmarkLeakage([{ where: '候选 1', content: '先查 t1 再回答' }], set)).toEqual([])
    expect(findBenchmarkLeakage([{ where: '候选 1', content: '任何内容' }], null)).toEqual([])
  })

  it('blocker 文案携带命中位置与截断内容', () => {
    const findings = findBenchmarkLeakage([{ where: '候选 1', content: '参见 task-abc-001' }], set)
    const blockers = leakageBlockers(findings)
    expect(blockers[0].code).toBe('benchmark_leakage')
    expect(blockers[0].message).toContain('候选 1')
    expect(blockers[0].message).toContain('benchmark 特化')
  })
})

describe('失败假设不复提（P2）', () => {
  function proposalWith(status: ProposalStatus, hypothesis: string, surfaceKey: SurfaceKey = 'system_prompt'): Proposal {
    const p = fixture()
    p.id = `hw-${Math.random().toString(36).slice(2, 8)}`
    p.status = status
    p.hypothesis = hypothesis
    p.surfaceKey = surfaceKey
    return p
  }

  it('中文 bigram 相似度：同义重写高于阈值，无关低于阈值', () => {
    const a = '收紧输出约束可以减少返工次数'
    const b = '收紧输出约束，减少返工'
    const c = '为技能加载增加缓存'
    expect(hypothesisSimilarity(a, b)).toBeGreaterThan(0.5)
    expect(hypothesisSimilarity(a, c)).toBeLessThan(0.2)
    expect(hypothesisSimilarity(a, a)).toBe(1)
  })

  it('同面 rejected/rolled_back 相似假设报出；promoted/他面不报', () => {
    const current = proposalWith('draft', '收紧输出约束可以减少返工次数')
    const rejected = proposalWith('rejected', '收紧输出约束，减少返工')
    const rolled = proposalWith('rolled_back', '收紧输出约束，减少返工')
    const promoted = proposalWith('promoted', '收紧输出约束，减少返工')
    const otherSurface = proposalWith('rejected', '收紧输出约束，减少返工', 'skills')
    const retries = hypothesisRetries([rejected, rolled, promoted, otherSurface], 'system_prompt', current.id, current.hypothesis)
    expect(retries.map((r) => r.proposalId)).toEqual([rejected.id, rolled.id])
    expect(retries[0].similarity).toBeGreaterThan(0.5)
  })
})

describe('停滞探测（P3）与剪枝信号（S4）', () => {
  it('最近 w 个提案均未采纳 → 停滞；窗口内有采纳 → 不停滞；样本不足不停滞', () => {
    const a = fixture(); a.status = 'rejected'; a.createdAt = '2026-10-01T00:00:00Z'
    const b = fixture(); b.status = 'rejected'; b.createdAt = '2026-10-02T00:00:00Z'
    const c = fixture(); c.status = 'rejected'; c.createdAt = '2026-10-03T00:00:00Z'
    expect(stallDetection([a, b, c], 3)).toBe(true)
    expect(stallDetection([a, b], 3)).toBe(false)
    c.status = 'promoted'
    expect(stallDetection([a, b, c], 3)).toBe(false)
  })

  it('窗口内全部探测最大增量 ≤0 → 建议剪枝；无实测数据不建议', () => {
    const a = fixture(); a.createdAt = '2026-10-01T00:00:00Z'
    a.probes = [recordedProbe(a, 'v1', { passAt1: 0.49 })]
    expect(pruneSignal([a], 4)).toBe(true)
    a.probes = [recordedProbe(a, 'v1', { passAt1: 0.55 })]
    expect(pruneSignal([a], 4)).toBe(false)
    const noData = fixture(); noData.createdAt = '2026-10-01T00:00:00Z'; noData.probes = []
    expect(pruneSignal([noData], 4)).toBe(false)
  })
})

describe('进化报告（evolutionReport）', () => {
  it('时间线按冠军链串轮次并关联证据；回滚标记；未探索面列出', () => {
    const p1 = fixture()
    p1.id = 'hw-001'; p1.status = 'promoted'; p1.createdAt = '2026-10-01T00:00:00Z'
    p1.noise = { runIds: ['r1', 'r2'], setId: 'set-1', delta: 0.02, method: 'half-range', samples: [0.5, 0.54], computedAt: '2026-10-01T01:00:00Z' }
    const p2 = fixture()
    p2.id = 'hw-002'; p2.status = 'rolled_back'; p2.createdAt = '2026-10-02T00:00:00Z'
    const champions = [champ('system_prompt', 'hw-001', '2026-10-01T02:00:00Z'), champ('system_prompt', 'hw-002', '2026-10-02T02:00:00Z', true)]
    const report = evolutionReport(['system_prompt', 'skills', 'memory'], [p1, p2], champions)
    expect(report.surfaces.map((s) => s.surfaceKey)).toEqual(['system_prompt'])
    const surf = report.surfaces[0]
    expect(surf.rounds).toBe(1)
    expect(surf.timeline).toHaveLength(2)
    expect(surf.timeline[0].passAt1).toBeCloseTo(0.8)
    expect(surf.timeline[0].noiseDelta).toBeCloseTo(0.02)
    expect(surf.timeline[0].passAt1Delta).toBeCloseTo(0.3)
    expect(surf.timeline[1].rolledBack).toBe(true)
    expect(surf.promoted).toBe(1)
    expect(surf.rolledBack).toBe(1)
    expect(report.unexercised).toEqual(['skills', 'memory'])
    expect(report.config.horizon).toBe(rsiConfig().horizon)
  })
})

describe('晋级门 RRSI 新闸（S1/S2/S3 + P1）', () => {
  const base = () => ({ proposal: fixture(), currentChampion: null as Champion | null, applyRequested: false, applyEnvEnabled: false })

  it('未标定噪声带 → warning noise_uncalibrated', () => {
    const report = evaluatePromotion({ ...base(), regularization: reg() })
    expect(report.warnings.map((w) => w.code)).toContain('noise_uncalibrated')
    expect(report.blockers.map((b) => b.code)).not.toContain('noise_uncalibrated')
  })

  it('增益落在噪声带内 → blocker gain_within_noise；该面首个提案降为 exploratory warning', () => {
    const p = fixture()
    p.probes = [recordedProbe(p, 'v1', { passAt1: 0.505 })]
    const blocked = evaluatePromotion({ proposal: p, currentChampion: null, applyRequested: false, applyEnvEnabled: false, regularization: reg({ noiseDelta: 0.02 }) })
    expect(blocked.blockers.map((b) => b.code)).toContain('gain_within_noise')
    const exploratory = evaluatePromotion({
      proposal: p, currentChampion: null, applyRequested: false, applyEnvEnabled: false,
      regularization: reg({ noiseDelta: 0.02, firstOnSurface: true }),
    })
    expect(exploratory.blockers.map((b) => b.code)).not.toContain('gain_within_noise')
    expect(exploratory.warnings.map((w) => w.code)).toContain('exploratory_within_noise')
  })

  it('超带增益 + token 增长超配额 → blocker cost_unjustified；配额内放行', () => {
    const over = fixture()
    over.probes = [recordedProbe(over, 'v1', { passAt1: 0.52, tokens: 2000, costUsd: 2 })]
    const blocked = evaluatePromotion({ proposal: over, currentChampion: null, applyRequested: false, applyEnvEnabled: false, regularization: reg({ noiseDelta: 0.01 }) })
    expect(blocked.blockers.map((b) => b.code)).toContain('cost_unjustified')
    const within = fixture()
    within.probes = [recordedProbe(within, 'v1', { passAt1: 0.52, tokens: 1100, costUsd: 1.1 })]
    const ok = evaluatePromotion({ proposal: within, currentChampion: null, applyRequested: false, applyEnvEnabled: false, regularization: reg({ noiseDelta: 0.01 }) })
    expect(ok.blockers.map((b) => b.code)).not.toContain('cost_unjustified')
  })

  it('泄漏发现 → blocker benchmark_leakage；预算超限 → blocker edit_budget_exceeded；停滞 → warning', () => {
    const report = evaluatePromotion({
      ...base(),
      regularization: reg({ editBudget: 1, maxEditCount: 3, editBudgetExceeded: true, stalled: true, stallWindow: 3 }),
      leakage: [{ code: 'benchmark_leakage', message: '候选携带评测任务 ID' }],
    })
    expect(report.blockers.map((b) => b.code)).toContain('benchmark_leakage')
    expect(report.blockers.map((b) => b.code)).toContain('edit_budget_exceeded')
    expect(report.warnings.map((w) => w.code)).toContain('surface_stalled')
  })

  it('基线闸对照：无 regularization 输入时行为与旧门一致（不新增 blocker）', () => {
    const report = evaluatePromotion(base())
    for (const code of ['benchmark_leakage', 'edit_budget_exceeded', 'gain_within_noise', 'cost_unjustified', 'noise_missing']) {
      expect(report.blockers.map((b) => b.code)).not.toContain(code)
    }
  })
})
