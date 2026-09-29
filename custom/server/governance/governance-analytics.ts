/**
 * 4A 治理层运行态分析（spec 2026-09-29 §8 第二期 ②③④）——消费关系/SLO 实况/成本归集。
 *
 * 数据全部只读实取，三源：
 *   - kanban.db（root+boards/*，HERMES_HOME 根解析对齐 mind-projection.ts:164-174 先例，
 *     node:sqlite readOnly，绝不写库）；时间戳为 unix 秒，本模块统一转毫秒。
 *   - squad 评估台账 ~/.hermes-web-ui/squad/evaluations-*.json（at 为单调计数器非墙钟，
 *     最近使用时间取文件 mtime，如实标注来源）。
 *   - usage-store hermes-web-ui.db session_usage（路径候选对齐 compaction-trace.ts:18-19）。
 *
 * assignee→台账单元映射：仅 unit.id 与 assignee 同名（coding-agent 等 profile 级）可连；
 * 连不上的 assignee 如实进 unmappedAssignees（活跃但台账无档的治理信号），不编造归属。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { LedgerDoc, MetricsDoc } from './governance-ledger'
import type { DispatchLedgerEntry } from './dispatch-ledger'

// ---------- kanban 实耗 ----------

export interface AssigneeStat {
  assignee: string
  total: number
  done: number
  archived: number
  blocked: number
  inFlight: number
  lastActiveAt: number | null
  durationsS: number[]
}

interface KanbanTaskRow {
  assignee: string | null
  status: string
  created_at: number
  started_at: number | null
  completed_at: number | null
}

function kanbanDbFiles(homeDir?: string): string[] {
  const home = homeDir?.trim() || process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
  const files: string[] = []
  const root = join(home, 'kanban.db')
  if (existsSync(root)) files.push(root)
  const boardsRoot = join(home, 'kanban', 'boards')
  try {
    for (const slug of readdirSync(boardsRoot, { withFileTypes: true })) {
      if (!slug.isDirectory()) continue
      const f = join(boardsRoot, slug.name, 'kanban.db')
      if (existsSync(f)) files.push(f)
    }
  } catch { /* boards 目录缺失即单库形态 */ }
  return files
}

async function openReadonly(dbPath: string) {
  const { DatabaseSync } = await import('node:sqlite')
  return new DatabaseSync(dbPath, { open: true, readOnly: true })
}

export async function collectAssigneeStats(homeDir?: string): Promise<Map<string, AssigneeStat>> {
  const stats = new Map<string, AssigneeStat>()
  for (const file of kanbanDbFiles(homeDir)) {
    let db
    try {
      db = await openReadonly(file)
    } catch { continue }
    try {
      const rows = db.prepare(
        'SELECT assignee, status, created_at, started_at, completed_at FROM tasks',
      ).all() as unknown as KanbanTaskRow[]
      for (const r of rows) {
        const key = r.assignee?.trim() || '(未指派)'
        const s = stats.get(key) ?? {
          assignee: key, total: 0, done: 0, archived: 0, blocked: 0, inFlight: 0,
          lastActiveAt: null, durationsS: [],
        }
        s.total += 1
        if (r.status === 'done') s.done += 1
        else if (r.status === 'archived') s.archived += 1
        else if (r.status === 'blocked') s.blocked += 1
        else s.inFlight += 1
        const lastMs = Math.max(r.created_at ?? 0, r.started_at ?? 0, r.completed_at ?? 0) * 1000
        if (lastMs > 0 && (s.lastActiveAt === null || lastMs > s.lastActiveAt)) s.lastActiveAt = lastMs
        if (r.completed_at != null && r.started_at != null && r.completed_at >= r.started_at) {
          s.durationsS.push(r.completed_at - r.started_at)
        }
        stats.set(key, s)
      }
    } catch { /* 单库读失败跳过其余库照常（诚实降级） */ }
    finally { try { db.close() } catch { /* 已关 */ } }
  }
  return stats
}

// ---------- squad 评估台账 ----------

