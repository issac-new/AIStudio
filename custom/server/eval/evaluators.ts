// overlay[eval] 评估器三角互证审计（百度评测范式轮 §3）。
//
// 规则打底 / 裁判补位 / 人工兜底三者的覆盖、冲突、误杀与可审计性。
// 关键纪律：只增加审计与反事实读数，不改既有判分口径——unknown 在正式聚合里
// 仍然计为不通过（发布门禁契约不变）。保守口径只是"若按文章规则放宽，会多出
// 多少通过"的反事实，用于度量误杀空间，页面必须标注不作门禁。
import type { Attempt, Binary, EvalRun, EvalSet, VerdictSource } from './types'

export interface PolicyReading {
  passAt1: number | null
  passAtK: number | null
}

export interface EvaluatorAudit {
  runId: string
  verdictTotal: number
  bySource: Record<VerdictSource, number>
  conflicts: number
  /** 判词可审计率（reason 非空的判词占比）。 */
  audit: { withReason: number; total: number; ratio: number }
  unknown: { total: number; bySource: Partial<Record<VerdictSource, number>>; s1Ratio: number }
  judge: { online: boolean; models: string[]; verdictsWithP: number; meanP: number | null }
  human: {
    overrides: number
    /** 机判 no/unknown → 人工 yes：误杀候选（文章最在意的方向）。 */
    falseKillCandidates: number
    /** 机判 yes → 人工 no：假通过候选。 */
    falsePassCandidates: number
  }
  policy: {
    strict: PolicyReading
    conservative: PolicyReading
    delta: { passAt1: number | null; passAtK: number | null }
    note: string
  }
  riskLevel: 'ok' | 'watch' | 'high'
  notes: string[]
}

const ZERO_SOURCES: Record<VerdictSource, number> = { s0: 0, s1: 0, 's0+s1': 0, human: 0 }

function ratioOf(passed: number, total: number): number | null {
  return total === 0 ? null : passed / total
}

function policyOf(set: EvalSet, run: EvalRun, conservative: boolean): PolicyReading {
  const taskById = new Map(set.tasks.map((t) => [t.id, t]))
  const passedAttempt = new Map<Attempt, boolean>()
  for (const attempt of run.attempts) {
    const task = taskById.get(attempt.taskId)
    if (!task) {
      passedAttempt.set(attempt, false)
      continue
    }
    const verdictById = new Map(attempt.verdicts.map((v) => [v.assertionId, v]))
    let ok = task.rubric.length > 0
    for (const assertion of task.rubric) {
      const verdict = verdictById.get(assertion.id)
      let value: Binary = verdict?.value ?? 'unknown'
      // 保守口径只放宽「裁判没给出结论」的情形（S1 参与且 unknown）；
      // S0 阈值无数据的 unknown 是数据缺口，放宽等于掩盖缺口，不放。
      if (conservative && value === 'unknown' && verdict && (verdict.source === 's1' || verdict.source === 's0+s1')) {
        value = assertion.expect
      }
      if (value !== assertion.expect) {
        ok = false
        break
      }
    }
    if (task.outcome) {
      if (!attempt.outcome || !attempt.outcome.ok) ok = false
    }
    passedAttempt.set(attempt, ok)
  }

  const taskIds = set.tasks.map((t) => t.id)
  let firstDenom = 0
  let firstPass = 0
  let anyPass = 0
  for (const taskId of taskIds) {
    const samples = run.attempts.filter((a) => a.taskId === taskId)
    const first = samples.find((a) => a.sampleIdx === 1)
    if (first) {
      firstDenom += 1
      if (passedAttempt.get(first)) firstPass += 1
    }
    if (samples.some((a) => passedAttempt.get(a))) anyPass += 1
  }
  return {
    passAt1: ratioOf(firstPass, firstDenom),
    passAtK: ratioOf(anyPass, taskIds.length),
  }
}

