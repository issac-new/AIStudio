// overlay/notify 域：Run 收口三态账本（Always-on Agents 吸收 P1，2026-11-16）。
//
// 语义来源（Anthropic《Building always-on agents》）：每次后台 Run 结束只有三种结局——
// 写发件箱（outbox）／判定无需通知（silence）／发起延迟调用（deferred）。本账本让
// 「沉默」成为可审计的显式决策，而不是默认无记录：earned attention（逐步赢得注意力）
// 的度量入口。
//
// 边界（spec D2）：只覆盖 custom 可见的后台 Run（automation/kanban/loop/followup/outbox）；
// chat 由用户发起、回复即交付，不硬套三态（无「不通知」语义可记，记了是假数据）。
//
// 存储：JSONL append-only（先例 dispatch-ledger），环形上限 2000 行；坏行跳过不阻断。
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { randomBytes } from 'crypto'
import { underWebUi } from '../lib/paths'

export const RUN_OUTCOME_KINDS = ['automation', 'kanban', 'loop', 'followup', 'chat', 'manual'] as const
export type RunOutcomeKind = (typeof RUN_OUTCOME_KINDS)[number]

export const RUN_OUTCOME_AUDIENCES = ['human', 'agent', 'none'] as const
export type RunOutcomeAudience = (typeof RUN_OUTCOME_AUDIENCES)[number]

export const RUN_OUTCOME_RESULTS = ['outbox', 'silence', 'deferred'] as const
export type RunOutcomeResult = (typeof RUN_OUTCOME_RESULTS)[number]

/** reasonCode 闭集：沉默与延迟必须点名原因，自由文本不可统计。 */
export const RUN_OUTCOME_REASONS = [
  'delivered',
  'nothing-new',
  'below-threshold',
  'cooldown',
  'quiet-hours',
  'budget-capped',
  'duplicate',
  'deferred-window',
  'deferred-approval',
  'deferred-followup',
  'error',
] as const
export type RunOutcomeReason = (typeof RUN_OUTCOME_REASONS)[number]

export interface RunOutcomeRecord {
  id: string
  runId: string
  runKind: RunOutcomeKind
  audience: RunOutcomeAudience
  outcome: RunOutcomeResult
  reasonCode: RunOutcomeReason
  /** 证据锚点：事件 id／文件:行／URL／批次号（无锚点不成立，账本侧只做字符串留存）。 */
  refs: string[]
  sessionId?: string
  at: number
}

const MAX_LINES = 2000
const MAX_REFS = 20
const MAX_REF_LEN = 500

export function runOutcomeLedgerPath(): string {
  const env = process.env.RUN_OUTCOME_LEDGER_PATH?.trim()
  if (env) return resolve(env)
  return underWebUi('run-outcome/run-outcomes.jsonl')
}

export function isRunOutcomeKind(v: unknown): v is RunOutcomeKind {
  return typeof v === 'string' && (RUN_OUTCOME_KINDS as readonly string[]).includes(v)
}
export function isRunOutcomeAudience(v: unknown): v is RunOutcomeAudience {
  return typeof v === 'string' && (RUN_OUTCOME_AUDIENCES as readonly string[]).includes(v)
}
export function isRunOutcomeResult(v: unknown): v is RunOutcomeResult {
  return typeof v === 'string' && (RUN_OUTCOME_RESULTS as readonly string[]).includes(v)
}
export function isRunOutcomeReason(v: unknown): v is RunOutcomeReason {
  return typeof v === 'string' && (RUN_OUTCOME_REASONS as readonly string[]).includes(v)
}

/** 治理裁决 → Run 收口分类（纯函数）。
 * deliver/escalate/batch→outbox（已入队，含待合并）；clarify/hold→deferred-approval
 * （等人）；defer→deferred-window（等窗口）；suppress→silence（原因按治理 reasonCode 归一）。 */