export interface SquadStat {
  squad: string
  total: number
  byVerdict: Record<string, number>
  /** 最近活动时间=台账文件 mtime（at 字段为单调计数器非墙钟，如实以此为准）。 */
  lastActiveAt: number | null
}

export function collectSquadStats(dir?: string): Map<string, SquadStat> {
  const stats = new Map<string, SquadStat>()
  const root = dir?.trim() || join(homedir(), '.hermes-web-ui', 'squad')
  let entries: string[] = []
  try {
    entries = readdirSync(root)
  } catch { return stats }
  for (const name of entries) {
    if (!/^evaluations-[0-9a-f]{16}\.json$/.test(name)) continue
    const file = join(root, name)
    try {
      const doc = JSON.parse(readFileSync(file, 'utf8')) as {
        squad?: string
        records?: Array<{ verdict?: string }>
      }
      const squad = doc.squad?.trim() || name
      const s = stats.get(squad) ?? { squad, total: 0, byVerdict: {}, lastActiveAt: null }
      for (const r of doc.records ?? []) {
        s.total += 1
        const v = r.verdict?.trim() || 'unknown'
        s.byVerdict[v] = (s.byVerdict[v] ?? 0) + 1
      }
      const mt = statSync(file).mtimeMs
      if (s.lastActiveAt === null || mt > s.lastActiveAt) s.lastActiveAt = mt
      stats.set(squad, s)
    } catch { /* 坏文件跳过 */ }
  }
  return stats
}

// ---------- ② 消费关系（unit → usage） ----------

export interface UnitUsage {
  unitId: string
  kind: string
  mapped: boolean
  source: 'kanban-assignee' | 'squad-ledger' | 'dispatch-ledger' | 'untracked'
  lastUsedAt: number | null
  daysSinceUse: number | null
  note?: string
}

export interface UsageReport {
  perUnit: UnitUsage[]
  /** 活跃 assignee 但台账无档（治理信号：名册外活动，不编造归属）。 */
  unmappedAssignees: Array<{ assignee: string; total: number; lastActiveAt: number | null }>
  zeroUseCandidates: UnitUsage[]
}

export interface UsageOpts {
  now?: number
  zeroUseDays?: number
  /** 派发结果台账条目（第三期：lane-specialist/coding-agent 实耗信号面）。 */
  dispatchEntries?: DispatchLedgerEntry[]
}

/** 单元在派发台账中的归因命中（column 条目按 specialist、mention 条目按 target）。 */
function dispatchUsageFor(entries: DispatchLedgerEntry[], unitId: string): { last: number | null; count: number; delivered: number } {
  let last: number | null = null
  let count = 0
  let delivered = 0
  for (const e of entries) {
    const hit = (e.kind === 'column' && e.specialist === unitId) || (e.kind === 'mention' && e.target === unitId)
    if (!hit) continue
    count += 1
    if (e.reason === 'queued' || e.reason === 'coalesced') delivered += 1
    if (last === null || e.ts > last) last = e.ts
  }
  return { last, count, delivered }
}

