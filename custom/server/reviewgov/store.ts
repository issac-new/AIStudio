// overlay/custom/server/reviewgov/store.ts
// 评审治理持久化（每案例一份 JSON + 信号账 + 评测案例账）。
//
// 存储根：HERMES_REVIEW_GOV_DIR > ~/.hermes-web-ui/review-gov
//   cases/<可读前缀>-<sha256 前 32 hex>.json
//   signals.json
//   eval-cases.json
//   eval-runs.json
//   nightly/<date>-<reportId>.json + nightly/latest.json
// 复用 review-store 的原子写与坏档隔离策略：tmp+rename，坏档改名
// .corrupt.<ts> 留档，不静默当"不存在"续写。
import { createHash, randomBytes } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { createCase, type OpenCaseInput } from './convergence'
import {
  DEFAULT_POLICY,
  type BreakerState,
  type NightlyReport,
  type ReviewCase,
  type ReviewEvalCase,
  type ReviewEvalRun,
  type ReviewPolicy,
  type ReviewSignal,
  type SignalKind,
} from './types'

const SIGNAL_CAP = 2000
const EVAL_CASE_CAP = 500
const EVAL_RUN_CAP = 100
const NIGHTLY_CAP = 60
const CASE_LIST_CAP = 500

export function reviewGovDir(): string {
  const env = process.env.HERMES_REVIEW_GOV_DIR?.trim()
  if (env) return resolve(env)
  return join(homedir(), '.hermes-web-ui', 'review-gov')
}

function casesDir(): string { return join(reviewGovDir(), 'cases') }
function signalsFile(): string { return join(reviewGovDir(), 'signals.json') }
function evalCasesFile(): string { return join(reviewGovDir(), 'eval-cases.json') }
function evalRunsFile(): string { return join(reviewGovDir(), 'eval-runs.json') }
function nightlyDir(): string { return join(reviewGovDir(), 'nightly') }

function stemOf(id: string): string {
  const readable = id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 32).replace(/^\.+/, '') || 'case'
  return `${readable}-${createHash('sha256').update(id).digest('hex').slice(0, 32)}`
}

export function caseFile(caseId: string): string {
  return join(casesDir(), `${stemOf(caseId)}.json`)
}

function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, file)
  } catch (err) {
    try { unlinkSync(tmp) } catch { /* 无残留 */ }
    throw err
  }
}

function quarantine(file: string, err: unknown): void {
  const archive = `${file}.corrupt.${Date.now()}`
  try { renameSync(file, archive) } catch { /* 只读介质等，留档失败不阻断 */ }
  console.warn(`[reviewgov-store] 文件解析失败，已留档 ${archive}：${err instanceof Error ? err.message : String(err)}`)
}

function isCaseShape(v: unknown): v is ReviewCase {
  const o = v as Partial<ReviewCase> | null
  return !!o && typeof o.caseId === 'string' && typeof o.title === 'string'
    && Array.isArray(o.rounds) && Array.isArray(o.findings) && Array.isArray(o.approvals)
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    if (existsSync(file)) quarantine(file, err)
    return null
  }
}

export function loadCase(caseId: string): ReviewCase | null {
  const file = caseFile(caseId)
  if (!existsSync(file)) return null
  const raw = readJson(file)
  if (!isCaseShape(raw) || raw.caseId !== caseId) {
    if (raw) quarantine(file, new Error('案例结构非法或身份不符'))
    return null
  }
  return raw
}

export function saveCase(c: ReviewCase): ReviewCase {
  mkdirSync(casesDir(), { recursive: true })
  writeJsonAtomic(caseFile(c.caseId), c)
  return c
}

