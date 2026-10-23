// HarnessPro×Harness 十一坑吸收轮（2026-10-23）守门：帕累托三档选拔 + 前缀缓存
// 警告 + 经验库保鲜。spec: docs/superpowers/specs/2026-10-23-harnesspro-harness-pitfalls-absorption.md
import { describe, it, expect } from 'vitest'
import {
  PARETO_TIER_REFERENCES, paretoReport, paretoReportOf, evaluatePromotion, sha256, diffSummary,
  variantSetDigest, behaviorContrast,
} from '../loop'
import { experienceFreshness, decayedConfidence, CONFIDENCE_BASE, HALF_LIFE_DAYS } from '../experience-freshness'
import type { Experience, Probe, ProbeMetrics, Proposal, Variant } from '../types'

function metrics(over: Partial<ProbeMetrics> = {}): ProbeMetrics {
  return {
    evalRunId: 'run-base', setId: 'set-1', k: 2,
    passAt1: 0.5, passAtK: 0.5, resultPassRate: 0.5, trajectoryPassRate: 0.6, unknownRatio: 0,
    riskVeto: false, judgeOnline: true, statisticallyInsufficient: false,
    tokens: 1000, costUsd: 1, steps: 10, latencyMs: 1000,
    ...over,
  }
}

function variant(id: string, content: string): Variant {
  return { id, label: id, content, digest: sha256(content), diffSummary: diffSummary('base', content) }
}

function proposalOf(variants: Variant[], probes: Probe[], selectedId: string, over: Partial<Proposal> = {}): Proposal {
  const now = new Date().toISOString()
  const base = metrics()
  return {
    id: 'hp-001', title: 't', hypothesis: 'h', surfaceKey: 'system_prompt',
    targetPath: 'profiles/p1/SOUL.md', risk: 'medium', mode: 'parallel', domain: 'general',
    status: 'composed', budgetCapUsd: 5, evidenceRefs: ['task:t1'], experienceIds: [],
    baselineRunId: 'run-base', baseline: base,
    base: { content: 'base', digest: sha256('base'), revision: null, exists: true },
    variants, probes,
    approval: { decision: 'approved', actor: 'r', note: '', variantSetDigest: variantSetDigest(variants), at: now },
    composition: { variantId: selectedId, digest: variants.find((v) => v.id === selectedId)!.digest, rationale: 'x', actor: 'r', at: now },
    promotion: null, rollback: null, createdBy: 'op', createdAt: now, updatedAt: now,
    ...over,
  }
}

function probeFor(p: Proposal, v: Variant, ev: Partial<ProbeMetrics>): Probe {
  const evidence = metrics({
    evalRunId: `run-${v.id}`,
    regression: { runId: 'run-reg', suiteName: '回归样本库', total: 2, failed: 0, failedTaskIds: [] },
    ...ev,
  })
  return {
    id: `pr-${v.id}`, variantId: v.id, status: 'recorded', evidence,
    contrast: behaviorContrast(p.baseline!, evidence),
    createdAt: new Date().toISOString(), recordedAt: new Date().toISOString(),
  }
}

