/**
 * 驾驭工程 B2：六类成本账（信通院《驾驭工程》报告六类成本的产品化记账）。
 *
 * 六类（每类带口径注释与 _defs，响应可对账到源）：
 *   1. token          hermes-web-ui.db sessions 的 token 计数列求和（近 N 天，秒窗）
 *   2. 人工干预        governance-audit 归一事件中审批/升级/裁决类动作计数
 *   3. 工具执行        audit 事件工具类动作计数 + ~/.hermes/traces JSONL span 计数
 *   4. 等待时延        kanban 板库近 N 天 done 任务 created→completed 平均/中位
 *   5. 故障返工        change-governance-store implement 回填返工工时求和
 *   6. 安全治理        audit 事件按严重级分桶 + 冻结窗口数
 *
 * 全部 fail-soft：某源缺席该类标 available:false（note 写原因），不猜数不插值。
 * 审计事件读取复用 governance-audit auditLog（四源归一单一读取面，只 import 不改）；
 * kanban 库定位复用 governance-analytics kanbanDbFiles/openReadonly。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { auditLog, type NormalizedEvent } from '../governance/governance-audit'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import { listFreezeWindows, listRequests } from '../governance/change-governance-store'

// ── 类型 ───────────────────────────────────────────────────────────

export type AccountKey =
  | 'token' | 'humanIntervention' | 'toolExecution'
  | 'waitLatency' | 'rework' | 'securityGovernance'

export const ACCOUNT_KEYS: readonly AccountKey[] = [
  'token', 'humanIntervention', 'toolExecution', 'waitLatency', 'rework', 'securityGovernance',
]

export interface AccountSourceStatus {
  id: string
  available: boolean
  note?: string
}

export interface TokenAccountData {
  dbPath: string | null
  sessionsCount: number | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  reasoningTokens: number | null
  totalTokens: number | null
  windowed: boolean
}

export interface HumanInterventionData {
  /** 采样上限（governance-audit 单源查询上限 500，口径如实标注） */
  sampleCap: number
  events: number | null
  byAction: Array<{ action: string; count: number }>
}

export interface ToolExecutionData {
  auditToolActions: number | null
  traceDir: string | null
  traceFiles: number | null
  /** span 计数 = traces 目录 JSONL 行数（口径：一行一 span） */
  traceSpanCount: number | null
}

export interface WaitLatencyData {
  boards: string[]
  tasksDone: number | null
  avgSeconds: number | null
  medianSeconds: number | null
  p95Seconds: number | null
}

export interface ReworkData {
  requests: number | null
  reworkHours: number | null
}

export interface SecurityGovernanceData {
  severityBuckets: { high: number; medium: number; low: number }
  freezeWindows: { total: number | null; active: number | null }
}

export type AccountData =
  | TokenAccountData | HumanInterventionData | ToolExecutionData
  | WaitLatencyData | ReworkData | SecurityGovernanceData

export interface CostAccount {
  key: AccountKey
  available: boolean
  note?: string
  sources: AccountSourceStatus[]
  data: AccountData
}

export interface CostAccountDef {
  title: string
  /** 口径定义（可对账） */
  definition: string
  /** 数据源锚点 */
  sources: string[]
}

export interface CostAccountsReport {
  days: number
  accounts: CostAccount[]
  _defs: Record<AccountKey, CostAccountDef>
}

