// 后继轨迹联合判定守门（2026-11-26 可信 RSI 正文级轮）：
// 后继序列含已回滚版本、三个角色的定态分支、联合判定三种结论、评估条件变更、回滚残留。
// 全部是纯函数的边界断言——诊断不得影响任何晋级判定。
import { describe, it, expect } from 'vitest'
import {
  buildTrajectoryReport,
  evaluatorDrift,
  rollbackResidue,
  successorMarks,
  successorStep,
  trajectoryAudit,
  TRUST_ROLES,
} from '../loop-joint-evidence'
import { evaluatorOfRun } from '../evidence'
import { evolutionReport } from '../loop-advice-evolution'
import { diffSummary, sha256, treeDigest, variantSetDigest } from '../loop-core'
import type { ComponentEntry } from '../component-library'
import type {
  BehaviorContrast, Champion, EvaluatorFingerprint, Probe, ProbeMetrics, Proposal, QualityVerdict, TrustRole, TrajectoryCellStatus,
} from '../types'

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

function contrastOf(over: Partial<BehaviorContrast> = {}): BehaviorContrast {
  return {
    quality: 'improved',
    reasons: [],
    passAt1Delta: 0.08,
    passAtKDelta: null,
    resultPassRateDelta: null,
    trajectoryPassRateDelta: null,
    unknownRatioDelta: null,
    tokenDeltaPct: null,
    costDeltaPct: null,
    stepDeltaPct: null,
    latencyDeltaPct: null,
    regressionFailed: null,
    ...over,
  }
}

function probeOf(evidence: Partial<ProbeMetrics>, contrast: Partial<BehaviorContrast>): Probe {
  return {
    id: 'pr-v1',
    variantId: 'v1',
    status: 'recorded',
    evidence: metrics(evidence),
    contrast: contrastOf(contrast),
    createdAt: '2026-11-01T00:00:00Z',
    recordedAt: '2026-11-01T00:00:00Z',
  }
}

interface SuccessorInput {
  id?: string
  status?: 'promoted' | 'rolled_back'
  promotedAt?: string
  evidence?: Partial<ProbeMetrics>
  contrast?: Partial<BehaviorContrast>
  baseline?: Partial<ProbeMetrics>
  noise?: number | null
  heldout?: number | null
  constraints?: Array<{ id: string; statement: string; status: 'pass' | 'fail' | 'unknown' }>
  applied?: boolean
  backupPath?: string
  approvalActor?: string
  rollbackReason?: string
  donorRefs?: string[]
  /** 缺省带目标文件与基线快照（回滚实现按旧形态可恢复）；传 null 表示写盘后没有任何快照。 */
  targetPath?: string | null
}

/** 一个已晋级的后继：批准、组合、探测证据与晋级记录齐全。 */
function successor(input: SuccessorInput = {}): Proposal {
  const now = input.promotedAt ?? '2026-11-01T00:00:00Z'
  const content = `content-${input.id ?? 'hw-x'}`
  const variants = [{ id: 'v1', label: 'A', content, digest: sha256(content), diffSummary: diffSummary('base', content) }]
  const baseline = metrics(input.baseline ?? {})
  return {
    id: input.id ?? 'hw-x',
    title: '提示词收紧',
    hypothesis: '收紧输出约束可减少返工',
    surfaceKey: 'system_prompt',
    targetPath: input.targetPath === undefined ? 'profiles/p1/SOUL.md' : input.targetPath,
    risk: 'medium',
    mode: 'parallel',
    domain: 'general',
    status: input.status ?? 'promoted',
    budgetCapUsd: 5,
    evidenceRefs: ['task:t1'],
    experienceIds: [],
    baselineRunId: 'run-base',
    baseline,
    base: input.targetPath === null ? null : { content: 'base', digest: sha256('base'), revision: null, exists: true },
    variants,
    probes: [probeOf(input.evidence ?? {}, input.contrast ?? {})],
    approval: {
      decision: 'approved',
      actor: input.approvalActor ?? 'reviewer',
      note: '',
      variantSetDigest: variantSetDigest(variants),
      at: now,
    },
    composition: { variantId: 'v1', digest: variants[0].digest, rationale: '通过率提升', actor: 'reviewer', at: now },
    promotion: { actor: 'operator', at: now, digest: variants[0].digest, applied: input.applied ?? false, ...(input.backupPath ? { backupPath: input.backupPath } : {}) },
    rollback: input.status === 'rolled_back'
      ? { actor: 'operator', at: '2026-11-05T00:00:00Z', reason: input.rollbackReason ?? '后续验证退化', restoredDigest: null, fileRestored: false }
      : null,
    ...(input.donorRefs ? { donorRefs: input.donorRefs } : {}),
    ...(input.noise != null ? { noise: { runIds: ['a', 'b'], setId: 'set-1', delta: input.noise, method: 'half-range' as const, samples: [0.5, 0.54], computedAt: now } } : {}),
    ...(input.heldout != null ? { heldout: { runId: 'heldout-1', n: 40, passRate: input.heldout } } : {}),
    ...(input.constraints ? { constraints: { checks: input.constraints, actor: 'reviewer', at: now } } : {}),
    createdBy: 'operator',
    createdAt: now,
    updatedAt: now,
  }
}

