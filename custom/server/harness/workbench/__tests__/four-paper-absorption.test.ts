// 四篇 RSI 论文吸收批守门（2026-11-05）：
// W1 执行证迹 / W2 INV-DOM 分层与归因 / W3 组件库 donor / W6 command 验证档 + code 计数棘轮。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeExecutionTrace, executionMarkersOf } from '../execution-trace'
import { runProbeTasks } from '../probe-runner'
import { _resetLibraryForTests, recordComponent, selectDonors } from '../component-library'
import { classAttributionOf } from '../loop-advice-evolution'
import { evaluatePromotion } from '../loop-report'
import { verificationTierOf } from '../loop-advice-tier'
import { behaviorContrast, diffSummary, sha256, variantSetDigest } from '../loop-core'
import type { EvolutionSurface, Probe, ProbeMetrics, Proposal, Variant } from '../types'

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

function variant(id: string, content: string, files?: Array<{ path: string; content: string }>): Variant {
  return {
    id,
    label: id,
    content,
    digest: sha256(content + (files?.map((f) => f.path).join(',') ?? '')),
    diffSummary: diffSummary('base', content),
    ...(files ? { files: files.map((f) => ({ ...f, digest: sha256(f.content) })) } : {}),
  }
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

function fixture(patch: Partial<Proposal> = {}): Proposal {
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
    ...patch,
  }
  p.probes = [recordedProbe(p, 'v1', { passAt1: 0.8, passAtK: 0.8, resultPassRate: 0.8 }), recordedProbe(p, 'v2', { passAt1: 0.7, passAtK: 0.7 })]
  return p
}

const reg = (over: Record<string, unknown> = {}) => ({
  round: 3,
  horizon: 20,
  editBudget: 2,
  maxEditCount: 1,
  editBudgetExceeded: false,
  noiseDelta: 0.02,
  noiseRuns: 2,
  stalled: false,
  stallWindow: 3,
  firstOnSurface: false,
  hypothesisRetry: [],
  ...over,
})

const gate = (proposal: Proposal, over: Record<string, unknown> = {}) => evaluatePromotion({
  proposal,
  currentChampion: null,
  applyRequested: false,
  applyEnvEnabled: false,
  regularization: reg(),
  ...over,
} as Parameters<typeof evaluatePromotion>[0])

// ---------------------------------------------------------------------------
// W1 执行证迹
// ---------------------------------------------------------------------------

describe('W1 执行证迹：标记推导', () => {
  it('只从 skills/sub_agents 推导标记，指令面与可执行件不产标记', () => {
    const v = variant('v1', '', [
      { path: 'skills/dedupe/SKILL.md', content: '# dedupe' },
      { path: 'skills/quick-ref.md', content: '# ref' },
      { path: 'sub_agents/researcher.md', content: '# r' },
      { path: 'profiles/p1/SOUL.md', content: '# soul' },
      { path: 'scripts/run.py', content: 'print(1)' },
    ])
    const info = executionMarkersOf(v)
    expect(info.observable).toBe(true)
    expect(info.markers).toEqual(['dedupe', 'quick-ref', 'researcher'])
  })

  it('纯指令面候选没有可判定标记（如实标 static，不拿提示词哈希冒充执行）', () => {
    const v = variant('v1', 'new system prompt')
    expect(executionMarkersOf(v)).toEqual({ markers: [], observable: false })
  })
})

describe('W1 执行证迹：证迹汇总', () => {
  it('有标记零命中＝observed/0；部分命中给比例', () => {
    const miss = computeExecutionTrace(['dedupe'], [], 1200, 't0')
    expect(miss.status).toBe('observed')
    expect(miss.hitRatio).toBe(0)
    expect(miss.scannedChars).toBe(1200)
    const half = computeExecutionTrace(['a', 'b'], ['b'], 100, 't0')
    expect(half.hitRatio).toBe(0.5)
    expect(half.hit).toEqual(['b'])
  })

  it('无标记＝static，比例不造数', () => {
    const trace = computeExecutionTrace([], [], 0, 't0')
    expect(trace.status).toBe('static')
    expect(trace.hitRatio).toBeNull()
  })
})