export function deriveUsage(
  ledger: LedgerDoc,
  assigneeStats: Map<string, AssigneeStat>,
  squadStats: Map<string, SquadStat>,
  opts: UsageOpts = {},
): UsageReport {
  const now = opts.now ?? Date.now()
  const zeroUseDays = opts.zeroUseDays ?? 90
  const dispatchEntries = opts.dispatchEntries ?? []
  const perUnit: UnitUsage[] = []
  const mappedAssignees = new Set<string>()
  for (const u of ledger.units ?? []) {
    let usage: UnitUsage
    const asStat = assigneeStats.get(u.id)
    const du = dispatchUsageFor(dispatchEntries, u.id)
    if (asStat) {
      mappedAssignees.add(u.id)
      usage = {
        unitId: u.id, kind: u.kind, mapped: true, source: 'kanban-assignee',
        lastUsedAt: asStat.lastActiveAt,
        daysSinceUse: asStat.lastActiveAt ? Math.floor((now - asStat.lastActiveAt) / 86400000) : null,
      }
    } else if (u.kind === 'squad') {
      const sq = squadStats.get(u.id.replace(/^squad-/, ''))
      usage = sq
        ? {
            unitId: u.id, kind: u.kind, mapped: true, source: 'squad-ledger',
            lastUsedAt: sq.lastActiveAt,
            daysSinceUse: sq.lastActiveAt ? Math.floor((now - sq.lastActiveAt) / 86400000) : null,
            note: `台账评估 ${sq.total} 条`,
          }
        : { unitId: u.id, kind: u.kind, mapped: true, source: 'squad-ledger', lastUsedAt: null, daysSinceUse: null, note: '评估台账缺席' }
    } else if (du.count > 0) {
      // 第三期：引擎派发台账归因（column specialist / mention target 命中单元 id）
      usage = {
        unitId: u.id, kind: u.kind, mapped: true, source: 'dispatch-ledger',
        lastUsedAt: du.last,
        daysSinceUse: du.last !== null ? Math.floor((now - du.last) / 86400000) : null,
        note: `引擎派发 ${du.count} 次（送达 ${du.delivered}）`,
      }
    } else {
      usage = {
        unitId: u.id, kind: u.kind, mapped: false, source: 'untracked', lastUsedAt: null, daysSinceUse: null,
        note: '该 kind 暂无实耗信号面（消费登记待运行侧接线）',
      }
    }
    perUnit.push(usage)
  }
  const unmappedAssignees = [...assigneeStats.values()]
    .filter((s) => !mappedAssignees.has(s.assignee) && s.assignee !== '(未指派)')
    .map((s) => ({ assignee: s.assignee, total: s.total, lastActiveAt: s.lastActiveAt }))
    .sort((a, b) => b.total - a.total)
  const zeroUseCandidates = perUnit.filter(
    (u) => u.mapped && (u.lastUsedAt === null || (u.daysSinceUse ?? 0) > zeroUseDays),
  )
  return { perUnit, unmappedAssignees, zeroUseCandidates }
}

// ---------- 派发统计（第三期：dispatch.successRate 本地权威源） ----------

export interface DispatchUnitStat {
  key: string
  dispatched: number
  delivered: number
  rate: number | null
}
export interface DispatchStats {
  dispatched: number
  delivered: number
  deferred: number
  failed: number
  deliveredRate: number | null
  byUnit: DispatchUnitStat[]
}

/** 同 commandId 去重（column 条目归因更细，优先于引擎单例落的 mention 条目）。 */
export function dedupeDispatchEntries(entries: DispatchLedgerEntry[]): DispatchLedgerEntry[] {
  const byCommand = new Map<string, DispatchLedgerEntry>()
  const rest: DispatchLedgerEntry[] = []
  for (const e of entries) {
    if (!e.commandId) { rest.push(e); continue }
    const prev = byCommand.get(e.commandId)
    if (!prev || (prev.kind === 'mention' && e.kind === 'column')) byCommand.set(e.commandId, e)
  }
  return [...byCommand.values(), ...rest]
}

export function dispatchStats(entries: DispatchLedgerEntry[]): DispatchStats {
  const dedup = dedupeDispatchEntries(entries)
  const isDelivered = (e: DispatchLedgerEntry) => e.reason === 'queued' || e.reason === 'coalesced'
  const delivered = dedup.filter(isDelivered).length
  const deferred = dedup.filter((e) => e.reason === 'deferred').length
  const byUnitMap = new Map<string, { dispatched: number; delivered: number }>()
  for (const e of dedup) {
    const key = e.kind === 'column' ? (e.specialist ?? e.target) : e.target
    const b = byUnitMap.get(key) ?? { dispatched: 0, delivered: 0 }
    b.dispatched += 1
    if (isDelivered(e)) b.delivered += 1
    byUnitMap.set(key, b)
  }
  const byUnit = [...byUnitMap.entries()]
    .map(([key, b]) => ({ key, dispatched: b.dispatched, delivered: b.delivered, rate: b.dispatched > 0 ? b.delivered / b.dispatched : null }))
    .sort((a, b) => b.dispatched - a.dispatched)
  return {
    dispatched: dedup.length,
    delivered,
    deferred,
    failed: dedup.length - delivered - deferred,
    deliveredRate: dedup.length > 0 ? delivered / dedup.length : null,
    byUnit,
  }
}

