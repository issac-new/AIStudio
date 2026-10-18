// overlay/observability 域：过程质量指标（2026-10-18 残余项③）。
//
// 源文《Spec as AIOS》的 Benchmark 口径：不只看任务是否完成，也看重复调用、
// 无效步骤、过长执行链、首过成功率与规范符合率。本模块从既有审计账与 qgate
// run 计算代理指标——代理关系写明，不把代理值冒充语义判定。
import { queryToolExecAudit, type ToolExecAuditEntry } from '../toolpipeline/tool-hooks'
import { readQgateRunRows, resolveQgateRunsDir, type QgateRunRow } from '../expcandidates/qgate-ingest'

export interface ProcessQualityInputs {
  days: number
  auditEntries: ToolExecAuditEntry[]
  qgateRuns: QgateRunRow[]
  /** 长链阈值（单 run 工具调用数超过即算长链）。 */
  longChainSteps?: number
}

export interface ProcessQualityMetrics {
  runs: number
  toolCalls: number
  failedCalls: number
  /** 重复调用数 / 工具调用数（审计 duplicate 标记口径）。 */
  duplicateCallRate: number | null
  /** 失败工具调用 / 工具调用数（“无效步骤”代理，不是语义判定）。 */
  toolFailureRate: number | null
  /** 单 run 调用数 > 阈值的 run 占比。 */
  longChainRate: number | null
  /** 零失败工具调用的 run 占比。 */
  firstPassSuccessRate: number | null
  /** qgate PASS / (PASS+FAIL+CONDITIONAL)，不含 WAIVED/N/A。 */
  specComplianceRate: number | null
}

export interface ProcessQualityReport {
  days: number
  metrics: ProcessQualityMetrics
  steps: { p50: number | null; p95: number | null; max: number | null }
  qgate: { total: number; pass: number; fail: number; conditional: number; other: number }
  notes: string[]
}

function runKeyOf(entry: ToolExecAuditEntry): string | null {
  return entry.runId || entry.sessionId || null
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

/** 纯组装：审计 entries + qgate runs → 指标（不 IO）。 */
export function buildProcessQuality(inputs: ProcessQualityInputs): ProcessQualityReport {
  const longChainSteps = Math.max(1, inputs.longChainSteps ?? 20)
  const pre = inputs.auditEntries.filter((e) => e.phase === 'pre')
  const post = inputs.auditEntries.filter((e) => e.phase === 'post')
  const duplicates = pre.filter((e) => e.duplicate).length
  const failed = post.filter((e) => e.ok === false).length

  const perRun = new Map<string, { calls: number; failed: number }>()
  for (const e of pre) {
    const key = runKeyOf(e)
    if (!key) continue
    const bucket = perRun.get(key) ?? { calls: 0, failed: 0 }
    bucket.calls += 1
    perRun.set(key, bucket)
  }
  for (const e of post) {
    const key = runKeyOf(e)
    if (!key || e.ok !== false) continue
    const bucket = perRun.get(key) ?? { calls: 0, failed: 0 }
    bucket.failed += 1
    perRun.set(key, bucket)
  }
  const runs = perRun.size
  const steps = [...perRun.values()].map((r) => r.calls).sort((a, b) => a - b)
  const longRuns = [...perRun.values()].filter((r) => r.calls > longChainSteps).length
  const firstPassRuns = [...perRun.values()].filter((r) => r.failed === 0).length

  const qgate = { total: 0, pass: 0, fail: 0, conditional: 0, other: 0 }
  for (const row of inputs.qgateRuns) {
    qgate.total += 1
    if (row.verdict === 'PASS') qgate.pass += 1
    else if (row.verdict === 'FAIL') qgate.fail += 1
    else if (row.verdict === 'CONDITIONAL') qgate.conditional += 1
    else qgate.other += 1
  }
  const specDenominator = qgate.pass + qgate.fail + qgate.conditional

  const ratio = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 10000) / 10000 : null)

  return {
    days: inputs.days,
    metrics: {
      runs,
      toolCalls: pre.length,
      failedCalls: failed,
      duplicateCallRate: ratio(duplicates, pre.length),
      toolFailureRate: ratio(failed, post.length),
      longChainRate: ratio(longRuns, runs),
      firstPassSuccessRate: ratio(firstPassRuns, runs),
      specComplianceRate: ratio(qgate.pass, specDenominator),
    },
    steps: {
      p50: percentile(steps, 50),
      p95: percentile(steps, 95),
      max: steps.length ? steps[steps.length - 1] : null,
    },
    qgate,
    notes: [
      '工具失败率是“无效步骤”的代理指标，不是语义正确性判定。',
      '重复调用率来自审计的连续同签名标记，只覆盖 studio ekko runtime。',
      `长链阈值=${longChainSteps} 次工具调用；qgate 符合率不含 WAIVED/NOT_APPLICABLE。`,
    ],
  }
}

/** 采集：审计账 + qgate run 文件，全部 fail-soft。 */
export function collectProcessQuality(days = 7): ProcessQualityReport {
  const audit = queryToolExecAudit({ days, limit: 5_000 })
  const qgateDir = resolveQgateRunsDir()
  const cutoff = Date.now() - days * 86_400_000
  const qgateRuns = readQgateRunRows(qgateDir).filter((r) => !r.startedAt || r.startedAt >= cutoff)
  const report = buildProcessQuality({ days, auditEntries: audit.entries, qgateRuns })
  if (audit.total > audit.entries.length) {
    report.notes.push(`窗口内审计 ${audit.total} 行，仅统计最近 ${audit.entries.length} 行（采样口径）`)
  }
  return report
}