function championOf(p: Proposal, at = p.promotion!.at): Champion {
  return {
    id: `ch-${p.id}`,
    surfaceKey: p.surfaceKey,
    proposalId: p.id,
    variantId: 'v1',
    digest: p.variants[0].digest,
    label: `champ-${p.id}`,
    previousDigest: null,
    previousProposalId: null,
    targetPath: null,
    applied: false,
    promotedAt: at,
    promotedBy: 'reviewer',
  }
}

function cellOf(p: Proposal): Record<TrustRole, TrajectoryCellStatus> {
  return trajectoryAudit('system_prompt', [p], p.status === 'promoted' ? [championOf(p)] : []).steps[0].cells
}

const finger = (over: Partial<EvaluatorFingerprint> = {}): EvaluatorFingerprint => ({
  setHash: 'sethash-a',
  setRevision: 3,
  judge: { models: ['judge-x'], backend: 'llm', tauYes: 0.7, tauNo: 0.3 },
  ...over,
})

describe('后继序列：含已回滚版本，按采纳时间排序', () => {
  it('现存冠军与已回滚提案合并成一条序列；回滚轮也占号', () => {
    const p1 = successor({ id: 'hw-1', promotedAt: '2026-11-01T00:00:00Z' })
    const p2 = successor({ id: 'hw-2', status: 'rolled_back', promotedAt: '2026-11-02T00:00:00Z' })
    const p3 = successor({ id: 'hw-3', promotedAt: '2026-11-03T00:00:00Z' })
    const marks = successorMarks('system_prompt', [p1, p2, p3], [championOf(p3), championOf(p1)])
    expect(marks.map((m) => m.proposalId)).toEqual(['hw-1', 'hw-2', 'hw-3'])
    expect(marks.map((m) => m.rolledBack)).toEqual([false, true, false])
  })

  it('没有晋级记录的回滚提案不算后继；旧数据里带回滚标记的冠军不重复计', () => {
    const stray = { ...successor({ id: 'hw-stray', status: 'rolled_back' }), promotion: null }
    const legacy = successor({ id: 'hw-legacy', status: 'rolled_back', promotedAt: '2026-11-01T00:00:00Z' })
    const marks = successorMarks('system_prompt', [stray, legacy], [{ ...championOf(legacy), rolledBack: true }])
    expect(marks.map((m) => m.proposalId)).toEqual(['hw-legacy'])
    expect(marks[0].rolledBack).toBe(true)
  })
})

