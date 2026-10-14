/**
 * 流程架构体检留痕面（bpa audit）：治理体检历史快照 + 架构评审周期到期判定。
 * 文章 §7.3 第五步「评估—改进—再评估」的体检侧闭环：体检不是看过就丢，
 * 每次落账（时间+高危/注意数+覆盖率），reviewCycleDays 由沉睡参数变活约束。
 * 纯文件面 fail-soft（skillgov/bpa-store 同款纪律）。env：BPA_AUDIT_STORE 覆盖。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { BpaValidationReport } from './bpa-types'

export interface BpaAuditEntry {
  at: number
  nodes: number
  l3Count: number
  high: number
  medium: number
  ownerCoverage: number
  kpiCoverage: number
  /** 触发源：validate=手动体检 / write=写操作附带快照 */
  source: 'validate' | 'write'
}

const HISTORY_LIMIT = 50

export function auditFile(): string {
  return process.env.BPA_AUDIT_STORE?.trim()
    ? resolve(process.env.BPA_AUDIT_STORE.replace(/^~/, homedir()))
    : join(homedir(), '.hermes-web-ui', 'overlay', 'bpa-audit.json')
}

export function readAudit(): BpaAuditEntry[] {
  try {
    const raw = JSON.parse(readFileSync(auditFile(), 'utf8')) as { history?: BpaAuditEntry[] }
    return Array.isArray(raw.history) ? raw.history : []
  } catch {
    return []
  }
}

export function recordAudit(report: BpaValidationReport, source: BpaAuditEntry['source']): BpaAuditEntry[] {
  const entry: BpaAuditEntry = {
    at: report.checkedAt,
    nodes: report.nodes,
    l3Count: report.l3Count,
    high: report.bySeverity.high,
    medium: report.bySeverity.medium,
    ownerCoverage: report.ownerCoverage,
    kpiCoverage: report.kpiCoverage,
    source,
  }
  const history = [...readAudit(), entry].slice(-HISTORY_LIMIT)
  const file = auditFile()
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify({ history }, null, 2) + '\n', 'utf8')
  return history
}

export interface ReviewDue {
  /** 距上次体检的天数（无记录=null） */
  daysSince: number | null
  /** 距评审到期的天数（负数=已逾期 |x| 天；null=无基线） */
  daysUntilDue: number | null
  reviewCycleDays: number
}

/** 评审周期判定：以最近一次体检为锚，reviewCycleDays 天后到期（文章治理 YAML：reviewCycleDays: 180）。 */
export function reviewDue(reviewCycleDays: number, now = Date.now()): ReviewDue {
  const history = readAudit()
  const last = history.length > 0 ? history[history.length - 1] : null
  if (!last) return { daysSince: null, daysUntilDue: null, reviewCycleDays }
  const daysSince = Math.floor((now - last.at) / 86_400_000)
  return { daysSince, daysUntilDue: reviewCycleDays - daysSince, reviewCycleDays }
}
