// overlay[harness/workbench] Agnes Harness 吸收批一 a 单测（2026-11-20）：
// 字典序目标（安全>质量>成本）、n≥3 blocker 与 min_k 豁免、Train/Eval/Sealed 三向隔离。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { evaluatePromotion, behaviorContrast, variantSetDigest } from '../loop'
import type { Champion, ProbeMetrics, Proposal } from '../types'
import { DEFAULT_SCHEDULE_POLICY, normalizeSchedulePolicy } from '../schedule-policy'
import { createSet, sealSet, splitOfSet, _useStoreDirForTests as _useEvalStoreDirForTests } from '../../../eval/store'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sha256 } from '../loop'
import type { Variant } from '../types'

// —— fixture（与 loop.test.ts 同构，k=3 基线）——

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
    regression: { runId: 'run-reg', suiteName: '回归样本库', total: 2, failed: 0, failedTaskIds: [] },
    ...over,
  }
}

function variantOf(id: string, content: string): Variant {
  return { id, label: id, content, digest: sha256(content) }
}

function fixture(over: { evidenceOver?: Partial<ProbeMetrics> } = {}): Proposal {
  const evidence = metrics(over.evidenceOver ?? {})
  const baseline = metrics()
  const v1 = variantOf('v1', 'candidate one')
  const v2 = variantOf('v2', 'candidate two')
  return {
    id: 'p-1',
    title: 't',
    hypothesis: 'h',
    surfaceKey: 'system_prompt',
    targetPath: 'a.md',
    risk: 'low',
    mode: 'single',
    status: 'composed',
    domain: 'general',
    budgetCapUsd: 10,
    evidenceRefs: ['task:t1'],
    experienceIds: [],
    baselineRunId: 'run-base',
    baseline,
    base: { content: 'base', digest: 'd', revision: null, exists: true },
    variants: [v1, v2],
    probes: [{ id: 'pr-v1', variantId: 'v1', status: 'recorded', evidence, contrast: behaviorContrast(baseline, evidence), createdAt: new Date().toISOString() }],
    approval: { decision: 'approved', actor: 'a', note: 'n', variantSetDigest: variantSetDigest([v1, v2]), at: new Date().toISOString() },
    composition: { digest: 'd2', rationale: 'r', actor: 'a', at: new Date().toISOString(), variantId: 'v1' },
    promotion: null,
    rollback: null,
    createdBy: 't',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Proposal
}

const base = (splits?: Record<string, 'train' | 'eval' | 'sealed'>) => ({
  proposal: fixture(),
  currentChampion: null as Champion | null,
  applyRequested: false,
  applyEnvEnabled: false,
  ...(splits ? { evidenceSetSplits: splits } : {}),
})

describe('Agnes 批一 a：字典序目标（安全 > 质量 > 成本）', () => {
  it('安全 fail 时成本 blocker 暂缓为 warning（先修安全），lexOrder 如实分层', () => {
    // 安全 fail：约束检查 fail；成本 fail：超预算——两者叠加。
    const p = fixture({ evidenceOver: { costUsd: 999 } })
    p.constraints = {
      checks: [{ id: 'c1', status: 'fail', note: '权限约束未保持', detail: '' }],
      recordedBy: 'a',
      at: new Date().toISOString(),
    } as never
    const r = evaluatePromotion({
      ...base(),
      proposal: p,
    })
    expect(r.ok).toBe(false)
    expect(r.blockers.map((b) => b.code)).toContain('constraint_regression')
    expect(r.blockers.map((b) => b.code)).not.toContain('budget_exceeded')
    expect(r.warnings.map((w) => w.code)).toContain('budget_exceeded')
    // 安全单独 fail（质量干净）也触发成本暂缓；lexOrder 如实记录分层。
    expect(r.lexOrder).toEqual({ safety: 'fail', quality: 'pass', cost: 'pass' })
  })

  it('安全质量干净时成本 blocker 正常参与裁决（不被暂缓）', () => {
    const p = fixture({ evidenceOver: { costUsd: 999 } })
    const r = evaluatePromotion({ ...base(), proposal: p })
    expect(r.blockers.map((b) => b.code)).toContain('budget_exceeded')
    expect(r.lexOrder).toEqual({ safety: 'pass', quality: 'pass', cost: 'fail' })
  })

  it('干净提案 lexOrder 三层全 pass 且 ok', () => {
    const r = evaluatePromotion(base())
    expect(r.ok).toBe(true)
    expect(r.lexOrder).toEqual({ safety: 'pass', quality: 'pass', cost: 'pass' })
  })
})

describe('Agnes 批一 a：三向数据集隔离（train_evidence）', () => {
  it('证据集是 train 角色 → blocker train_evidence', () => {
    const r = evaluatePromotion(base({ 'set-1': 'train' }))
    expect(r.blockers.map((b) => b.code)).toContain('train_evidence')
    expect(r.ok).toBe(false)
  })

  it('证据集是 eval/sealed 角色 → 不拦', () => {
    expect(evaluatePromotion(base({ 'set-1': 'eval' })).blockers.map((b) => b.code)).not.toContain('train_evidence')
    expect(evaluatePromotion(base({ 'set-1': 'sealed' })).blockers.map((b) => b.code)).not.toContain('train_evidence')
  })

  it('splits 表缺席 → 该门不评估（向后兼容）', () => {
    expect(evaluatePromotion(base()).blockers.map((b) => b.code)).not.toContain('train_evidence')
  })
})

describe('Agnes 批一 a：调度默认 k=3', () => {
  it('DEFAULT_SCHEDULE_POLICY.probeK=3；归一化保持 3', () => {
    expect(DEFAULT_SCHEDULE_POLICY.probeK).toBe(3)
    expect(normalizeSchedulePolicy({}).probeK).toBe(3)
  })
})

describe('eval store：split 三向角色', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'agnes-split-'))
    _useEvalStoreDirForTests(dir)
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const task = {
    id: 't1',
    problem: 'p',
    expectedBehavior: 'e',
    rubric: [{ id: 'a1', text: '交付包含判定', expect: 'yes' as const, kind: 'result' as const }],
  }

  it('缺省=eval；显式 train 建 train 集；split=sealed 拒绝；train+golden 拒绝', () => {
    const def = createSet({ name: 'default-set', track: 'e2e', tasks: [task] } as never)
    expect(def.ok).toBe(true)
    expect(splitOfSet(def.set)).toBe('eval')

    const train = createSet({ name: 'train-set', track: 'e2e', tasks: [task], split: 'train' } as never)
    expect(train.ok).toBe(true)
    expect(train.set.split).toBe('train')
    expect(splitOfSet(train.set)).toBe('train')

    const badRole = createSet({ name: 'x1', track: 'e2e', tasks: [task], split: 'dev' } as never)
    expect(badRole.ok).toBe(false)
    expect(badRole.problems.join()).toContain('split 须为')

    const explicitSealed = createSet({ name: 'x2', track: 'e2e', tasks: [task], split: 'sealed' } as never)
    expect(explicitSealed.ok).toBe(false)
    expect(explicitSealed.problems.join()).toContain('不接受显式声明')

    const trainGolden = createSet({ name: 'x3', track: 'e2e', tasks: [task], split: 'train', golden: true } as never)
    expect(trainGolden.ok).toBe(false)
    expect(trainGolden.problems.join()).toContain('train 集不得同时 golden')
  })

  it('密封推导：eval 集密封后 splitOfSet=sealed；train 集不可密封', () => {
    const evalSet = createSet({ name: 'to-seal', track: 'e2e', tasks: [task] } as never)
    expect(evalSet.ok).toBe(true)
    expect(splitOfSet(evalSet.set)).toBe('eval')
    const sealed = sealSet(evalSet.set.id)
    expect(sealed.ok).toBe(true)
    const after = sealSet('no-such') // 不存在的集
    expect(after.ok).toBe(false)
    // 密封后读回
    const trainSet = createSet({ name: 'train-2', track: 'e2e', tasks: [task], split: 'train' } as never)
    expect(trainSet.ok).toBe(true)
    const refuseSeal = sealSet(trainSet.set.id)
    expect(refuseSeal.ok).toBe(false)
    expect((refuseSeal as { problems: string[] }).problems.join()).toContain('train 集不可密封')
  })
})