export const COST_ACCOUNT_DEFS: Record<AccountKey, CostAccountDef> = {
  token: {
    title: 'token 成本',
    definition: 'hermes-web-ui.db sessions 表 token 计数列（input/output/cache_read/cache_write/reasoning）求和；时间窗按 last_active（秒）≥ now-days。HARNESS_STUDIO_DB 可覆写库路径',
    sources: ['upstream/hermes-studio packages/server/src/modules/studio/infrastructure/database/schemas.ts SESSIONS_SCHEMA', 'custom/server/controllers/ide/compaction-trace.ts resolveStudioDb（候选法）'],
  },
  humanIntervention: {
    title: '人工干预成本',
    definition: 'governance-audit 四源归一事件中人工干预类计数：approvals 源全部（审批决策本体）+ action 命中 /escalat|override|decide|review|裁决|升级|approve|reject/i。采样上限 500 条/次（approval-log CAP）',
    sources: ['custom/server/governance/governance-audit.ts auditLog', 'custom/server/approvals/approval-log.ts queryApprovalLog'],
  },
  toolExecution: {
    title: '工具执行成本',
    definition: 'audit 事件 action 命中 /tool|mcp|exec|bash|command/i 计数 + ~/.hermes/traces 目录（HERMES_TRACES_DIR 可覆写）JSONL 行数（一行一 span）',
    sources: ['custom/server/governance/governance-audit.ts auditLog', '~/.hermes/traces/*.jsonl'],
  },
  waitLatency: {
    title: '等待时延成本',
    definition: 'kanban 板库（~/.hermes/kanban/boards/*/kanban.db，HERMES_HOME 可覆写）近 N 天 done 任务 created_at→completed_at 秒差的平均/中位/p95；列名先探 PRAGMA 再取',
    sources: ['custom/server/governance/governance-analytics.ts kanbanDbFiles', 'custom/server/knowledge/board-graph.ts syncBoardGraph（tasks 列锚点）'],
  },
  rework: {
    title: '故障返工成本',
    definition: 'change-governance-store implement 登记回填的 rework_hours 求和（近 N 天按 updated_at 毫秒窗；CHANGE_GOV_DB 可覆写）',
    sources: ['custom/server/governance/change-governance-store.ts listRequests/implementRequest'],
  },
  securityGovernance: {
    title: '安全治理成本',
    definition: 'audit 事件按派生严重级分桶（high=/deny|reject|fail|error|override|violation|block/i，medium=/warn|escalat|freeze|risk|pending/i，余 low）+ change-gov 冻结窗口总数/活跃数',
    sources: ['custom/server/governance/governance-audit.ts auditLog', 'custom/server/governance/change-governance-store.ts listFreezeWindows'],
  },
}

// ── 判定（纯函数，导出供测试与 maturity 复用） ─────────────────────

/** 人工干预类动作判定（口径见 _defs.humanIntervention） */
export function isHumanInterventionEvent(ev: NormalizedEvent): boolean {
  if (ev.source === 'approvals') return true
  return /escalat|override|decide|review|裁决|升级|approve|reject/i.test(ev.action)
}

/** 工具类动作判定（口径见 _defs.toolExecution） */
export function isToolExecutionEvent(ev: NormalizedEvent): boolean {
  return /tool|mcp|exec|bash|command/i.test(ev.action)
}

/** 派生严重级（NormalizedEvent 无原生 severity 列，按 result/action 文本派生，口径如实） */
export function deriveSeverity(ev: NormalizedEvent): 'high' | 'medium' | 'low' {
  const text = `${ev.action} ${ev.result}`.toLowerCase()
  if (/deny|denied|reject|fail|error|override|violation|block|驳回|拒绝/.test(text)) return 'high'
  if (/warn|escalat|freeze|risk|pending|needs-auth/.test(text)) return 'medium'
  return 'low'
}

export function medianOf(sortedAsc: number[]): number | null {
  if (sortedAsc.length === 0) return null
  const mid = Math.floor((sortedAsc.length - 1) / 2)
  return sortedAsc[mid]
}

export function percentileOf(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1)
  return sortedAsc[Math.max(0, idx)]
}

// ── 各账收集器 ─────────────────────────────────────────────────────