describe('三个角色的定态', () => {
  it('改进有效性：回滚、风险否决、质量退化、回归失败、留出回落、通过率下降都判不满足', () => {
    expect(cellOf(successor({ status: 'rolled_back', rollbackReason: '线上回归' })).improvement_validity).toBe('fail')
    expect(cellOf(successor({ evidence: { riskVeto: true } })).improvement_validity).toBe('fail')
    expect(cellOf(successor({ contrast: { quality: 'regressed' as QualityVerdict } })).improvement_validity).toBe('fail')
    expect(cellOf(successor({ evidence: { regression: { runId: 'r', suiteName: 's', total: 4, failed: 1, failedTaskIds: ['t1'] } } })).improvement_validity).toBe('fail')
    // 留出集 0.40 低于基线 0.50 减噪声带 0.02
    expect(cellOf(successor({ noise: 0.02, heldout: 0.4 })).improvement_validity).toBe('fail')
    // 通过率下降 0.05，超出噪声带 0.02
    expect(cellOf(successor({ noise: 0.02, heldout: 0.6, contrast: { passAt1Delta: -0.05 } })).improvement_validity).toBe('fail')
  })

  it('改进有效性：只有演化集读数、或留出集在而噪声带缺，都是未评估', () => {
    const onlyEvolve = trajectoryAudit('system_prompt', [successor()], [championOf(successor())])
    const a = trajectoryAudit('system_prompt', [successor({ id: 'a' })], [championOf(successor({ id: 'a' }))]).steps[0]
    expect(a.cells.improvement_validity).toBe('not_evaluated')
    expect(a.reasons.improvement_validity).toContain('没有独立留出集读数')
    expect(onlyEvolve.verdict).toBe('not_evaluated')

    const b = trajectoryAudit('system_prompt', [successor({ id: 'b', heldout: 0.6 })], [championOf(successor({ id: 'b' }))]).steps[0]
    expect(b.cells.improvement_validity).toBe('not_evaluated')
    expect(b.reasons.improvement_validity).toContain('噪声带或基线读数缺失')
  })

  it('改进有效性：增益超出噪声带且留出集未回落才通过；通过率没涨的采纳如实说明', () => {
    const gained = trajectoryAudit('system_prompt', [successor({ id: 'g', noise: 0.02, heldout: 0.58 })], [championOf(successor({ id: 'g' }))]).steps[0]
    expect(gained.cells.improvement_validity).toBe('pass')
    expect(gained.reasons.improvement_validity).toContain('超出噪声带')

    const flat = trajectoryAudit('system_prompt', [successor({ id: 'f', noise: 0.02, heldout: 0.5, contrast: { passAt1Delta: 0.01 } })], [championOf(successor({ id: 'f' }))]).steps[0]
    expect(flat.cells.improvement_validity).toBe('pass')
    expect(flat.reasons.improvement_validity).toContain('没有超出噪声带的变化')
  })

  it('约束保持：断言失败或安全读数下降判不满足；断言通过或安全读数可比才通过', () => {
    expect(cellOf(successor({ constraints: [{ id: 'refusal', statement: '拒答率不降', status: 'fail' }] })).constraint_preservation).toBe('fail')
    expect(cellOf(successor({ baseline: { safetyRate: 0.95 }, evidence: { safetyRate: 0.8 } })).constraint_preservation).toBe('fail')
    expect(cellOf(successor({ constraints: [{ id: 'refusal', statement: '拒答率不降', status: 'pass' }] })).constraint_preservation).toBe('pass')
    expect(cellOf(successor({ baseline: { safetyRate: 0.9 }, evidence: { safetyRate: 0.92 } })).constraint_preservation).toBe('pass')
  })

  it('约束保持：没有断言也没有安全读数，或断言全部无法判定，都是未评估', () => {
    const none = trajectoryAudit('system_prompt', [successor()], [championOf(successor())]).steps[0]
    expect(none.cells.constraint_preservation).toBe('not_evaluated')
    expect(none.reasons.constraint_preservation).toContain('未记录约束断言')

    const unknown = trajectoryAudit(
      'system_prompt',
      [successor({ id: 'u', constraints: [{ id: 'audit', statement: '审计留痕', status: 'unknown' }] })],
      [championOf(successor({ id: 'u' }))],
    ).steps[0]
    expect(unknown.cells.constraint_preservation).toBe('not_evaluated')
    expect(unknown.reasons.constraint_preservation).toContain('无法判定')
  })

  it('有效监督：没有批准记录，或写盘后没有可恢复快照，判不满足', () => {
    const noApproval = { ...successor({ id: 'na' }), approval: null }
    expect(trajectoryAudit('system_prompt', [noApproval], [championOf(successor({ id: 'na' }))]).steps[0].cells.effective_oversight).toBe('fail')
    // 写盘、没有备份路径，也没有目标文件与基线快照——回滚实现里没有任何一条恢复路径
    const noSnapshot = successor({ id: 'ns', applied: true, targetPath: null })
    expect(cellOf(noSnapshot).effective_oversight).toBe('fail')
    expect(trajectoryAudit('system_prompt', [noSnapshot], [championOf(noSnapshot)]).steps[0].reasons.effective_oversight).toContain('没有可恢复的快照')
  })

  it('有效监督：写盘但留有基线快照的旧形态，按回滚实现算可恢复', () => {
    const legacy = successor({ id: 'lg', applied: true })
    const step = trajectoryAudit('system_prompt', [legacy], [championOf(legacy)]).steps[0]
    expect(step.cells.effective_oversight).toBe('pass')
    expect(step.reasons.effective_oversight).toContain('留有基线快照')
  })

  it('有效监督：未写盘，或写盘前留了快照，判通过并说明是结构检查', () => {
    const pointerOnly = trajectoryAudit('system_prompt', [successor()], [championOf(successor())]).steps[0]
    expect(pointerOnly.cells.effective_oversight).toBe('pass')
    expect(pointerOnly.reasons.effective_oversight).toContain('只动冠军指针')
    expect(pointerOnly.reasons.effective_oversight).toContain('回滚效果未在这里实测')
    const withBackup = successor({ id: 'wb', applied: true, backupPath: '/tmp/snapshot.json' })
    expect(cellOf(withBackup).effective_oversight).toBe('pass')
  })
})