export function classifyGovernanceRound(
  decisions: Array<{ decision: string; reasonCode?: string }>,
): { outcome: RunOutcomeResult; reasonCode: RunOutcomeReason } {
  if (decisions.some((d) => d.decision === 'deliver' || d.decision === 'escalate' || d.decision === 'batch')) {
    return { outcome: 'outbox', reasonCode: 'delivered' }
  }
  const deferred = decisions.find((d) => d.decision === 'clarify' || d.decision === 'hold')
  if (deferred) return { outcome: 'deferred', reasonCode: 'deferred-approval' }
  if (decisions.some((d) => d.decision === 'defer')) return { outcome: 'deferred', reasonCode: 'deferred-window' }
  // 全 suppress（或空轮）：取出现最多的治理原因，映射到收口闭集。
  const counts = new Map<string, number>()
  for (const d of decisions) {
    const key = normalizeSilenceReason(d.reasonCode)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return { outcome: 'silence', reasonCode: (top as RunOutcomeReason | undefined) ?? 'nothing-new' }
}

/** 治理原因 → 沉默原因闭集（未知一律 below-threshold：不造新词）。 */
function normalizeSilenceReason(reason?: string): RunOutcomeReason {
  switch (reason) {
    case 'cooldown':
    case 'rejection_backoff':
      return 'cooldown'
    case 'quiet_hours':
      return 'quiet-hours'
    case 'daily_budget':
    case 'hourly_budget':
      return 'budget-capped'
    case 'below_threshold':
      return 'below-threshold'
    case 'breakpoint_wait':
    case 'deferral_aging':
      return 'deferred-window'
    case 'duplicate':
      return 'duplicate'
    default:
      return 'below-threshold'
  }
}

export interface RunOutcomeInput {
  runId: string
  runKind: RunOutcomeKind
  audience: RunOutcomeAudience
  outcome: RunOutcomeResult
  reasonCode: RunOutcomeReason
  refs?: string[]
  sessionId?: string
  at?: number
}

export interface RecordResult {
  recorded: boolean
  problems: string[]
  record?: RunOutcomeRecord
}

/** 校验并追加一条收口记录（fail-soft：非法输入返回 problems，不抛）。 */
export function recordRunOutcome(input: RunOutcomeInput): RecordResult {
  const problems: string[] = []
  if (typeof input.runId !== 'string' || !input.runId.trim()) problems.push('runId 必填')
  if (!isRunOutcomeKind(input.runKind)) problems.push(`runKind 须为 ${RUN_OUTCOME_KINDS.join('|')}`)
  if (!isRunOutcomeAudience(input.audience)) problems.push(`audience 须为 ${RUN_OUTCOME_AUDIENCES.join('|')}`)
  if (!isRunOutcomeResult(input.outcome)) problems.push(`outcome 须为 ${RUN_OUTCOME_RESULTS.join('|')}`)
  if (!isRunOutcomeReason(input.reasonCode)) problems.push(`reasonCode 须为闭集之一`)
  const refs = input.refs ?? []
  if (!Array.isArray(refs) || refs.length > MAX_REFS || refs.some((r) => typeof r !== 'string' || r.length > MAX_REF_LEN)) {
    problems.push(`refs 须为 ≤${MAX_REFS} 条、每条 ≤${MAX_REF_LEN} 字符的字符串数组`)
  }
  if (problems.length) return { recorded: false, problems }

  const record: RunOutcomeRecord = {
    id: `ro-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
    runId: input.runId.trim(),
    runKind: input.runKind,
    audience: input.audience,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    refs: refs.slice(),
    ...(input.sessionId ? { sessionId: String(input.sessionId).slice(0, 200) } : {}),
    at: typeof input.at === 'number' && Number.isFinite(input.at) ? input.at : Date.now(),
  }
  try {
    appendRecord(record)
    return { recorded: true, problems: [], record }
  } catch (err) {
    // 账本失败不影响业务（fail-soft），但可见：调用方从 problems 拿到原因。
    return { recorded: false, problems: [`账本写入失败：${err instanceof Error ? err.message : String(err)}`] }
  }
}

function appendRecord(record: RunOutcomeRecord): void {
  const file = runOutcomeLedgerPath()
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
  trimIfOversize(file)
}

/** 环形：超过上限时原子重写最后 MAX_LINES 行（tmp+rename，避免半截文件）。 */
function trimIfOversize(file: string): void {
  if (!existsSync(file)) return
  const raw = readFileSync(file, 'utf8')
  const lines = raw.split('\n').filter((l) => l.trim())
  if (lines.length <= MAX_LINES) return
  const kept = lines.slice(-MAX_LINES).join('\n') + '\n'
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, kept, 'utf8')
  renameSync(tmp, file)
}

export interface RunOutcomeFilter {
  outcome?: RunOutcomeResult
  reasonCode?: RunOutcomeReason
  runKind?: RunOutcomeKind
  runId?: string
  sinceMs?: number
  limit?: number
}

/** 读账本：坏行跳过并计数（quarantine 不在读路径做——账本是审计面，先保证读不炸）。 */
export function readRunOutcomes(filter: RunOutcomeFilter = {}): { records: RunOutcomeRecord[]; badLines: number } {
  const file = runOutcomeLedgerPath()
  if (!existsSync(file)) return { records: [], badLines: 0 }
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return { records: [], badLines: 0 }
  }
  const records: RunOutcomeRecord[] = []
  let badLines = 0
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const rec = JSON.parse(line) as RunOutcomeRecord
      if (!rec || typeof rec.id !== 'string' || typeof rec.runId !== 'string') {
        badLines += 1
        continue
      }
      records.push(rec)
    } catch {
      badLines += 1
    }
  }
  let out = records
  if (filter.outcome) out = out.filter((r) => r.outcome === filter.outcome)
  if (filter.reasonCode) out = out.filter((r) => r.reasonCode === filter.reasonCode)
  if (filter.runKind) out = out.filter((r) => r.runKind === filter.runKind)
  if (filter.runId) out = out.filter((r) => r.runId === filter.runId)
  if (typeof filter.sinceMs === 'number' && Number.isFinite(filter.sinceMs)) out = out.filter((r) => r.at >= filter.sinceMs!)
  const limit = typeof filter.limit === 'number' && Number.isFinite(filter.limit)
    ? Math.max(1, Math.min(Math.floor(filter.limit), 500))
    : 50
  return { records: out.slice(-limit), badLines }
}

export interface RunOutcomeStats {
  total: number
  sinceMs: number | null
  byOutcome: Record<string, number>
  byReason: Record<string, number>
  byRunKind: Record<string, number>
  /** 沉默占比（silence / total）；total=0 时 null（不猜数）。 */
  silenceShare: number | null
  badLines: number
}

export function runOutcomeStats(sinceMs?: number): RunOutcomeStats {
  const { records, badLines } = readRunOutcomes({
    ...(typeof sinceMs === 'number' ? { sinceMs } : {}),
    limit: 500,
  })
  const byOutcome: Record<string, number> = {}
  const byReason: Record<string, number> = {}
  const byRunKind: Record<string, number> = {}
  for (const r of records) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1
    byReason[r.reasonCode] = (byReason[r.reasonCode] ?? 0) + 1
    byRunKind[r.runKind] = (byRunKind[r.runKind] ?? 0) + 1
  }
  return {
    total: records.length,
    sinceMs: typeof sinceMs === 'number' && Number.isFinite(sinceMs) ? sinceMs : null,
    byOutcome,
    byReason,
    byRunKind,
    silenceShare: records.length ? (byOutcome.silence ?? 0) / records.length : null,
    badLines,
  }
}