describe('paretoReport：支配淘汰与三档代表', () => {
  it('花钱更多分还更低的候选被支配并如实列出支配者；前沿候选互不支配', () => {
    const r = paretoReport([
      { variantId: 'a', label: 'A', passAt1: 0.8, costUsd: 1.0 },
      { variantId: 'b', label: 'B', passAt1: 0.7, costUsd: 2.0 }, // 被 A 支配（分低且贵）
      { variantId: 'c', label: 'C', passAt1: 0.6, costUsd: 0.5 }, // 更便宜更分低：不与 A 互支配
    ])
    expect(r.eligible).toBe(3)
    const byId = new Map(r.entries.map((e) => [e.variantId, e]))
    expect(byId.get('a')!.onFrontier).toBe(true)
    expect(byId.get('b')!.onFrontier).toBe(false)
    expect(byId.get('b')!.dominatedBy).toEqual(['a'])
    expect(byId.get('c')!.onFrontier).toBe(true)
  })

  it('null 读数不参与判定，列入 excluded（如实缺席不猜）', () => {
    const r = paretoReport([
      { variantId: 'a', label: 'A', passAt1: null, costUsd: 1.0 },
      { variantId: 'b', label: 'B', passAt1: 0.5, costUsd: null },
      { variantId: 'c', label: 'C', passAt1: 0.5, costUsd: 1.0 },
    ])
    expect(r.eligible).toBe(1)
    expect(r.excluded.map((e) => e.variantId).sort()).toEqual(['a', 'b'])
    expect(r.entries[0].onFrontier).toBe(true) // 单点=前沿
  })

  it('三档代表按权重落位：最省→lite、最高分→heavy、均衡点→medium', () => {
    const r = paretoReport([
      { variantId: 'cheap', label: '省钱款', passAt1: 0.55, costUsd: 0.3 },
      { variantId: 'mid', label: '均衡款', passAt1: 0.75, costUsd: 1.0 },
      { variantId: 'beast', label: '性能款', passAt1: 0.95, costUsd: 3.0 },
    ])
    const tierOf = new Map(r.entries.map((e) => [e.tier, e.variantId]))
    expect(tierOf.get('lite')).toBe('cheap')
    expect(tierOf.get('heavy')).toBe('beast')
    expect(tierOf.get('medium')).toBe('mid')
    expect(r.note).toContain('本仓实例化')
  })

  it('三档参考点：lite=最省角、heavy=最高分角、medium=双优点（本仓实例化）', () => {
    expect(PARETO_TIER_REFERENCES.lite).toEqual({ perf: 0, econ: 1 })
    expect(PARETO_TIER_REFERENCES.medium).toEqual({ perf: 1, econ: 1 })
    expect(PARETO_TIER_REFERENCES.heavy).toEqual({ perf: 1, econ: 0 })
  })

  it('paretoReportOf 只收已记录探测，按候选标签带出', () => {
    const v1 = variant('v1', 'aaa')
    const v2 = variant('v2', 'bbb')
    const p = proposalOf([v1, v2], [], 'v1')
    p.probes = [
      probeFor(p, v1, { passAt1: 0.9, costUsd: 0.8 }),
      probeFor(p, v2, { passAt1: 0.9, costUsd: 2.5 }),
      { id: 'pr-fail', variantId: 'v2', status: 'failed', createdAt: new Date().toISOString() },
    ]
    const r = paretoReportOf(p)
    expect(r.eligible).toBe(2)
    expect(r.entries.find((e) => e.variantId === 'v2')!.onFrontier).toBe(false)
  })
})