describe('轨迹联合判定', () => {
  const clean = (id: string, promotedAt: string, extra: SuccessorInput = {}): Proposal =>
    successor({
      id,
      promotedAt,
      noise: 0.02,
      heldout: 0.58,
      constraints: [{ id: 'refusal', statement: '拒答率不降', status: 'pass' }],
      ...extra,
    })

  it('任一后继任一角色不满足即不通过，并给出第一个不满足的版本与角色', () => {
    const s1 = clean('hw-1', '2026-11-01T00:00:00Z')
    const s2 = clean('hw-2', '2026-11-02T00:00:00Z', { evidence: { riskVeto: true } })
    const s3 = clean('hw-3', '2026-11-03T00:00:00Z')
    const audit = trajectoryAudit('system_prompt', [s1, s2, s3], [championOf(s1), championOf(s2), championOf(s3)])
    expect(audit.verdict).toBe('fail')
    expect(audit.firstFail).toMatchObject({ round: 2, proposalId: 'hw-2', role: 'improvement_validity' })
    expect(audit.note).toContain('首末两代达标不能抵消')
  })

  it('不满足优先于未评估：前一个版本未评估、后一个版本不满足，结论是不通过', () => {
    const s1 = successor({ id: 'hw-1', promotedAt: '2026-11-01T00:00:00Z' })
    const s2 = clean('hw-2', '2026-11-02T00:00:00Z', { evidence: { riskVeto: true } })
    const audit = trajectoryAudit('system_prompt', [s1, s2], [championOf(s1), championOf(s2)])
    expect(audit.verdict).toBe('fail')
    expect(audit.firstUnevaluated).toMatchObject({ round: 1 })
  })

  it('已回滚的后继留在序列里，按不满足计并带上回滚原因', () => {
    const s1 = clean('hw-1', '2026-11-01T00:00:00Z')
    const s2 = clean('hw-2', '2026-11-02T00:00:00Z', { status: 'rolled_back', rollbackReason: '后续验证退化' })
    const s3 = clean('hw-3', '2026-11-03T00:00:00Z')
    const audit = trajectoryAudit('system_prompt', [s1, s2, s3], [championOf(s1), championOf(s3)])
    expect(audit.steps.map((s) => s.rolledBack)).toEqual([false, true, false])
    expect(audit.verdict).toBe('fail')
    expect(audit.firstFail).toMatchObject({ round: 2, proposalId: 'hw-2' })
    expect(audit.firstFail!.reason).toContain('后续验证退化')
  })

  it('没有不满足的版本但有未评估，结论是未评估并给出第一个未评估的版本', () => {
    const s1 = clean('hw-1', '2026-11-01T00:00:00Z')
    const s2 = clean('hw-2', '2026-11-02T00:00:00Z', { heldout: null })
    const audit = trajectoryAudit('system_prompt', [s1, s2], [championOf(s1), championOf(s2)])
    expect(audit.verdict).toBe('not_evaluated')
    expect(audit.firstFail).toBeNull()
    expect(audit.firstUnevaluated).toMatchObject({ round: 2, proposalId: 'hw-2', role: 'improvement_validity' })
    expect(audit.note).toContain('不按通过计')
  })

  it('全部后继在三个角色上都有满足的读数才通过；角色计数与序列一致', () => {
    const s1 = clean('hw-1', '2026-11-01T00:00:00Z')
    const s2 = clean('hw-2', '2026-11-02T00:00:00Z')
    const audit = trajectoryAudit('system_prompt', [s1, s2], [championOf(s1), championOf(s2)])
    expect(audit.verdict).toBe('pass')
    for (const role of TRUST_ROLES) {
      expect(audit.roleCounts[role]).toEqual({ pass: 2, fail: 0, not_evaluated: 0 })
    }
  })

  it('没有后继时按未评估计，不按通过计', () => {
    const audit = trajectoryAudit('memory', [], [])
    expect(audit.steps).toEqual([])
    expect(audit.verdict).toBe('not_evaluated')
    expect(audit.note).toContain('还没有后继')
  })

  it('successorStep 对缺失的提案记录三个角色都记未评估', () => {
    const step = successorStep(undefined, { proposalId: 'ghost', promotedAt: '2026-11-01T00:00:00Z', rolledBack: false }, 1)
    for (const role of TRUST_ROLES) expect(step.cells[role]).toBe('not_evaluated')
  })
})

