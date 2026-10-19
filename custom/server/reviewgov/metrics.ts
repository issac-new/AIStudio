// overlay/custom/server/reviewgov/metrics.ts
// 评审度量与回滚熔断（纯函数，无 IO）。
//
// 指标口径对齐 Anthropic 文章：
//   - 一轮通过率（65% → 78%）
//   - 5 轮以上占比（8.9% → 1.5%）
//   - 平均评审轮次（2.08 → 1.32）
//   - 每个变更的人工审批数、人工等待时间（等待时间由案例时间戳派生）
//   - 噪声率（作者判定 wrong/intentional/didnt_matter 的占比）
//   - 回滚率与事故数作为守门指标；抬头即触发熔断、收紧审批。
import { countEffectiveApprovals } from './policy'
import {
  DEFAULT_POLICY,
  type BreakerState,
  type ReviewCase,
  type ReviewEvalCase,
  type ReviewEvalRun,
  type ReviewMetrics,
  type ReviewPolicy,
  type ReviewSignal,
  type SignalKind,
} from './types'

export function evaluateBreaker(
  signals: ReviewSignal[],
  policy: ReviewPolicy = DEFAULT_POLICY,
  now = Date.now(),
): BreakerState {
  const cfg = policy.circuitBreaker
  const from = now - cfg.windowHours * 3600_000
  const inWindow = signals.filter((s) => s.at >= from && s.at <= now)
  const count = (kind: SignalKind) => inWindow.filter((s) => s.kind === kind).length
  const reverts = count('revert')
  const merges = count('merge')
  const incidents = count('incident')
  const revertRate = merges > 0 ? reverts / merges : null
  const reasons: string[] = []
  if (revertRate !== null && revertRate > cfg.revertRateThreshold) {
    reasons.push(`revert_rate：回滚率 ${(revertRate * 100).toFixed(1)}% 超过阈值 ${(cfg.revertRateThreshold * 100).toFixed(1)}%`)
  }
  if (cfg.incidentCountThreshold > 0 && incidents >= cfg.incidentCountThreshold) {
    reasons.push(`incidents：窗口内事故 ${incidents} 起达到阈值 ${cfg.incidentCountThreshold}`)
  }
  return {
    active: reasons.length > 0,
    windowHours: cfg.windowHours,
    from,
    to: now,
    reverts,
    merges,
    incidents,
    revertRate,
    reasons,
    evaluatedAt: now,
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[idx]
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

export function computeMetrics(
  cases: ReviewCase[],
  signals: ReviewSignal[],
  policy: ReviewPolicy = DEFAULT_POLICY,
  evalCases: ReviewEvalCase[] = [],
  now = Date.now(),
  latestEvalRun: ReviewEvalRun | null = null,
): ReviewMetrics {
  const rounds = cases.map((c) => c.rounds.length).filter((n) => n > 0)
  const passed = cases.filter((c) => c.state === 'ready' || c.state === 'merged')
  const firstRoundPass = passed.filter((c) => c.rounds.length === 1).length
  const humanApprovals = cases.map((c) => countEffectiveApprovals(c.approvals, c.headCommit).human)
  const waits = cases.map(humanWaitMs).filter((n): n is number => n !== null)
  const answered = cases.flatMap((c) => c.findings.filter((f) => f.answeredAt && f.resolution))
  const noisy = answered.filter((f) => f.resolution === 'wrong' || f.resolution === 'intentional' || f.resolution === 'didnt_matter')
  const allFindings = cases.flatMap((c) => c.findings)
  const preexisting = allFindings.filter((f) => f.origin === 'preexisting' || f.severity === 'preexisting')
  const openImportant = allFindings.filter(
    (f) => f.severity === 'important' && !f.deferred && (f.state === 'open' || f.state === 'answered'),
  )
  const deferredBacklog = allFindings.filter((f) => f.deferred && f.state === 'deferred')

  return {
    cases: cases.length,
    active: cases.filter((c) => c.state === 'open').length,
    merged: cases.filter((c) => c.state === 'merged').length,
    firstRoundPassRate: ratio(firstRoundPass, passed.length),
    meanRounds: rounds.length ? rounds.reduce((a, b) => a + b, 0) / rounds.length : null,
    p95Rounds: percentile(rounds, 0.95),
    fivePlusShare: ratio(rounds.filter((n) => n >= 5).length, rounds.length),
    humanApprovalsMedian: median(humanApprovals),
    humanWaitMedianMs: median(waits),
    noiseRate: ratio(noisy.length, answered.length),
    preexistingShare: ratio(preexisting.length, allFindings.length),
    deferredBacklog: deferredBacklog.length,
    openImportant: openImportant.length,
    evalCases: evalCases.length,
    evalRecall: latestEvalRun?.recall ?? null,
    evalPrecision: latestEvalRun?.precision ?? null,
    breaker: evaluateBreaker(signals, policy, now),
  }
}

/** 人工等待时间（毫秒）：案例创建到首个有效人工审批；无审批为 null。 */
export function humanWaitMs(c: ReviewCase): number | null {
  const firstHuman = c.approvals
    .filter((a) => a.actorKind === 'human' && a.decision === 'approve')
    .sort((a, b) => a.at - b.at)[0]
  return firstHuman ? Math.max(0, firstHuman.at - c.createdAt) : null
}