describe('W1 执行证迹：探测采集', () => {
  it('原始事件流命中标记（result.text 里没有也算——工具调用只在事件流里）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'four-paper-probe-'))
    try {
      const stdout = [
        JSON.stringify({ type: 'assistant', text: 'loading skill dedupe' }),
        JSON.stringify({ type: 'result', text: 'finished', session_id: 's1' }),
      ].join('\n')
      const result = await runProbeTasks({
        prompts: [{ taskId: 't1', prompt: 'do it' }],
        baseHome: join(dir, 'home'),
        profile: 'orchestrator',
        variantTree: {},
        budgetRemainingUsd: 5,
        k: 1,
        markers: ['dedupe', 'absent-skill'],
        retryDelayMs: 0,
        spawnRun: async () => ({ ok: true, stdout }),
      })
      expect(result.markerHits?.hits).toEqual(['dedupe'])
      expect(result.markerHits?.scannedChars).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('不下传标记＝不采集（markerHits 缺席）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'four-paper-probe-'))
    try {
      const stdout = JSON.stringify({ type: 'result', text: 'ok', session_id: 's1' })
      const result = await runProbeTasks({
        prompts: [{ taskId: 't1', prompt: 'do it' }],
        baseHome: join(dir, 'home'),
        profile: 'orchestrator',
        variantTree: {},
        budgetRemainingUsd: 5,
        k: 1,
        retryDelayMs: 0,
        spawnRun: async () => ({ ok: true, stdout }),
      })
      expect(result.markerHits).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('W1 执行证迹门', () => {
  it('增益超噪声带但轨迹零命中 → blocker mechanism_not_executed', () => {
    const p = fixture({
      probes: [],
    })
    p.probes = [recordedProbe(p, 'v1', {
      passAt1: 0.8,
      passAtK: 0.8,
      resultPassRate: 0.8,
      executionTrace: computeExecutionTrace(['dedupe'], [], 5000, 't0'),
    }), recordedProbe(p, 'v2', { passAt1: 0.7 })]
    const report = gate(p)
    expect(report.blockers.map((b) => b.code)).toContain('mechanism_not_executed')
  })

  it('轨迹命中 → 不拦；未采集 → warning mechanism_trace_missing', () => {
    const hit = fixture({ probes: [] })
    hit.probes = [recordedProbe(hit, 'v1', {
      passAt1: 0.8,
      passAtK: 0.8,
      resultPassRate: 0.8,
      executionTrace: computeExecutionTrace(['dedupe'], ['dedupe'], 5000, 't0'),
    }), recordedProbe(hit, 'v2', { passAt1: 0.7 })]
    expect(gate(hit).blockers.map((b) => b.code)).not.toContain('mechanism_not_executed')

    const missing = fixture()
    const report = gate(missing)
    expect(report.warnings.map((w) => w.code)).toContain('mechanism_trace_missing')
    expect(report.blockers.map((b) => b.code)).not.toContain('mechanism_trace_missing')
  })

  it('增益落在噪声带内不按执行证迹拦（探索性提案交给噪声门裁决）', () => {
    const p = fixture({ probes: [] })
    p.probes = [recordedProbe(p, 'v1', {
      passAt1: 0.51,
      passAtK: 0.51,
      resultPassRate: 0.51,
      executionTrace: computeExecutionTrace(['dedupe'], [], 5000, 't0'),
    }), recordedProbe(p, 'v2', { passAt1: 0.5 })]
    const codes = gate(p).blockers.map((b) => b.code)
    expect(codes).not.toContain('mechanism_not_executed')
    expect(codes).toContain('gain_within_noise')
  })
})

// ---------------------------------------------------------------------------
// W2 INV/DOM 分层
// ---------------------------------------------------------------------------

describe('W2 编辑类别门', () => {
  it('未声明 → warning edit_class_undeclared；mixed → warning edit_class_mixed', () => {
    const undeclared = gate(fixture())
    expect(undeclared.warnings.map((w) => w.code)).toContain('edit_class_undeclared')

    const mixed = gate(fixture({ editClass: 'mixed' }))
    expect(mixed.warnings.map((w) => w.code)).toContain('edit_class_mixed')

    const clean = gate(fixture({ editClass: 'invariant' }))
    expect(clean.warnings.map((w) => w.code)).not.toContain('edit_class_undeclared')
  })

  it('strict 开关把未声明升为 blocker', () => {
    const prev = process.env.HARNESS2_EDIT_CLASS_STRICT
    process.env.HARNESS2_EDIT_CLASS_STRICT = '1'
    try {
      expect(gate(fixture()).blockers.map((b) => b.code)).toContain('edit_class_undeclared')
    } finally {
      if (prev === undefined) delete process.env.HARNESS2_EDIT_CLASS_STRICT
      else process.env.HARNESS2_EDIT_CLASS_STRICT = prev
    }
  })
})

describe('W2 分类归因与跷跷板', () => {
  const surface = (timeline: EvolutionSurface['timeline']): EvolutionSurface => ({
    surfaceKey: 'system_prompt',
    rounds: timeline.filter((r) => !r.rolledBack).length,
    proposalsTotal: timeline.length,
    promoted: timeline.length,
    rejected: 0,
    rolledBack: 0,
    open: 0,
    failedProbes: 0,
    stalled: false,
    pruneSuggested: false,
    weakVerificationStreak: 0,
    timeline,
  })
  const round = (proposalId: string, passAt1Delta: number, costUsd = 1) => ({
    round: 1,
    proposalId,
    variantLabel: proposalId,
    promotedAt: 't',
    rolledBack: false,
    passAt1: 0.5,
    tokens: 100,
    costUsd,
    noiseDelta: 0.02,
    passAt1Delta,
  })

  it('按类聚合增益；invariant 涨、domain 跌 → seesawSuspected', () => {
    const proposals = [
      { id: 'p1', editClass: 'invariant' } as Proposal,
      { id: 'p2', editClass: 'domain' } as Proposal,
    ]
    const result = classAttributionOf([surface([round('p1', 0.1), round('p2', -0.05, 1.2)])], proposals)
    expect(result.seesawSuspected).toBe(true)
    expect(result.rows.find((r) => r.editClass === 'invariant')?.meanDelta).toBeCloseTo(0.1)
    expect(result.rows.find((r) => r.editClass === 'domain')?.meanDelta).toBeCloseTo(-0.05)
  })

  it('同类相邻两轮方向相反不算跷跷板；未声明归入 undeclared', () => {
    const proposals = [
      { id: 'p1', editClass: 'invariant' } as Proposal,
      { id: 'p2', editClass: 'invariant' } as Proposal,
      { id: 'p3' } as Proposal,
    ]
    const result = classAttributionOf([surface([round('p1', 0.1), round('p2', -0.02), round('p3', 0.03)])], proposals)
    expect(result.seesawSuspected).toBe(false)
    expect(result.rows.map((r) => r.editClass)).toEqual(['invariant', 'undeclared'])
  })
})

// ---------------------------------------------------------------------------
// W3 组件库 donor
// ---------------------------------------------------------------------------

describe('W3 组件库消费', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'four-paper-donor-'))
    process.env.HARNESS2_COMPONENT_LIBRARY = join(dir, 'components.json')
    _resetLibraryForTests()
  })
  afterEach(() => {
    delete process.env.HARNESS2_COMPONENT_LIBRARY
    rmSync(dir, { recursive: true, force: true })
  })

  function seed(patch: Partial<Proposal>, content: string, delta: number, domain: string): void {
    const p = fixture({ ...patch, domain })
    const v = variant('v1', content)
    recordComponent(p, v, { proposalId: p.id, variantId: v.id, passAt1: 0.6, delta })
  }

  it('只提供正增益 donor；负增益与已在基线里的进 skipped', () => {
    seed({ id: 'hw-a', targetPath: 'profiles/a/dedupe.md', surfaceKey: 'skills' }, 'unique-a\nbody-a', 0.12, 'coding')
    seed({ id: 'hw-b', targetPath: 'profiles/b/reject.md', surfaceKey: 'skills' }, 'negative body', -0.03, 'coding')
    seed({ id: 'hw-c', targetPath: 'profiles/c/format.md', surfaceKey: 'skills' }, 'l1\nl2', 0.05, 'writing')

    const result = selectDonors({ surfaceKey: 'skills', domain: 'coding', baseContent: 'l1\nl2\nl3', limit: 3 })
    expect(result.offered.map((d) => d.entry.name)).toEqual(['dedupe.md'])
    expect(result.offered[0].crossDomain).toBe(false)
    expect(result.skipped.some((s) => s.reason.includes('无正增益'))).toBe(true)
    expect(result.skipped.some((s) => s.reason.includes('已在当前基线'))).toBe(true)
  })

  it('同 (kind,name) 只取最新版本；跨域 donor 打分更高', () => {
    seed({ id: 'hw-a', targetPath: 'profiles/a/dedupe.md', surfaceKey: 'skills' }, 'v1 body line1\nline2', 0.05, 'coding')
    seed({ id: 'hw-a2', targetPath: 'profiles/a/dedupe.md', surfaceKey: 'skills' }, 'v2 body line1\nline2\nline3', 0.08, 'coding')
    seed({ id: 'hw-d', targetPath: 'profiles/d/tone.md', surfaceKey: 'memory' }, 'other body zzz', 0.2, 'writing')

    const result = selectDonors({ surfaceKey: 'skills', domain: 'coding', limit: 5 })
    const dedupeRows = result.offered.filter((d) => d.entry.name === 'dedupe.md')
    expect(dedupeRows).toHaveLength(1)
    expect(dedupeRows[0].entry.version).toBe(2)
    expect(result.offered[0].entry.name).toBe('tone.md')
    expect(result.offered[0].crossDomain).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// W6 command 验证档与 code 计数棘轮
// ---------------------------------------------------------------------------

describe('W6 command 验证档', () => {
  it('任务有命令式验收读数 → tier=command（此前该档不可达）', () => {
    const p = fixture({ probes: [] })
    p.probes = [recordedProbe(p, 'v1', { commandChecks: { total: 3, passed: 3 } }), recordedProbe(p, 'v2')]
    expect(verificationTierOf(p)).toBe('command')
  })

  it('无命令读数但有回归 → tier=regression', () => {
    expect(verificationTierOf(fixture())).toBe('regression')
  })
})

describe('W6 code 计数棘轮', () => {
  it('晋级门 code 数量与设计文档钉住的值一致（新增 code 必须同批改这里与设计文档）', () => {
    const source = readFileSync(fileURLToPath(new URL('../loop-report.ts', import.meta.url)), 'utf8')
    const codes = new Set(
      [...source.matchAll(/code: '([a-z0-9_]+)'/g)].map((m) => m[1]),
    )
    // 2026-11-05 四篇论文吸收后：53 → 57（+mechanism_not_executed/mechanism_trace_missing/edit_class_undeclared/edit_class_mixed）
    expect(codes.size).toBe(57)
    for (const code of ['mechanism_not_executed', 'mechanism_trace_missing', 'edit_class_undeclared', 'edit_class_mixed']) {
      expect(codes.has(code)).toBe(true)
    }
  })
})