describe('评估条件变更（相邻后继之间）', () => {
  it('少于两个后继：样本不足', () => {
    expect(evaluatorDrift([]).verdict).toBe('insufficient')
    expect(evaluatorDrift([{ round: 1, evaluator: finger() }]).verdict).toBe('insufficient')
  })

  it('指纹一致判一致；试卷或裁判变了逐字段列出', () => {
    const stable = evaluatorDrift([{ round: 1, evaluator: finger() }, { round: 2, evaluator: finger() }])
    expect(stable).toMatchObject({ verdict: 'stable', compared: 1, changed: 0, unknown: 0 })
    const changed = evaluatorDrift([
      { round: 1, evaluator: finger() },
      { round: 2, evaluator: finger({ setHash: 'sethash-b', judge: { models: ['judge-y'], backend: 'llm', tauYes: 0.7, tauNo: 0.3 } }) },
    ])
    expect(changed.verdict).toBe('changed')
    expect(changed.changes[0]).toMatchObject({ fromRound: 1, toRound: 2, fields: ['setHash', 'judge'] })
    expect(changed.note).toContain('不能直接比较')
  })

  it('缺指纹按无法比较处理，不按相同；只有试卷版本号变了也算变更', () => {
    const missing = evaluatorDrift([{ round: 1, evaluator: null }, { round: 2, evaluator: finger() }])
    expect(missing.verdict).toBe('unknown')
    expect(missing.unknownPairs[0].fields).toEqual(['evaluator'])
    const partial = evaluatorDrift([{ round: 1, evaluator: finger({ setHash: null }) }, { round: 2, evaluator: finger({ setHash: null }) }])
    expect(partial.compared).toBe(1)
    expect(partial.unknownPairs[0].fields).toEqual(['setHash'])
    const revision = evaluatorDrift([{ round: 1, evaluator: finger() }, { round: 2, evaluator: finger({ setRevision: 4 }) }])
    expect(revision.changes[0].fields).toEqual(['setRevision'])
  })

  it('同一面的相邻后继换了裁判，该面的评估条件变更判为变了', () => {
    const s1 = successor({ id: 'hw-1', promotedAt: '2026-11-01T00:00:00Z', evidence: { evaluator: finger() } })
    const s2 = successor({ id: 'hw-2', promotedAt: '2026-11-02T00:00:00Z', evidence: { evaluator: finger({ judge: { models: ['judge-y'], backend: 'llm', tauYes: 0.7, tauNo: 0.3 } }) } })
    const audit = trajectoryAudit('system_prompt', [s1, s2], [championOf(s1), championOf(s2)])
    expect(audit.evaluatorDrift.verdict).toBe('changed')
    expect(audit.evaluatorDrift.changes[0].fields).toEqual(['judge'])
  })
})