/** studio db 多候选探测（对齐 compaction-trace 候选法；HARNESS_STUDIO_DB 显式覆盖优先） */
export function studioDbCandidates(explicit?: string): Array<string | undefined> {
  return [
    explicit,
    process.env.HARNESS_STUDIO_DB?.trim() || undefined,
    resolve(process.cwd(), 'packages/server/data/hermes-web-ui.db'),
    resolve(__dirname, '../../../data/hermes-web-ui.db'),
    resolve(__dirname, '../../../../data/hermes-web-ui.db'),
  ]
}

export function resolveStudioDb(explicit?: string): string | null {
  return studioDbCandidates(explicit).find((p): p is string => Boolean(p) && existsSync(p as string)) ?? null
}

/** ① token 账（sessions token 列求和，秒窗；列缺席降级全量并标注） */
export async function collectTokenAccount(days: number, explicitDb?: string): Promise<CostAccount> {
  const file = resolveStudioDb(explicitDb)
  const sources: AccountSourceStatus[] = [{ id: 'hermes-web-ui.db', available: Boolean(file), note: file ?? '库缺席（候选路径均未命中）' }]
  if (!file) {
    return { key: 'token', available: false, sources, data: { dbPath: null, sessionsCount: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, totalTokens: null, windowed: false } }
  }
  let db
  try {
    db = await openReadonly(file)
  } catch (e) {
    sources[0].available = false
    sources[0].note = `打开失败：${(e as Error).message}`
    return { key: 'token', available: false, sources, data: { dbPath: file, sessionsCount: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, totalTokens: null, windowed: false } }
  }
  try {
    const cols = (db.prepare('PRAGMA table_info(sessions)').all() as unknown as Array<{ name: string }>).map((c) => c.name)
    if (!cols.includes('input_tokens')) throw new Error('sessions 表无 token 列')
    const sumCol = (c: string): string => `COALESCE(SUM(${c}),0)`
    const sinceS = Math.floor((Date.now() - days * 86400000) / 1000)
    const base = `SELECT COUNT(*) c, ${sumCol('input_tokens')} i, ${sumCol('output_tokens')} o, ${sumCol('cache_read_tokens')} cr, ${sumCol('cache_write_tokens')} cw, ${sumCol('reasoning_tokens')} r FROM sessions`
    const win = cols.includes('last_active') ? `${base} WHERE last_active >= ?` : base
    // last_active 单位=秒（upstream sessions-db.ts: MAX(messages.timestamp)，timestamp=Math.floor(Date.now()/1000)）
    const row = (cols.includes('last_active')
      ? db.prepare(win).all(sinceS)
      : db.prepare(win).all())[0] as unknown as { c: number; i: number; o: number; cr: number; cw: number; r: number }
    const total = Number(row.i) + Number(row.o) + Number(row.cr) + Number(row.cw) + Number(row.r)
    return {
      key: 'token', available: true, sources,
      note: cols.includes('last_active') ? undefined : 'sessions 无 last_active 列，时间窗降级为全量',
      data: {
        dbPath: file, sessionsCount: Number(row.c),
        inputTokens: Number(row.i), outputTokens: Number(row.o),
        cacheReadTokens: Number(row.cr), cacheWriteTokens: Number(row.cw), reasoningTokens: Number(row.r),
        totalTokens: total, windowed: cols.includes('last_active'),
      },
    }
  } catch (e) {
    sources[0].available = false
    sources[0].note = `读取失败：${(e as Error).message}`
    return { key: 'token', available: false, sources, data: { dbPath: file, sessionsCount: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, reasoningTokens: null, totalTokens: null, windowed: false } }
  } finally {
    try { db.close() } catch { /* 已关 */ }
  }
}

/** 审计事件窗口（②③⑥ 共用一次 auditLog 调用；毫秒窗） */
export async function collectAuditEventsWindow(days: number): Promise<{
  sinceMs: number
  events: NormalizedEvent[]
  sources: AccountSourceStatus[]
  anyAvailable: boolean
}> {
  const log = await auditLog({ limit: 500 })
  const sinceMs = Date.now() - days * 86400000
  const sources = log.sources.map((s) => ({ id: s.id, available: s.available, note: s.note }))
  return {
    sinceMs,
    events: log.events.filter((e) => e.ts >= sinceMs),
    sources,
    anyAvailable: log.sources.some((s) => s.available),
  }
}

