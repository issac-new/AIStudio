// 证据角色披露（2026-11-20 综述吸收轮 B）：候选筛选消耗测试独立性的可观测面。
// 只披露不拦截——evidenceRoles 不参与 ok/blockers/warnings 判定。
import { describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import { evaluatePromotion, evidenceRoleLines } from '../loop-report'
import type { Probe, ProbeMetrics, Proposal, Variant } from '../types'
import { diffSummary, variantSetDigest } from '../loop-core'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

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

function recordedProbe(variantId: string, over: Partial<ProbeMetrics> = {}): Probe {
  return {
    id: `pr-${variantId}`,
    variantId,
    status: 'recorded',
    evidence: metrics({ evalRunId: `run-${variantId}`, ...over }),
    contrast: undefined,
    createdAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
  } as unknown as Probe
}

function fixture(over: Partial<Proposal> = {}): Proposal {
  const variants = [variant('v1', 'candidate one')]
  const now = new Date().toISOString()
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
    probes: [recordedProbe('v1', { passAt1: 0.8 })],
    approval: { decision: 'approved', actor: 'reviewer', note: '', variantSetDigest: variantSetDigest(variants), at: now },
    composition: { variantId: 'v1', digest: variants[0].digest, rationale: '通过率提升', actor: 'reviewer', at: now },
    promotion: null,
    rollback: null,
    createdBy: 'operator',
    createdAt: now,
    updatedAt: now,
    ...over,
  }
}

describe('evidenceRoleLines 纯函数', () => {
  it('heldout 在场→披露行明说「已参与候选接受，不再构成完全独立的最终测试」', () => {
    const p = fixture({ heldout: { runId: 'run-hd', n: 20, passRate: 0.75 } })
    const lines = evidenceRoleLines({ proposal: p, probe: p.probes[0], noiseDelta: 0.02 })
    const hd = lines.find((l) => l.evidence === 'heldout')
    expect(hd).toBeDefined()
    expect(hd!.roles).toEqual(['candidate_selection'])
    expect(hd!.note).toContain('不再构成完全独立的最终测试')
  })

  it('heldout 缺席→不出 heldout 披露行（缺证据的证据不立账）', () => {
    const p = fixture()
    const lines = evidenceRoleLines({ proposal: p, probe: p.probes[0], noiseDelta: null })
    expect(lines.find((l) => l.evidence === 'heldout')).toBeUndefined()
  })

  it('等预算基线与反事实读数在场→各得一行，角色为 candidate_selection', () => {
    const p = fixture()
    const probe = recordedProbe('v1', {
      equalBudgetBaseline: { runId: 'run-eq', n: 20, passAt1: 0.55 },
      counterfactual: { runId: 'run-cf', n: 20, passAt1: 0.74, collapsed: false },
    })
    const lines = evidenceRoleLines({ proposal: p, probe, noiseDelta: null })
    expect(lines.find((l) => l.evidence === 'equal_budget_baseline')).toBeDefined()
    expect(lines.find((l) => l.evidence === 'counterfactual')).toBeDefined()
  })

  it('恒有 final 行：独立最终验证在环外（烧机/全量/推演轮），不随晋级消耗', () => {
    const p = fixture()
    const lines = evidenceRoleLines({ proposal: p, probe: null, noiseDelta: null })
    const fin = lines.find((l) => l.evidence === 'final')
    expect(fin).toBeDefined()
    expect(fin!.roles).toEqual(['final_judgement'])
    expect(fin!.note).toContain('环外')
  })

  it('evolve_probe 行恒在（探测读数参与接受）', () => {
    const lines = evidenceRoleLines({ proposal: fixture(), probe: null, noiseDelta: null })
    expect(lines.find((l) => l.evidence === 'evolve_probe')).toBeDefined()
  })
})

describe('evaluatePromotion 挂披露（不改变判定）', () => {
  it('evidenceRoles 字段在场且不影响 ok/blockers/warnings', () => {
    const p = fixture({ heldout: { runId: 'run-hd', n: 20, passRate: 0.75 } })
    const withRoles = evaluatePromotion({ proposal: p, currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(withRoles.evidenceRoles).toBeDefined()
    expect(withRoles.evidenceRoles!.length).toBeGreaterThan(0)
    // 同一提案去掉 heldout 后 blockers/warnings 数量不因披露而增减（披露不是门）
    const noHd = evaluatePromotion({ proposal: fixture(), currentChampion: null, applyRequested: false, applyEnvEnabled: false })
    expect(noHd.blockers.length).toBe(withRoles.blockers.length)
    expect(noHd.warnings.length).toBe(withRoles.warnings.length)
  })
})