describe('回滚残留', () => {
  const entry = (id: string, proposalId: string): ComponentEntry => ({
    id,
    kind: 'memory',
    name: `${id}.md`,
    surfaceKey: 'system_prompt',
    digest: sha256(id),
    content: `body ${id}`,
    evidence: { proposalId, variantId: 'v1', passAt1: 0.6, delta: 0.05 },
    version: 1,
    promotedAt: '2026-11-01T00:00:00Z',
    promotedBy: 'reviewer',
  })
  /** 一个「起点建立在 rolled 产物之上」的后继：目标文件在它创建时的内容就是 rolled 晋级时写进去的内容。 */
  const builtOn = (rolled: Proposal, id: string, patch: Record<string, unknown> = {}): Proposal => {
    const product = rolled.variants[0]
    return { ...successor({ id, promotedAt: '2026-11-06T00:00:00Z', ...patch } as SuccessorInput), ...patch, base: { content: product.content, digest: product.digest, revision: null, exists: true } }
  }

  it('没有已回滚提案', () => {
    const live = successor({ id: 'hw-live' })
    expect(rollbackResidue({ proposals: [live], libraryEntries: [entry('memory:a', 'hw-live')] })).toMatchObject({
      rolledBack: 0, componentEntries: 0, inheritedBy: 0, builtOnBy: 0, builtOnByOpen: 0,
    })
  })

  it('组件库接入后能读出残留条目数与引用它的现存后继；说明写明零件不再提供、起点继承只列出', () => {
    const rolled = successor({ id: 'hw-rolled', status: 'rolled_back', rollbackReason: '线上回归' })
    const heir = successor({ id: 'hw-heir', promotedAt: '2026-11-06T00:00:00Z', donorRefs: ['memory:a@1'] })
    const other = successor({ id: 'hw-other', promotedAt: '2026-11-07T00:00:00Z', donorRefs: ['memory:z@9'] })
    const audit = rollbackResidue({
      proposals: [rolled, heir, other],
      libraryEntries: [entry('memory:a@1', 'hw-rolled'), entry('memory:b@2', 'hw-rolled'), entry('memory:z@9', 'hw-other')],
    })
    expect(audit).toMatchObject({ rolledBack: 1, componentEntries: 2, inheritedBy: 1, builtOnBy: 0, libraryProvided: true })
    expect(audit.rows[0]).toMatchObject({ proposalId: 'hw-rolled', componentEntries: 2, inheritedBy: ['hw-heir'], builtOnBy: [] })
    expect(audit.note).toContain('引用这些条目的现存后继 1 个')
    expect(audit.note).toContain('来源已回滚的零件不再提供给起草器')
    expect(audit.note).toContain('只列出，不自动撤回')
    expect(audit.note).not.toContain('起点建立在它们之上')
  })

  it('组件库未接入时条目数记未知，不按 0 计', () => {
    const rolled = successor({ id: 'hw-rolled', status: 'rolled_back' })
    const audit = rollbackResidue({ proposals: [rolled] })
    expect(audit.componentEntries).toBeNull()
    expect(audit.libraryProvided).toBe(false)
    expect(audit.note).toContain('未接入')
  })

  it('冠军链：后继的冠军记录以已回滚提案为前驱 → 列出，依据 champion', () => {
    const rolled = successor({ id: 'hw-r', status: 'rolled_back' })
    const heir = successor({ id: 'hw-s', promotedAt: '2026-11-06T00:00:00Z' })
    const chain = { ...championOf(heir), previousProposalId: 'hw-r', previousDigest: rolled.variants[0].digest }
    const audit = rollbackResidue({ proposals: [rolled, heir], champions: [chain] })
    expect(audit.rows[0].builtOnBy).toEqual([{ proposalId: 'hw-s', status: 'promoted', via: ['champion'] }])
    expect(audit).toMatchObject({ builtOnBy: 1, builtOnByOpen: 0 })
    expect(audit.note).toContain('起点建立在它们之上的提案 1 个（其中 0 个仍在途）')
  })

  it('起点摘要：后继创建时目标文件的摘要等于已回滚提案晋级时的选中摘要 → 列出，依据 base；对不上的不列', () => {
    const rolled = successor({ id: 'hw-r', status: 'rolled_back', applied: true, backupPath: '/tmp/r-tree.json' })
    const fromProduct = builtOn(rolled, 'hw-s')
    const unrelated = successor({ id: 'hw-u', promotedAt: '2026-11-07T00:00:00Z' })
    const audit = rollbackResidue({ proposals: [rolled, fromProduct, unrelated] })
    expect(audit.rows[0].builtOnBy).toEqual([{ proposalId: 'hw-s', status: 'promoted', via: ['base'] }])
  })

  it('两条依据同时成立时合并成一条；在途提案也列并计入「仍在途」，已晋级的排在前面', () => {
    const rolled = successor({ id: 'hw-r', status: 'rolled_back' })
    const heir = builtOn(rolled, 'hw-s')
    const draft = { ...builtOn(rolled, 'hw-d'), status: 'draft' as const, promotion: null, composition: null, approval: null }
    const chain = { ...championOf(heir), previousProposalId: 'hw-r' }
    const audit = rollbackResidue({ proposals: [rolled, heir, draft], champions: [chain] })
    expect(audit.rows[0].builtOnBy).toEqual([
      { proposalId: 'hw-s', status: 'promoted', via: ['base', 'champion'] },
      { proposalId: 'hw-d', status: 'draft', via: ['base'] },
    ])
    expect(audit).toMatchObject({ builtOnBy: 2, builtOnByOpen: 1 })
    expect(audit.note).toContain('起点建立在它们之上的提案 2 个（其中 1 个仍在途）')
  })

  it('多文件候选：比较同路径文件的摘要；拿整棵树的摘要去比单文件摘要不算命中', () => {
    const files = [
      { path: 'profiles/p1/SOUL.md', content: 'tree soul', digest: sha256('tree soul') },
      { path: 'skills/s1/SKILL.md', content: 'tree skill', digest: sha256('tree skill') },
    ]
    const tree = { id: 'v1', label: 'A', content: '', digest: treeDigest(files, []), diffSummary: diffSummary('base', 'base'), files }
    const rolled: Proposal = {
      ...successor({ id: 'hw-tree', status: 'rolled_back' }),
      variants: [tree],
      composition: { variantId: 'v1', digest: tree.digest, rationale: 'x', actor: 'reviewer', at: 'now' },
      promotion: { actor: 'operator', at: 'now', digest: tree.digest, applied: true, backupPath: '/tmp/tree.json' },
    }
    const onSkillFile: Proposal = {
      ...successor({ id: 'hw-s1' }),
      targetPath: 'skills/s1/SKILL.md',
      base: { content: 'tree skill', digest: sha256('tree skill'), revision: null, exists: true },
    }
    const treeDigestAsFileDigest: Proposal = {
      ...successor({ id: 'hw-s2' }),
      base: { content: 'x', digest: tree.digest, revision: null, exists: true },
    }
    const audit = rollbackResidue({ proposals: [rolled, onSkillFile, treeDigestAsFileDigest] })
    expect(audit.rows[0].builtOnBy).toEqual([{ proposalId: 'hw-s1', status: 'promoted', via: ['base'] }])
  })

  it('被否决的后继不列，即使它的冠军记录仍指向前驱；起点建立在别的提案之上的不列', () => {
    const rolled = successor({ id: 'hw-r', status: 'rolled_back' })
    const rejected = { ...builtOn(rolled, 'hw-x'), status: 'rejected' as const }
    const chain = { ...championOf(rejected), previousProposalId: 'hw-r' }
    const audit = rollbackResidue({ proposals: [rolled, rejected], champions: [chain] })
    expect(audit.rows[0].builtOnBy).toEqual([])
    expect(audit.builtOnBy).toBe(0)
  })
})