/** ② 人工干预账 */
export function buildHumanInterventionAccount(win: Awaited<ReturnType<typeof collectAuditEventsWindow>>): CostAccount {
  if (!win.anyAvailable) {
    return {
      key: 'humanIntervention', available: false,
      note: '审计四源均缺席（干预计数无从取数）',
      sources: win.sources,
      data: { sampleCap: 500, events: null, byAction: [] },
    }
  }
  const hits = win.events.filter(isHumanInterventionEvent)
  const byAction = new Map<string, number>()
  for (const e of hits) byAction.set(e.action, (byAction.get(e.action) ?? 0) + 1)
  return {
    key: 'humanIntervention', available: true, sources: win.sources,
    data: {
      sampleCap: 500,
      events: hits.length,
      byAction: [...byAction.entries()].map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    },
  }
}

/** ③ 工具执行账（audit 工具类动作 + traces JSONL span 计数，目录缺席跳过不标不可用） */
export async function collectToolExecutionAccount(win: Awaited<ReturnType<typeof collectAuditEventsWindow>>): Promise<CostAccount> {
  const traceDir = process.env.HERMES_TRACES_DIR?.trim()
    ? resolve(process.env.HERMES_TRACES_DIR.trim().replace(/^~/, homedir()))
    : join(homedir(), '.hermes', 'traces')
  let traceFiles = 0
  let traceSpanCount = 0
  let traceAvailable = false
  try {
    if (existsSync(traceDir)) {
      for (const f of readdirSync(traceDir)) {
        if (!f.endsWith('.jsonl')) continue
        traceFiles += 1
        traceSpanCount += readFileSync(join(traceDir, f), 'utf8').split('\n').filter(Boolean).length
      }
      traceAvailable = true
    }
  } catch { /* traces 读失败跳过（口径：目录缺席/不可读只跳过） */ }
  const auditToolActions = win.anyAvailable ? win.events.filter(isToolExecutionEvent).length : null
  const sources: AccountSourceStatus[] = [
    { id: 'audit-events', available: win.anyAvailable },
    { id: 'traces-jsonl', available: traceAvailable, note: traceAvailable ? undefined : `目录缺席或不可读：${traceDir}` },
  ]
  // 两源全缺 → 不可用；audit 可用即出数（traces 缺席如实 note，不拖垮整账）
  const available = win.anyAvailable || traceAvailable
  return {
    key: 'toolExecution', available,
    note: available ? (traceAvailable ? undefined : 'traces 目录缺席，仅 audit 计数') : 'audit 与 traces 均缺席',
    sources,
    data: { auditToolActions, traceDir, traceFiles: traceAvailable ? traceFiles : null, traceSpanCount: traceAvailable ? traceSpanCount : null },
  }
}

/** ⑥ 安全治理账（严重级分桶 + 冻结窗口数） */
export async function collectSecurityGovernanceAccount(win: Awaited<ReturnType<typeof collectAuditEventsWindow>>): Promise<CostAccount> {
  const buckets = { high: 0, medium: 0, low: 0 }
  for (const e of win.events) buckets[deriveSeverity(e)] += 1
  let freeze: { total: number | null; active: number | null } = { total: null, active: null }
  let freezeNote: string | undefined
  try {
    const wins = listFreezeWindows()
    const now = Date.now()
    freeze = { total: wins.length, active: wins.filter((w) => w.active && w.ends_at > now).length }
  } catch (e) {
    freezeNote = `冻结窗口读取失败：${(e as Error).message}`
  }
  return {
    key: 'securityGovernance',
    available: win.anyAvailable || freeze.total !== null,
    note: freezeNote,
    sources: [...win.sources, { id: 'change-gov-freeze-windows', available: freeze.total !== null, note: freezeNote }],
    data: { severityBuckets: buckets, freezeWindows: freeze },
  }
}