describe('晋级门禁：pareto_dominated 与 prefix_cache_churn', () => {
  it('选中候选被支配 → blocker pareto_dominated（花钱更多分还更低不进下一代）', () => {
    const v1 = variant('v1', 'aaa')
    const v2 = variant('v2', 'bbb')
    const p = proposalOf([v1, v2], [], 'v2')
    p.probes = [
      probeFor(p, v1, { passAt1: 0.9, costUsd: 0.8 }),
      probeFor(p, v2, { passAt1: 0.7, costUsd: 2.0 }), // v2 被选中但被 v1 支配
    ]
    const report = evaluatePromotion({ proposal: p, currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    const codes = report.blockers.map((b) => b.code)
    expect(codes).toContain('pareto_dominated')
    expect(report.blockers.find((b) => b.code === 'pareto_dominated')!.message).toContain('v1')
  })

  it('选中候选在前沿 → 无 pareto_dominated blocker', () => {
    const v1 = variant('v1', 'aaa')
    const v2 = variant('v2', 'bbb')
    const p = proposalOf([v1, v2], [], 'v1')
    p.probes = [
      probeFor(p, v1, { passAt1: 0.9, costUsd: 0.8 }),
      probeFor(p, v2, { passAt1: 0.7, costUsd: 2.0 }),
    ]
    const report = evaluatePromotion({ proposal: p, currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(report.blockers.map((b) => b.code)).not.toContain('pareto_dominated')
  })

  it('常驻面候选含删除行 → warning prefix_cache_churn；纯追加不触发', () => {
    // SOUL.md（always_on）候选：内容里删掉了 base 的行（removed>0）
    const del = { id: 'v1', label: 'v1', content: '完全不同的内容', digest: sha256('完全不同的内容'), diffSummary: { added: 2, removed: 3, unchanged: 0 } }
    const p1 = proposalOf([del as Variant], [], 'v1')
    p1.probes = [probeFor(p1, del as Variant, { passAt1: 0.9, costUsd: 0.8 })]
    const r1 = evaluatePromotion({ proposal: p1, currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(r1.warnings.map((w) => w.code)).toContain('prefix_cache_churn')

    const add = { id: 'v1', label: 'v1', content: '追加内容', digest: sha256('追加内容'), diffSummary: { added: 2, removed: 0, unchanged: 5 } }
    const p2 = proposalOf([add as Variant], [], 'v1')
    p2.probes = [probeFor(p2, add as Variant, { passAt1: 0.9, costUsd: 0.8 })]
    const r2 = evaluatePromotion({ proposal: p2, currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(r2.warnings.map((w) => w.code)).not.toContain('prefix_cache_churn')
  })

  it('非常驻面改动不触发缓存警告（启发式只看 always_on 文件）', () => {
    const v1 = { id: 'v1', label: 'v1', content: 'x', digest: sha256('x'), diffSummary: { added: 1, removed: 9, unchanged: 0 } }
    const p = proposalOf([v1 as Variant], [], 'v1', { targetPath: 'skills/foo/SKILL.md' })
    p.probes = [probeFor(p, v1 as Variant, { passAt1: 0.9, costUsd: 0.8 })]
    const r = evaluatePromotion({ proposal: p, currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(r.warnings.map((w) => w.code)).not.toContain('prefix_cache_churn')
  })
})

describe('经验库保鲜（HP-7）', () => {
  const now = new Date('2026-10-23T12:00:00Z')

  it('confidence 三档数值化 × 半衰期衰减', () => {
    expect(decayedConfidence(CONFIDENCE_BASE.high, 0)).toBeCloseTo(0.9, 3)
    expect(decayedConfidence(CONFIDENCE_BASE.high, HALF_LIFE_DAYS)).toBeCloseTo(0.45, 3)
    expect(decayedConfidence(CONFIDENCE_BASE.medium, HALF_LIFE_DAYS * 2)).toBeCloseTo(0.15, 3)
  })

  it('fresh/aging/stale 三档与锚点语义（never validated → createdAt 记龄）', () => {
    const fresh: Experience = { id: 'e1', surfaceKey: null, statement: 's', evidenceRefs: [], confidence: 'high', status: 'adopted', createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z' }
    const f = experienceFreshness(fresh, now)
    expect(f.band).toBe('fresh')
    expect(f.anchor).toBe('createdAt')

    const stale: Experience = { ...fresh, id: 'e2', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
    const s = experienceFreshness(stale, now)
    expect(s.band).toBe('stale')
    expect(s.confidenceScore).toBeLessThan(0.25)

    const revalidated: Experience = { ...stale, id: 'e3', lastValidatedAt: '2026-10-23T00:00:00Z' }
    const rv = experienceFreshness(revalidated, now)
    expect(rv.band).toBe('fresh')
    expect(rv.anchor).toBe('lastValidatedAt')
    expect(rv.confidenceScore).toBeGreaterThan(s.confidenceScore)
  })

  it('aging 带：30-90 天之间', () => {
    const e: Experience = { id: 'e4', surfaceKey: null, statement: 's', evidenceRefs: [], confidence: 'medium', status: 'adopted', createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z' }
    expect(experienceFreshness(e, now).band).toBe('aging')
  })
})
