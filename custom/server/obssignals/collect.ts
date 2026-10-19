// overlay/obssignals 域：trace 目录采集（2026-10-19 观测层轮）。
//
// 只读扫描 trace JSONL 目录，窗口=近 N 天（按文件 mtime 预筛 + 行时间戳精滤），
// 全部 fail-soft：目录缺席/坏行/坏文件不炸聚合，如实记 notes。
// OTel 格式文件（otelFormat 标记、无 type/kind 行）本轮不参与聚合，如实标注。
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildObsSignals, type ObsSignalsReport, type ObsSpanRow } from './signals'

/** 采集上限：单文件行数与总行数双闸，超限采样口径如实标注。 */
const MAX_ROWS_PER_FILE = 20_000
const MAX_ROWS_TOTAL = 100_000

export interface TraceRowsResult {
  rows: ObsSpanRow[]
  files: number
  skippedOtelFiles: number
  truncated: boolean
  notes: string[]
}

export interface CollectResult {
  report: ObsSignalsReport
  files: number
  rows: number
  skippedOtelFiles: number
  truncated: boolean
}

export function tracesDir(): string {
  const runDir = process.env.HERMES_RUN_TRACE_DIR?.trim()
  if (runDir) return resolve(runDir.replace(/^~/, homedir()))
  const env = process.env.HERMES_TRACES_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes', 'traces')
}

/** 行级采集：窗口内 legacy 格式行全量（受双闸上限），供信号聚合与告警共用。 */
export function collectTraceRows(days = 7, opts: { dir?: string; now?: number } = {}): TraceRowsResult {
  const dir = opts.dir ?? tracesDir()
  const now = opts.now ?? Date.now()
  const cutoffMs = now - days * 86_400_000
  const cutoffSec = cutoffMs / 1000
  const notes: string[] = []
  const rows: ObsSpanRow[] = []
  let files = 0
  let skippedOtelFiles = 0
  let truncated = false

  if (!existsSync(dir)) {
    notes.push(`trace 目录缺席：${dir}`)
    return { rows, files: 0, skippedOtelFiles, truncated, notes }
  }

  let names: string[] = []
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.jsonl'))
  } catch {
    notes.push(`trace 目录不可读：${dir}`)
    return { rows, files: 0, skippedOtelFiles, truncated, notes }
  }

  for (const name of names) {
    if (rows.length >= MAX_ROWS_TOTAL) {
      truncated = true
      break
    }
    const file = join(dir, name)
    try {
      const stat = statSync(file)
      if (stat.mtimeMs < cutoffMs) continue
      const text = readFileSync(file, 'utf8')
      let fileRows = 0
      let fileUsed = 0
      for (const line of text.split('\n')) {
        if (!line) continue
        if (fileRows >= MAX_ROWS_PER_FILE) {
          truncated = true
          break
        }
        if (rows.length >= MAX_ROWS_TOTAL) {
          truncated = true
          break
        }
        let row: ObsSpanRow
        try {
          row = JSON.parse(line) as ObsSpanRow
        } catch {
          continue
        }
        fileRows += 1
        if ((row as { otelFormat?: boolean }).otelFormat === true) continue
        const ts = row.ended_at ?? row.started_at
        // header 用 started_at；无时间戳行（坏行）不进入窗口统计
        if (!Number.isFinite(ts) || Number(ts) < cutoffSec) continue
        rows.push(row)
        fileUsed += 1
      }
      if (fileRows > 0) {
        files += 1
        if (fileUsed === 0 && /"otelFormat":\s*true/.test(text.slice(0, 4096))) skippedOtelFiles += 1
      }
    } catch {
      notes.push(`trace 文件读取失败：${name}`)
    }
  }

  if (skippedOtelFiles > 0) {
    notes.push(`${skippedOtelFiles} 个 OTel 格式 trace 未参与聚合（本轮聚合仅覆盖 legacy 格式）。`)
  }
  if (truncated) {
    notes.push(`采集达上限（单文件 ${MAX_ROWS_PER_FILE} 行 / 共 ${MAX_ROWS_TOTAL} 行），为采样口径。`)
  }
  return { rows, files, skippedOtelFiles, truncated, notes }
}

/** 采集 + 聚合。窗口内无文件/目录缺席 → available:false，不造数。 */
export function collectObsSignals(days = 7, opts: { dir?: string; now?: number } = {}): CollectResult {
  const { rows, files, skippedOtelFiles, truncated, notes } = collectTraceRows(days, opts)
  const report = buildObsSignals(rows, { days })
  report.notes.push(...notes)
  return { report, files, rows: rows.length, skippedOtelFiles, truncated }
}