// ---------- 门禁通过率（第三期：gate.passRate 实况，qgate runs 扫描） ----------

export interface GateStats {
  runs: number
  byVerdict: Record<string, number>
  /** pass / (总 - not_applicable)；conditional 计分母不计分子（metrics.yaml 口径）。 */
  passRate: number | null
  lastAt: number | null
  roots: string[]
}

function walkUp(rel: string, fromDir: string): string | null {
  let dir = resolve(fromDir)
  for (let i = 0; i <= 6; i++) {
    const candidate = resolve(dir, rel)
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** qgate runs 扫描根：GOVERNANCE_QGATE_RUNS 覆盖（逗号分隔）；默认 cwd/.qgate + 仓根上寻 + 示例仓。 */
function qgateRunRoots(): string[] {
  const env = process.env.GOVERNANCE_QGATE_RUNS?.trim()
  if (env) return env.split(',').map((s) => resolve(s.trim().replace(/^~/, homedir()))).filter(Boolean)
  const roots: string[] = []
  const cwdRoot = resolve(process.cwd(), '.qgate', 'runs')
  if (existsSync(cwdRoot)) roots.push(cwdRoot)
  const upRoot = walkUp('.qgate/runs', __dirname)
  if (upRoot && !roots.includes(upRoot)) roots.push(upRoot)
  const examples = walkUp('custom/qgate/examples', __dirname)
  if (examples) {
    try {
      for (const d of readdirSync(examples, { withFileTypes: true })) {
        if (!d.isDirectory()) continue
        const r = resolve(examples, d.name, '.qgate', 'runs')
        if (existsSync(r)) roots.push(r)
      }
    } catch { /* 示例目录读失败忽略 */ }
  }
  return roots
}

interface QgateRunRow { verdict?: string; endedAt?: number }

export function collectQgateRuns(rootsOverride?: string[]): GateStats {
  const roots = rootsOverride ?? qgateRunRoots()
  const byVerdict: Record<string, number> = {}
  let runs = 0
  let lastAt: number | null = null
  for (const root of roots) {
    let files: string[] = []
    try {
      files = readdirSync(root).filter((f) => /^run-.*\.json$/.test(f))
    } catch { continue }
    for (const f of files) {
      try {
        const j = JSON.parse(readFileSync(join(root, f), 'utf8')) as QgateRunRow
        const v = String(j.verdict ?? '').toLowerCase() || 'unknown'
        byVerdict[v] = (byVerdict[v] ?? 0) + 1
        runs += 1
        if (typeof j.endedAt === 'number' && j.endedAt > (lastAt ?? 0)) lastAt = j.endedAt
      } catch { /* 坏文件跳过 */ }
    }
  }
  const na = byVerdict['not_applicable'] ?? 0
  const denominator = runs - na
  return { runs, byVerdict, passRate: denominator > 0 ? (byVerdict['pass'] ?? 0) / denominator : null, lastAt, roots }
}

// ---------- ③ SLO 实况 ----------

export interface SloTarget {
  successRate: number
  windowDays: number
  minSamples: number
  budgetAction: 'warn' | 'freeze'
}

export interface SloTierReport {
  tier: string
  target: SloTarget | null
  closed: number
  done: number
  successRate: number | null
  p95DurationS: number | null
  exhausted: boolean
  note?: string
}

export interface SloReport {
  windowDays: number
  tiers: SloTierReport[]
  unmapped: { closed: number; done: number; successRate: number | null; assignees: string[] }
  dataAvailable: boolean
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

export function computeSloReport(
  ledger: LedgerDoc,
  metrics: MetricsDoc | null,
  assigneeStats: Map<string, AssigneeStat>,
  now: number = Date.now(),
): SloReport {
  const targets = (metrics as { sloTargets?: Record<string, SloTarget> } | null)?.sloTargets ?? {}
  const windowDays = Math.max(1, ...Object.values(targets).map((t) => t.windowDays || 30), 30)
  const windowMs = windowDays * 86400000
  const tierOfAssignee = new Map<string, string>()
  for (const u of ledger.units ?? []) tierOfAssignee.set(u.id, u.sloTier)

  const acc = new Map<string, { closed: number; done: number; durations: number[] }>()
  const unmapped = { closed: 0, done: 0, durations: [] as number[], assignees: new Set<string>() }
  let dataAvailable = false
  for (const s of assigneeStats.values()) {
    if (s.total > 0) dataAvailable = true
    const closed = s.done + s.archived
    const recentDurations = s.durationsS // 时长不随窗过滤（样本保守取全量，如实注记）
    const tier = tierOfAssignee.get(s.assignee)
    if (tier) {
      const a = acc.get(tier) ?? { closed: 0, done: 0, durations: [] }
      a.closed += closed
      a.done += s.done
      a.durations.push(...recentDurations)
      acc.set(tier, a)
    } else if (s.assignee !== '(未指派)') {
      unmapped.closed += closed
      unmapped.done += s.done
      unmapped.durations.push(...recentDurations)
      if (closed > 0) unmapped.assignees.add(s.assignee)
    }
  }

  const tiers: SloTierReport[] = ['core', 'important', 'general'].map((tier) => {
    const a = acc.get(tier) ?? { closed: 0, done: 0, durations: [] }
    const target = targets[tier] ?? null
    const successRate = a.closed > 0 ? a.done / a.closed : null
    const p95 = percentile([...a.durations].sort((x, y) => x - y), 95)
    const minSamples = target?.minSamples ?? 10
    const exhausted = target != null && successRate != null && a.closed >= minSamples && successRate < target.successRate
    return {
      tier, target, closed: a.closed, done: a.done, successRate, p95DurationS: p95, exhausted,
      note: a.closed > 0 && a.closed < minSamples ? `样本 ${a.closed}<${minSamples}，预算判定挂起` : undefined,
    }
  })
  void now
  void windowMs
  return {
    windowDays,
    tiers,
    unmapped: {
      closed: unmapped.closed,
      done: unmapped.done,
      successRate: unmapped.closed > 0 ? unmapped.done / unmapped.closed : null,
      assignees: [...unmapped.assignees].sort(),
    },
    dataAvailable,
  }
}

// ---------- ④ 成本归集 ----------

export interface CostBucket {
  key: string
  calls: number
  inputTokens: number
  outputTokens: number
  /** 估算成本区间 [idle, peak]（价目表 idle/peak 两档）；未收录模型不计入（如实）。 */
  costIdle: number
  costPeak: number
  unpricedRows: number
}

export interface CostSummary {
  days: number
  rows: number
  currency: string
  byProvider: CostBucket[]
  byProfile: CostBucket[]
  /** 能力维度归集（第三期）：profile→台账单元→capability 映射，未映射如实入 (未映射) 桶。 */
  byCapability: CostBucket[]
  total: { calls: number; inputTokens: number; outputTokens: number; costIdle: number; costPeak: number; unpricedRows: number }
  pricingMissing: string[]
  dbFound: boolean
}

interface UsageRow {
  provider: string
  model: string
  profile: string
  api_calls: number
  input_tokens: number
  output_tokens: number
  is_estimated: number
}

function studioDbCandidates(): string[] {
  return [
    resolve(process.cwd(), 'packages/server/data/hermes-web-ui.db'),
    resolve(__dirname, '../../../data/hermes-web-ui.db'),
    resolve(__dirname, '../../../../data/hermes-web-ui.db'),
  ]
}

export async function costSummary(days = 30, dbPath?: string, ledger?: LedgerDoc | null): Promise<CostSummary> {
  const empty: CostSummary = {
    days, rows: 0, currency: 'CNY', byProvider: [], byProfile: [], byCapability: [],
    total: { calls: 0, inputTokens: 0, outputTokens: 0, costIdle: 0, costPeak: 0, unpricedRows: 0 },
    pricingMissing: [], dbFound: false,
  }
  const file = dbPath ?? studioDbCandidates().find((p) => existsSync(p))
  if (!file) return empty
  let db
  try {
    db = await openReadonly(file)
  } catch { return empty }
  try {
    const sinceS = Math.floor((Date.now() - days * 86400000) / 1000)
    // created_at 列在表定义尾部，存在性兜底：失败即无时间窗全量。
    let rows: UsageRow[] = []
    try {
      rows = db.prepare(
        'SELECT provider, model, profile, api_calls, input_tokens, output_tokens, is_estimated FROM session_usage WHERE created_at >= ?',
      ).all(sinceS) as unknown as UsageRow[]
    } catch {
      rows = db.prepare(
        'SELECT provider, model, profile, api_calls, input_tokens, output_tokens, is_estimated FROM session_usage',
      ).all() as unknown as UsageRow[]
    }
    const { loadPricingTable, matchPriceKey } = await import('../tokens/pricing')
    const table = loadPricingTable()
    const pricingMissing = new Set<string>()
    /** 单行成本区间；模型未收录返回 null（键匹配对齐 token-meter /cost 同款 matchPriceKey）。 */
    const costOf = (r: UsageRow): { idle: number; peak: number } | null => {
      if (!r.model) return null
      const key = matchPriceKey(table, r.model)
      if (!key) { pricingMissing.add(r.model); return null }
      const price = table.models[key]
      if (!price) { pricingMissing.add(r.model); return null }
      return {
        idle: (r.input_tokens / 1e6) * price.input.idle + (r.output_tokens / 1e6) * price.output.idle,
        peak: (r.input_tokens / 1e6) * price.input.peak + (r.output_tokens / 1e6) * price.output.peak,
      }
    }
    const bucket = (m: Map<string, CostBucket>, key: string, r: UsageRow, cost: { idle: number; peak: number } | null) => {
      const b = m.get(key) ?? { key, calls: 0, inputTokens: 0, outputTokens: 0, costIdle: 0, costPeak: 0, unpricedRows: 0 }
      b.calls += r.api_calls || 0
      b.inputTokens += r.input_tokens || 0
      b.outputTokens += r.output_tokens || 0
      if (cost) { b.costIdle += cost.idle; b.costPeak += cost.peak }
      else b.unpricedRows += 1
      m.set(key, b)
    }
    const byProvider = new Map<string, CostBucket>()
    const byProfile = new Map<string, CostBucket>()
    const byCapability = new Map<string, CostBucket>()
    // profile → 台账单元 → capability（第三期能力维度归集；无档入 (未映射) 桶如实呈现）
    const profileToCapability = new Map<string, string>()
    for (const u of ledger?.units ?? []) profileToCapability.set(u.id, u.capability)
    const capabilityOf = (profile: string): string => profileToCapability.get(profile) ?? '(未映射)'
    const total = { calls: 0, inputTokens: 0, outputTokens: 0, costIdle: 0, costPeak: 0, unpricedRows: 0 }
    for (const r of rows) {
      const cost = costOf(r)
      bucket(byProvider, r.provider || '(未知 provider)', r, cost)
      bucket(byProfile, r.profile || 'default', r, cost)
      bucket(byCapability, capabilityOf(r.profile || 'default'), r, cost)
      total.calls += r.api_calls || 0
      total.inputTokens += r.input_tokens || 0
      total.outputTokens += r.output_tokens || 0
      if (cost) { total.costIdle += cost.idle; total.costPeak += cost.peak }
      else total.unpricedRows += 1
    }
    const sortDesc = (a: CostBucket, b: CostBucket) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens)
    return {
      days,
      rows: rows.length,
      currency: table.currency || 'CNY',
      byProvider: [...byProvider.values()].sort(sortDesc),
      byProfile: [...byProfile.values()].sort(sortDesc),
      byCapability: [...byCapability.values()].sort(sortDesc),
      total,
      pricingMissing: [...pricingMissing].sort(),
      dbFound: true,
    }
  } finally {
    try { db.close() } catch { /* 已关 */ }
  }
}