export function listCases(limit = CASE_LIST_CAP): ReviewCase[] {
  const out: ReviewCase[] = []
  let names: string[] = []
  try {
    names = readdirSync(casesDir()).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  for (const name of names) {
    if (out.length >= limit) break
    const raw = readJson(join(casesDir(), name))
    if (isCaseShape(raw)) out.push(raw)
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 开案例（caseId 幂等：已存在则原样返回，不重算风险）。 */
export function openCase(
  input: OpenCaseInput,
  policy: ReviewPolicy = DEFAULT_POLICY,
  breaker: BreakerState | null = null,
  now = Date.now(),
): ReviewCase {
  const existing = loadCase(input.caseId)
  if (existing) return existing
  const rec = createCase(input, policy, breaker, now)
  return saveCase(rec)
}

export function listSignals(limit = SIGNAL_CAP): ReviewSignal[] {
  const raw = readJson(signalsFile())
  if (!Array.isArray(raw)) return []
  return (raw as ReviewSignal[]).filter((s) => s && typeof s.signalId === 'string' && typeof s.at === 'number').slice(0, limit)
}

export function appendSignal(
  input: { kind: SignalKind; caseId?: string; note?: string; at?: number },
  now = Date.now(),
): ReviewSignal {
  const signal: ReviewSignal = {
    signalId: `s-${randomBytes(6).toString('hex')}`,
    kind: input.kind,
    at: input.at ?? now,
    caseId: input.caseId,
    note: input.note ? [...input.note].slice(0, 1000).join('') : undefined,
  }
  const next = [signal, ...listSignals()].slice(0, SIGNAL_CAP)
  mkdirSync(reviewGovDir(), { recursive: true })
  writeJsonAtomic(signalsFile(), next)
  return signal
}

export function listEvalCases(): ReviewEvalCase[] {
  const raw = readJson(evalCasesFile())
  if (!Array.isArray(raw)) return []
  return (raw as ReviewEvalCase[]).filter((e) => e && typeof e.evalCaseId === 'string')
}

export function appendEvalCase(
  input: Omit<ReviewEvalCase, 'evalCaseId' | 'createdAt'> & { evalCaseId?: string; createdAt?: number },
  now = Date.now(),
): ReviewEvalCase {
  const rec: ReviewEvalCase = {
    evalCaseId: input.evalCaseId ?? `ev-${randomBytes(6).toString('hex')}`,
    caseId: input.caseId,
    findingId: input.findingId,
    source: input.source,
    title: [...input.title].slice(0, 200).join(''),
    expected: [...input.expected].slice(0, 2000).join(''),
    file: input.file,
    line: input.line,
    createdAt: input.createdAt ?? now,
    createdBy: input.createdBy,
  }
  const next = [rec, ...listEvalCases()].slice(0, EVAL_CASE_CAP)
  mkdirSync(reviewGovDir(), { recursive: true })
  writeJsonAtomic(evalCasesFile(), next)
  return rec
}

export function listEvalRuns(limit = EVAL_RUN_CAP): ReviewEvalRun[] {
  const raw = readJson(evalRunsFile())
  if (!Array.isArray(raw)) return []
  return (raw as ReviewEvalRun[])
    .filter((r) => r && typeof r.runId === 'string' && typeof r.at === 'number')
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
}

export function appendEvalRun(
  input: Omit<ReviewEvalRun, 'runId' | 'at'> & { runId?: string; at?: number },
  now = Date.now(),
): ReviewEvalRun {
  const run: ReviewEvalRun = {
    runId: input.runId ?? `er-${randomBytes(6).toString('hex')}`,
    at: input.at ?? now,
    total: input.total,
    matched: input.matched,
    recall: input.recall,
    precision: input.precision,
    missing: input.missing.slice(0, EVAL_CASE_CAP),
    falsePositives: input.falsePositives.slice(0, EVAL_CASE_CAP),
    createdBy: input.createdBy,
  }
  const next = [run, ...listEvalRuns()].slice(0, EVAL_RUN_CAP)
  mkdirSync(reviewGovDir(), { recursive: true })
  writeJsonAtomic(evalRunsFile(), next)
  return run
}

function isNightlyShape(v: unknown): v is NightlyReport {
  const o = v as Partial<NightlyReport> | null
  return !!o && typeof o.reportId === 'string' && typeof o.date === 'string'
    && typeof o.generatedAt === 'number' && Array.isArray(o.groups)
}

export function saveNightlyReport(report: NightlyReport): NightlyReport {
  mkdirSync(nightlyDir(), { recursive: true })
  writeJsonAtomic(join(nightlyDir(), `${report.date}-${report.reportId}.json`), report)
  writeJsonAtomic(join(nightlyDir(), 'latest.json'), report)
  return report
}

export function readLatestNightly(): NightlyReport | null {
  const raw = readJson(join(nightlyDir(), 'latest.json'))
  return isNightlyShape(raw) ? raw : null
}

export function listNightly(limit = NIGHTLY_CAP): NightlyReport[] {
  const out: NightlyReport[] = []
  try {
    for (const name of readdirSync(nightlyDir())) {
      if (!name.endsWith('.json') || name === 'latest.json') continue
      const raw = readJson(join(nightlyDir(), name))
      if (isNightlyShape(raw)) out.push(raw)
    }
  } catch { /* 目录缺席=零报告 */ }
  return out.sort((a, b) => b.generatedAt - a.generatedAt).slice(0, limit)
}
