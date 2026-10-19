// overlay/obsalerts 域：告警采集装配（2026-10-19 观测层轮）。
//
// 数据源：trace 行（collectTraceRows，按 now-24h 切当前窗/基线窗）+ eval 运行
// （listRuns 的 passAt1）。全部 fail-soft；测试可注入 rows/evalRuns 绕过 IO。
import { collectTraceRows } from '../obssignals/collect'
import { summarizeWindow, dayKeyOf, type ObsSpanRow } from '../obssignals/signals'
import { listRuns } from '../eval/store'
import type { EvalRun } from '../eval/types'
import {
  buildObsAlerts,
  thresholdsFromEnv,
  type ObsAlertsReport,
  type ObsAlertThresholds,
} from './alerts'

export interface ObsAlertsCollectResult extends ObsAlertsReport {
  ok: boolean
  baselineDays: number
  windowDays: number
  currentFrom: number
  sources: {
    traceRows: number
    traceFiles: number
    evalRunsCurrent: number
    evalRunsBaseline: number
  }
  notes: string[]
}

function meanOf(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** 装配 + 判定。baselineDays=基线天数（默认 7）；当前窗固定 24h。 */
export function collectObsAlerts(
  baselineDays = 7,
  opts: {
    dir?: string
    now?: number
    rows?: ObsSpanRow[]
    evalRuns?: EvalRun[]
    thresholds?: Partial<ObsAlertThresholds>
  } = {},
): ObsAlertsCollectResult {
  const now = opts.now ?? Date.now()
  const windowDays = baselineDays + 1
  const currentFromSec = (now - 86_400_000) / 1000

  let rows: ObsSpanRow[]
  let files = 0
  const notes: string[] = []
  if (opts.rows) {
    rows = opts.rows
  } else {
    const collected = collectTraceRows(windowDays, { dir: opts.dir, now })
    rows = collected.rows
    files = collected.files
    notes.push(...collected.notes)
  }

  const currentRows = rows.filter((r) => Number(r.ended_at ?? r.started_at ?? 0) >= currentFromSec)
  const baselineRows = rows.filter((r) => {
    const ts = Number(r.ended_at ?? r.started_at ?? 0)
    return ts > 0 && ts < currentFromSec
  })
  const baselineEffectiveDays = new Set(
    baselineRows
      .map((r) => r.ended_at ?? r.started_at)
      .filter((ts): ts is number => Number.isFinite(ts))
      .map((ts) => dayKeyOf(ts)),
  ).size

  // eval 质量：passAt1 非空的运行，当前窗/基线窗分别取均值
  const evalRuns = opts.evalRuns ?? safeListRuns(notes)
  const passValues = (runs: EvalRun[]): number[] =>
    runs.map((r) => r.aggregates?.passAt1).filter((v): v is number => typeof v === 'number')
  const currentRuns = evalRuns.filter((r) => typeof r.createdAt === 'number' && r.createdAt >= now - 86_400_000)
  const baselineEvalRuns = evalRuns.filter(
    (r) => typeof r.createdAt === 'number' && r.createdAt < now - 86_400_000 && r.createdAt >= now - windowDays * 86_400_000,
  )
  const currentQualityMean = meanOf(passValues(currentRuns))
  const baselineQualityMean = meanOf(passValues(baselineEvalRuns))

  const thresholds = { ...thresholdsFromEnv(), ...opts.thresholds }
  const report = buildObsAlerts({
    current: summarizeWindow(currentRows),
    baseline: summarizeWindow(baselineRows),
    baselineDays: baselineEffectiveDays,
    currentQualityMean,
    baselineQualityMean,
    baselineQualityRuns: passValues(baselineEvalRuns).length,
    thresholds,
  })

  return {
    ...report,
    ok: true,
    baselineDays,
    windowDays,
    currentFrom: Math.round(currentFromSec),
    sources: {
      traceRows: rows.length,
      traceFiles: files,
      evalRunsCurrent: passValues(currentRuns).length,
      evalRunsBaseline: passValues(baselineEvalRuns).length,
    },
    notes,
  }
}

function safeListRuns(notes: string[]): EvalRun[] {
  try {
    return listRuns()
  } catch (e) {
    notes.push(`eval 运行读取失败：${e instanceof Error ? e.message : String(e)}`)
    return []
  }
}