/** 三角互证审计（纯函数）。 */
export function evaluatorAuditOf(set: EvalSet, run: EvalRun): EvaluatorAudit {
  const bySource: Record<VerdictSource, number> = { ...ZERO_SOURCES }
  const unknownBySource: Partial<Record<VerdictSource, number>> = {}
  let conflicts = 0
  let withReason = 0
  let verdictTotal = 0
  let unknownTotal = 0
  let pSum = 0
  let withP = 0
  let overrides = 0
  let falseKills = 0
  let falsePass = 0

  for (const attempt of run.attempts) {
    for (const verdict of attempt.verdicts) {
      verdictTotal += 1
      bySource[verdict.source] = (bySource[verdict.source] ?? 0) + 1
      if (verdict.conflict) conflicts += 1
      if (verdict.reason && verdict.reason.trim()) withReason += 1
      if (verdict.value === 'unknown') {
        unknownTotal += 1
        unknownBySource[verdict.source] = (unknownBySource[verdict.source] ?? 0) + 1
      }
      if (typeof verdict.p === 'number' && Number.isFinite(verdict.p)) {
        withP += 1
        pSum += verdict.p
      }
      if (verdict.source === 'human' && verdict.previousValue) {
        overrides += 1
        if (verdict.previousValue !== 'yes' && verdict.value === 'yes') falseKills += 1
        if (verdict.previousValue === 'yes' && verdict.value === 'no') falsePass += 1
      }
    }
  }

  const s1Involved = (bySource.s1 ?? 0) + (bySource['s0+s1'] ?? 0)
  const s1Unknown = (unknownBySource.s1 ?? 0) + (unknownBySource['s0+s1'] ?? 0)
  const s1Ratio = ratioOf(s1Unknown, s1Involved) ?? 0

  const strict = policyOf(set, run, false)
  const conservative = policyOf(set, run, true)
  const deltaOf = (a: number | null, b: number | null): number | null =>
    a === null || b === null ? null : b - a

  const notes: string[] = []
  if (s1Involved === 0) notes.push('本运行没有裁判判词（可能全 S0 或判定端离线），三角互证只剩规则与人工。')
  if (s1Ratio > 0) notes.push(`裁判 abstain（unknown）占裁判判词的 ${Math.round(s1Ratio * 100)}%；unknown 在正式口径计为不通过。`)
  if (overrides === 0) notes.push('暂无人工裁决，误杀/假通过方向无法度量——这是审计缺口，不是零风险。')
  if (withReason < verdictTotal) notes.push(`判词审计理由覆盖 ${withReason}/${verdictTotal}：历史判词没有 reason 字段，新判词起有。`)
  const conservativeDelta = deltaOf(strict.passAtK, conservative.passAtK)
  if (conservativeDelta !== null && conservativeDelta > 0) {
    notes.push(`保守口径（裁判未明确判负即算通过）pass@k 高 ${(conservativeDelta * 100).toFixed(1)} 个百分点，仅作误杀风险参考。`)
  }

  const riskLevel: EvaluatorAudit['riskLevel'] =
    falseKills > 0 || s1Ratio > 0.3 ? 'high' : s1Ratio > 0.15 || conflicts > 0 || (conservativeDelta ?? 0) > 0.05 ? 'watch' : 'ok'

  return {
    runId: run.id,
    verdictTotal,
    bySource,
    conflicts,
    audit: { withReason, total: verdictTotal, ratio: ratioOf(withReason, verdictTotal) ?? 0 },
    unknown: { total: unknownTotal, bySource: unknownBySource, s1Ratio },
    judge: {
      online: run.attempts.every((a) => a.judgeMeta?.online !== false),
      models: run.attempts.find((a) => a.judgeMeta?.models?.length)?.judgeMeta?.models ?? [],
      verdictsWithP: withP,
      meanP: withP === 0 ? null : pSum / withP,
    },
    human: { overrides, falseKillCandidates: falseKills, falsePassCandidates: falsePass },
    policy: {
      strict,
      conservative,
      delta: {
        passAt1: deltaOf(strict.passAt1, conservative.passAt1),
        passAtK: deltaOf(strict.passAtK, conservative.passAtK),
      },
      note: 'strict=现行正式口径（unknown 计不通过，门禁以此为准）；conservative=反事实读数（裁判 unknown 视为通过），仅用于误杀风险参考。',
    },
    riskLevel,
    notes,
  }
}