describe('装配与集成', () => {
  it('空台账不编造数字', () => {
    const report = buildTrajectoryReport({ surfaces: [], proposals: [], champions: [] })
    expect(report.surfaces).toEqual([])
    expect(report.rollbackResidue.rolledBack).toBe(0)
    expect(report.note).toContain('不参与晋级判定')
  })

  it('进化报告：时间线含已回滚后继、未回滚轮数不变、收缩系数只用未回滚轮', () => {
    const s1 = successor({ id: 'hw-1', promotedAt: '2026-11-01T00:00:00Z', contrast: { passAt1Delta: 0.09 } })
    const s2 = successor({ id: 'hw-2', status: 'rolled_back', promotedAt: '2026-11-02T00:00:00Z', contrast: { passAt1Delta: 0.2 } })
    const s3 = successor({ id: 'hw-3', promotedAt: '2026-11-03T00:00:00Z', contrast: { passAt1Delta: 0.03 } })
    const s4 = successor({ id: 'hw-4', promotedAt: '2026-11-04T00:00:00Z', contrast: { passAt1Delta: 0.01 } })
    const report = evolutionReport(['system_prompt'], [s1, s2, s3, s4], [championOf(s1), championOf(s3), championOf(s4)])
    const surface = report.surfaces.find((s) => s.surfaceKey === 'system_prompt')!
    expect(surface.timeline.map((r) => [r.proposalId, r.rolledBack])).toEqual([
      ['hw-1', false], ['hw-2', true], ['hw-3', false], ['hw-4', false],
    ])
    expect(surface.rounds).toBe(3)
    expect(surface.rolledBack).toBe(1)

    const theory = report.theory!
    const stepIds = theory.trajectory!.surfaces.find((s) => s.surfaceKey === 'system_prompt')!.steps.map((s) => s.proposalId)
    expect(stepIds).toEqual(['hw-1', 'hw-2', 'hw-3', 'hw-4'])
    expect(theory.trajectory!.rollbackResidue.libraryProvided).toBe(false)
    // 回滚轮 hw-2 的增益 0.2 不进收缩系数估计：进了就是 4 轮，剔除后是 3 轮
    expect(theory.surfaces.find((s) => s.surfaceKey === 'system_prompt')!.decay.rounds).toBe(3)
    expect(theory.surfaces.find((s) => s.surfaceKey === 'system_prompt')!.decay.lastGain).toBe(0.01)
  })

  it('进化报告传入组件库条目后，回滚残留按库计数', () => {
    const rolled = successor({ id: 'hw-rolled', status: 'rolled_back' })
    const entry: ComponentEntry = {
      id: 'memory:a@1', kind: 'memory', name: 'a.md', surfaceKey: 'system_prompt', digest: sha256('a'), content: 'body',
      evidence: { proposalId: 'hw-rolled', variantId: 'v1', passAt1: 0.6, delta: 0.05 }, version: 1, promotedAt: '2026-11-01T00:00:00Z', promotedBy: 'reviewer',
    }
    const report = evolutionReport(['system_prompt'], [rolled], [], undefined, { libraryEntries: [entry] })
    expect(report.theory!.trajectory!.rollbackResidue).toMatchObject({ libraryProvided: true, componentEntries: 1, rolledBack: 1 })
  })

  it('评估条件指纹取评测运行的冻结值；运行没带的项记空', () => {
    expect(evaluatorOfRun({})).toEqual({ setHash: null, setRevision: null, judge: null })
    const judgeFingerprint = { models: ['judge-x'], backend: 'llm', tauYes: 0.7, tauNo: 0.3 }
    const out = evaluatorOfRun({ setHash: 'h1', setRevision: 2, judgeFingerprint })
    expect(out).toEqual({ setHash: 'h1', setRevision: 2, judge: judgeFingerprint })
    expect(out.judge!.models).not.toBe(judgeFingerprint.models)
  })
})
