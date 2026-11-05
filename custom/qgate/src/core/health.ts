// 健康体检（v0.4 治理可信度修复）：把「门存在」与「门有效」分开。
// 判定代数不变（保留 GateVerdict 兼容），本模块只读 run/state，回答四个问题：
//   1) 这门最近一次跑了吗（never/stale/fresh）；
//   2) 跑出来的 verdict 是什么（PASS/FAIL/INCONCLUSIVE/CONDITIONAL）；
//   3) CONDITIONAL 是「证据不足被容忍」还是「执行器报错」（executionStatus/degradedReason）；
//   4) 同一门连续多少次没有 PASS（state.json 只有最新一条，连续计数必须扫 runs）。
// 纯函数：不写盘、不执行门、不改 state；调用方决定退出码与展示。

import type { GateRun, GateSpec } from './types.js'
import type { ResolvedProfile } from './profile.js'
import { effectivePolicy, isBlockingVerdict } from './profile.js'

export type HealthScope = 'pre-push' | 'release' | 'all'
export type HealthState = 'ok' | 'degraded' | 'skip' | 'stale' | 'never' | 'fail' | 'inconclusive'

export interface HealthGateRow {
  gateId: string
  domain: string
  verdict: GateRun['verdict'] | 'NEVER'
  executionStatus?: GateRun['executionStatus']
  degradedReason?: GateRun['degradedReason']
  health: HealthState
  freshness: 'fresh' | 'stale' | 'never'
  lastPassAt?: number
  consecutiveNonPass: number
  consecutiveBreach: boolean
  blocking: boolean
  reason?: string
}

export interface HealthReport {
  scope: HealthScope
  generatedAt: number
  gates: HealthGateRow[]
  summary: Record<HealthState, number>
  failOn: HealthState[]
  exitCode: 0 | 1
}

export interface HealthStateEntry {
  runId: string
  verdict: GateRun['verdict']
  startedAt: number
  executionStatus?: GateRun['executionStatus']
  degradedReason?: GateRun['degradedReason']
}

export interface HealthInput {
  gates: readonly GateSpec[]
  resolved: ResolvedProfile
  state: Record<string, HealthStateEntry>
  runs: readonly GateRun[]
  workspace: string
  scope: HealthScope
  now?: number
  maxAgeHours?: number
  consecutiveThreshold?: number
  /** pre-push/release 默认拦 degraded/fail/inconclusive/stale；--require-fresh 追加 never/skip。 */
  failOn?: HealthState[]
}

const DEFAULT_FAIL_ON: HealthState[] = ['degraded', 'fail', 'inconclusive', 'stale']

/** 健康体检的门池：pre-push 只看 L0（与 pre-push 实际执行面一致）；
    release 只看全量测试门（L0 由 pre-push 负责，发布不重复跑 L0）；all 看调用方传入的全部启用门。 */
export function gatesForScope(gates: readonly GateSpec[], scope: HealthScope): GateSpec[] {
  if (scope === 'all') return [...gates]
  if (scope === 'pre-push') return gates.filter((g) => g.spec.domain === 'L0')
  return gates.filter((g) => g.metadata.id === 'engineering.basic-check')
}

function consecutiveNonPass(runs: readonly GateRun[]): number {
  let n = 0
  for (const run of runs) {
    if (run.verdict === 'PASS') break
    n += 1
  }
  return n
}

function classify(
  run: GateRun | undefined,
  freshness: 'fresh' | 'stale' | 'never',
): { health: HealthState; reason?: string } {
  if (!run) return { health: 'never', reason: 'no-run-recorded' }
  if (freshness === 'stale') return { health: 'stale', reason: 'evidence-stale' }
  if (run.verdict === 'FAIL') return { health: 'fail', reason: run.failureSummary ?? 'gate-failed' }
  if (run.verdict === 'INCONCLUSIVE') return { health: 'inconclusive', reason: run.failureSummary ?? 'inconclusive' }
  if (run.verdict === 'CONDITIONAL') {
    // v0.4：优先看 executionStatus；旧 run 无字段时按 legacy-conditional 保守判 degraded，
    // 不把「不知道什么原因」当成 ok。
    if (run.executionStatus === 'error') return { health: 'degraded', reason: run.degradedReason ?? 'executor-error' }
    if (run.executionStatus === 'degraded') return { health: 'degraded', reason: run.degradedReason ?? 'degraded' }
    if (run.executionStatus === 'skipped') return { health: 'skip', reason: run.degradedReason ?? 'insufficient-evidence' }
    return { health: 'degraded', reason: 'legacy-conditional-without-execution-status' }
  }
  if (run.verdict === 'NOT_APPLICABLE') return { health: 'skip', reason: 'not-applicable' }
  // PASS / WAIVED：WAIVED 是显式豁免，不是 OK 的等价物；这里只表示「判定链可继续」。
  return { health: 'ok', reason: run.verdict === 'WAIVED' ? 'waived-by-exception' : undefined }
}

export function assessHealth(input: HealthInput): HealthReport {
  const now = input.now ?? Date.now()
  const scopeGates = gatesForScope(input.gates, input.scope)
  const failOn = input.failOn ?? DEFAULT_FAIL_ON
  const maxAgeHours = input.maxAgeHours ?? 24
  const summary: Record<HealthState, number> = { ok: 0, degraded: 0, skip: 0, stale: 0, never: 0, fail: 0, inconclusive: 0 }

  const gates: HealthGateRow[] = scopeGates.map((g) => {
    const policy = effectivePolicy(g, input.resolved)
    const entry = input.state[g.metadata.id]
    const run = entry ? input.runs.find((r) => r.runId === entry.runId) : undefined
    const gateRuns = input.runs
      .filter((r) => r.gateId === g.metadata.id)
      .sort((a, b) => b.startedAt - a.startedAt)
    const lastPassAt = gateRuns.find((r) => r.verdict === 'PASS')?.startedAt
    const consecutive = consecutiveNonPass(gateRuns)
    let freshness: 'fresh' | 'stale' | 'never' = 'never'
    if (run) {
      // 健康体检用「年龄」而非输入快照：大 glob 门（custom/**）的快照必然截断，
      // isFresh 对截断快照 fail-closed 判 stale，会让刚跑完的门也显示 stale。
      // 严格新鲜度仍由 `status --fresh`（输入快照逐项比对）负责；health 只回答
      // 「最近 maxAgeHours 内跑过吗、跑出来的判定是什么」。
      const ageH = (now - run.startedAt) / 3_600_000
      freshness = ageH <= maxAgeHours ? 'fresh' : 'stale'
    }
    const { health, reason } = classify(run, freshness)
    summary[health] += 1
    const breach = input.consecutiveThreshold !== undefined && consecutive >= input.consecutiveThreshold
    return {
      gateId: g.metadata.id,
      domain: g.spec.domain,
      verdict: run?.verdict ?? 'NEVER',
      executionStatus: run?.executionStatus,
      degradedReason: run?.degradedReason,
      health,
      freshness,
      lastPassAt,
      consecutiveNonPass: consecutive,
      consecutiveBreach: breach,
      blocking: isBlockingVerdict(run?.verdict ?? 'INCONCLUSIVE', policy),
      reason,
    }
  })

  const exitCode: 0 | 1 = gates.some((g) => failOn.includes(g.health) || g.consecutiveBreach) ? 1 : 0
  return { scope: input.scope, generatedAt: now, gates, summary, failOn, exitCode }
}