/** ④ 等待时延账（列名先探 PRAGMA 再取） */
export async function collectWaitLatencyAccount(days: number): Promise<CostAccount> {
  const files = kanbanDbFiles()
  const sources: AccountSourceStatus[] = [{ id: 'kanban-boards', available: files.length > 0, note: files.length > 0 ? `${files.length} 个板库` : '板库缺席（HERMES_HOME 下无 kanban.db）' }]
  if (files.length === 0) {
    return { key: 'waitLatency', available: false, sources, data: { boards: [], tasksDone: null, avgSeconds: null, medianSeconds: null, p95Seconds: null } }
  }
  const sinceS = Math.floor((Date.now() - days * 86400000) / 1000)
  const durations: number[] = []
  const boards: string[] = []
  for (const file of files) {
    let db
    try {
      db = await openReadonly(file)
    } catch { continue }
    try {
      // 列名以实际 schema 为准：先探 tasks 表列，created_at/completed_at 均在才取
      const cols = (db.prepare('PRAGMA table_info(tasks)').all() as unknown as Array<{ name: string }>).map((c) => c.name)
      if (!cols.includes('created_at') || !cols.includes('completed_at')) continue
      const rows = db.prepare(
        "SELECT created_at, completed_at FROM tasks WHERE status = 'done' AND completed_at >= ? AND created_at > 0",
      ).all(sinceS) as unknown as Array<{ created_at: number; completed_at: number }>
      for (const r of rows) {
        const d = Number(r.completed_at) - Number(r.created_at)
        if (d >= 0) durations.push(d)
      }
      boards.push(file)
    } catch { /* 单库失败跳过其余（诚实降级） */ }
    finally { try { db.close() } catch { /* 已关 */ } }
  }
  const sorted = durations.slice().sort((a, b) => a - b)
  const avg = sorted.length > 0 ? Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length) : null
  return {
    key: 'waitLatency',
    available: boards.length > 0,
    sources,
    data: { boards, tasksDone: sorted.length, avgSeconds: avg, medianSeconds: medianOf(sorted), p95Seconds: percentileOf(sorted, 95) },
  }
}

/** ⑤ 故障返工账（change-gov implement 回填工时求和，updated_at 毫秒窗） */
export function collectReworkAccount(days: number): CostAccount {
  const sources: AccountSourceStatus[] = [{ id: 'change-governance.db', available: false, note: '读取失败' }]
  try {
    const sinceMs = Date.now() - days * 86400000
    const items = listRequests({}).filter((r) => r.updated_at >= sinceMs)
    const reworkHours = items.reduce((s, r) => s + (r.rework_hours ?? 0), 0)
    sources[0].available = true
    sources[0].note = undefined
    return { key: 'rework', available: true, sources, data: { requests: items.length, reworkHours } }
  } catch (e) {
    sources[0].note = (e as Error).message
    return { key: 'rework', available: false, sources, data: { requests: null, reworkHours: null } }
  }
}

// ── 总入口 ─────────────────────────────────────────────────────────

export async function collectCostAccounts(opts?: { days?: number; studioDb?: string }): Promise<CostAccountsReport> {
  const days = Math.min(Math.max(Math.round(opts?.days ?? 7), 1), 90)
  const win = await collectAuditEventsWindow(days)
  const accounts: CostAccount[] = [
    await collectTokenAccount(days, opts?.studioDb),
    buildHumanInterventionAccount(win),
    await collectToolExecutionAccount(win),
    await collectWaitLatencyAccount(days),
    collectReworkAccount(days),
    await collectSecurityGovernanceAccount(win),
  ]
  return { days, accounts, _defs: COST_ACCOUNT_DEFS }
}
