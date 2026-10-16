// overlay/custom/server/incident/incident-sources.ts
// 事故报告数据源读取层（2026-10-08 六文调研轮 A）：全部只读实取、诚实降级。
//
// 七源：
//   1. hermes-web-ui.db messages/sessions（node:sqlite readOnly，绝不写库）
//   2. run-trace JSONL（~/.hermes/traces/<sessionId>.jsonl，与 trace.ts 同格式自解析）
//   3. 工具执行审计账（toolpipeline readToolExecAudit，全局窗口——该账未按 session 绑定，如实注明）
//   4. 审批决策历史（approvals/approval-log queryApprovalLog）
//   5. agentidentity 身份/委托/凭证（只取非敏感字段）
//   6. ekko 记忆审计事件（ekko.db memory_audit_events，路径候选探测，缺席如实）
//   7. 编排面：workflow_run_node_sessions→workflow_runs 快照 vs 实际执行；gc_handoff_chains（session→room
//      映射不可得时如实 absent）
import { existsSync, readdirSync, readFileSync } from 'node:fs'
// 身份册（A7）：静态 import——相对 require 在 vitest/vite 转换态失解析
// （2026-10-17 实测 Cannot find module，catch 静默吞=身份面恒 absent）。
import * as agentIdentity from '../agentidentity/agent-identity'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { describeToolCall, type ToolSemantic } from './tool-semantics'

// ---------- DB 路径候选 ----------

/** 主库候选：env 显式 > 开发树 cwd > 注入树上寻 > appHome。与 governance-analytics studioDbCandidates 同思路。 */
export function studioDbCandidates(explicit?: string): string[] {
  const out: string[] = []
  const push = (p: string | undefined) => { if (p && !out.includes(p)) out.push(p) }
  push(explicit?.trim() || process.env.HERMES_INCIDENT_DB?.trim())
  // 推演环境对齐（run18 复盘：事故报告 17 要素 12 项空白的根因之一）：studio 进程本就带
  // HERMES_WEB_UI_HOME（webui db 写入面），事故读取层却没消费它——候选链落到宿主家目录，
  // 读到的是宿主库（0 条推演会话）。此处补上，与写入面同源。
  const webuiHome = process.env.HERMES_WEB_UI_HOME?.trim()
  if (webuiHome) push(join(webuiHome, 'hermes-web-ui.db'))
  push(resolve(process.cwd(), 'packages/server/data/hermes-web-ui.db'))
  push(resolve(__dirname, '../../../data/hermes-web-ui.db'))
  push(resolve(__dirname, '../../../../data/hermes-web-ui.db'))
  push(join(homedir(), '.hermes-web-ui', 'hermes-web-ui.db'))
  return out
}

export async function openReadonly(dbPath: string) {
  const { DatabaseSync } = await import('node:sqlite')
  return new DatabaseSync(dbPath, { open: true, readOnly: true })
}

export function findFirstDb(explicit?: string): string | null {
  return studioDbCandidates(explicit).find((p) => existsSync(p)) ?? null
}

// ---------- 1. messages / sessions ----------

export interface MessageRow {
  id: number
  session_id: string
  role: string
  tool_name: string | null
  tool_calls: string | null
  timestamp: number
  token_count: number | null
  finish_reason: string | null
  reasoning: string | null
  reasoning_content: string | null
  content: string
}

export interface SessionMessages {
  rows: Array<Omit<MessageRow, 'content' | 'tool_calls' | 'reasoning' | 'reasoning_content'> & {
    contentPreview: string
    toolCallNames: string[]
    hasReasoning: boolean
  }>
  total: number
  byRole: Record<string, number>
  toolNameCounts: Record<string, number>
  reasoningTurns: number
  firstTs: number | null
  lastTs: number | null
  tokens: number
}

function parseToolCallNames(toolCallsJson: string | null): string[] {
  if (!toolCallsJson) return []
  try {
    const parsed = JSON.parse(toolCallsJson)
    const arr = Array.isArray(parsed) ? parsed : parsed?.tool_calls
    if (!Array.isArray(arr)) return []
    return arr.map((c) => (typeof c?.function?.name === 'string' ? c.function.name : '')).filter(Boolean)
  } catch { return [] }
}

export function readSessionMessages(dbPath: string, sessionId: string): SessionMessages | null {
  let db
  try { db = openReadonlySync(dbPath) } catch { return null }
  try {
    const raw = db.prepare(
      'SELECT id, role, tool_name, tool_calls, timestamp, token_count, finish_reason, reasoning, reasoning_content, content FROM messages WHERE session_id = ? ORDER BY timestamp ASC, id ASC',
    ).all(sessionId) as unknown as MessageRow[]
    const out: SessionMessages = {
      rows: [], total: raw.length, byRole: {}, toolNameCounts: {}, reasoningTurns: 0,
      firstTs: raw.length ? raw[0].timestamp : null,
      lastTs: raw.length ? raw[raw.length - 1].timestamp : null,
      tokens: 0,
    }
    for (const r of raw) {
      out.byRole[r.role] = (out.byRole[r.role] ?? 0) + 1
      out.tokens += r.token_count ?? 0
      const names = r.tool_name ? [r.tool_name] : parseToolCallNames(r.tool_calls)
      for (const n of names) out.toolNameCounts[n] = (out.toolNameCounts[n] ?? 0) + 1
      const hasReasoning = Boolean(r.reasoning || r.reasoning_content)
      if (hasReasoning) out.reasoningTurns += 1
      out.rows.push({
        id: r.id, session_id: r.session_id, role: r.role, tool_name: r.tool_name,
        timestamp: r.timestamp, token_count: r.token_count, finish_reason: r.finish_reason,
        // 报告层最小暴露：内容只留 160 字符预览（证据全文在 messages 表）
        contentPreview: (r.content ?? '').slice(0, 160),
        toolCallNames: names,
        hasReasoning,
      })
    }
    return out
  } catch { return null } finally { try { (db as { close(): void }).close() } catch { /* 已关 */ } }
}

function openReadonlySync(dbPath: string) {
  // node:sqlite DatabaseSync 构造即打开；动态 require 在 CJS 下同步可用，ESM 由 vitest 转译保证。
  const mod = require('node:sqlite') as typeof import('node:sqlite')
  return new mod.DatabaseSync(dbPath, { open: true, readOnly: true })
}

export interface SessionOverview { title?: string; createdAt?: number; profile?: string }

export function readSessionOverview(dbPath: string, sessionId: string): SessionOverview | null {
  let db
  try { db = openReadonlySync(dbPath) } catch { return null }
  try {
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Record<string, unknown> | undefined
    if (!row) return null
    const out: SessionOverview = {}
    if (typeof row.title === 'string') out.title = row.title
    if (typeof row.name === 'string' && !out.title) out.title = row.name
    for (const k of ['created_at', 'createdAt']) {
      if (typeof row[k] === 'number') { out.createdAt = row[k] as number; break }
    }
    for (const k of ['profile', 'profile_id', 'agent']) {
      if (typeof row[k] === 'string' && row[k]) { out.profile = row[k] as string; break }
    }
    return out
  } catch { return null } finally { try { (db as { close(): void }).close() } catch { /* 已关 */ } }
}

// ---------- 1b. profile state.db 窗口聚合（推演轮形态，run18 复盘根治） ----------
// 推演环境下 agent（hermes CLI profile）会话不落 webui 主库，落在各 profile 的
// state.db（sessions/messages 同构表）。sessionId 为 RUN_ID 形态（yyyymmdd-…）且主库
// 精确查无果时，按时间窗聚合各 profile 的会话——「推演轮聚合形态」如实标注，不冒充
// 单会话。

export interface ProfileWindowMessages {
  profilesRoot: string
  window: { sinceSec: number; untilSec: number }
  byProfile: Array<{ profile: string; sessions: number; total: number }>
  combined: SessionMessages
}

export function profileRootCandidates(explicit?: string, webuiDb?: string | null): string[] {
  const out: string[] = []
  const push = (p: string | undefined) => { if (p && !out.includes(p)) out.push(p) }
  push(explicit?.trim() || process.env.HERMES_INCIDENT_PROFILES_ROOT?.trim())
  const hermesHome = process.env.HERMES_HOME?.trim()
  if (hermesHome) push(join(hermesHome, 'profiles'))
  if (webuiDb) push(resolve(webuiDb, '..', '..', 'hermes', 'profiles'))
  push(join(homedir(), '.hermes', 'profiles'))
  return out
}

/** RUN_ID 形态（如 20261013-v8-run18-lite-acp）→ 当天本地全天窗 [秒, 秒]。null=非 RUN_ID 形态。 */
/**
 * 推演轮聚合窗口（2026-10-16 A7 修）：跨天轮次全窗覆盖。
 * 原实现按 RUN_ID 日期推「当天 00:00→次日 00:00」——run20 实测跨 10-14 17:15 至
 * 10-16 11:45（42.5h），窗口切掉首尾两天，profile 聚合恒空=17 要素 15 项 absent
 * 的根因。新口径：优先读锚定轮 state.env 的 run_started_at（真起点）→now（真终点，
 * +2h 缓冲覆盖收官尾迹）；state 不可得回落旧日期窗（跨天按 48h 保守窗）。
 * opts.stateEnvPath 由调用方（驱动/控制器）显式注入；env HERMES_INCIDENT_STATE_ENV
 * 可覆盖（测试/隔离树用）。
 */
export function runWindowFromSessionId(sessionId: string, opts: { stateEnvPath?: string; nowSec?: number } = {}): { sinceSec: number; untilSec: number } | null {
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000)
  // 1) 锚定轮 state.env 真窗（跨天精确）
  const statePath = opts.stateEnvPath?.trim() || process.env.HERMES_INCIDENT_STATE_ENV?.trim()
  if (statePath) {
    try {
      const { readFileSync } = require('node:fs') as typeof import('node:fs')
      const txt = readFileSync(statePath, 'utf8')
      const m = /^run_started_at=(\d+)\s*$/m.exec(txt)
      if (m) {
        const since = Number(m[1])
        if (Number.isFinite(since) && since > 0 && since < nowSec) {
          return { sinceSec: since, untilSec: nowSec + 7200 }
        }
      }
    } catch { /* state 不可读=落日期窗（不猜） */ }
  }
  // 2) 日期窗（回落）：当天 00:00 起、+48h 保守覆盖跨天（run20 教训：单日窗切首尾）
  const m = /^(\d{4})(\d{2})(\d{2})-/.exec(sessionId)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3])
  const start = new Date(y, mo, d, 0, 0, 0, 0).getTime()
  if (!Number.isFinite(start)) return null
  return { sinceSec: Math.floor(start / 1000), untilSec: Math.floor(start / 1000) + 48 * 3600 }
}

export function isRunIdForm(sessionId: string): boolean {
  return /^\d{8}-/.test(sessionId)
}

/** 读单个 profile state.db 的窗口内会话与消息（缺表/坏档如实跳过）。 */
function readProfileDb(dbFile: string, profile: string, sinceSec: number, untilSec: number): { sessions: number; rows: MessageRow[] } {
  let db
  try { db = openReadonlySync(dbFile) } catch { return { sessions: 0, rows: [] } }
  try {
    const sess = db.prepare(
      'SELECT id FROM sessions WHERE started_at >= ? AND started_at < ? AND message_count > 0',
    ).all(sinceSec, untilSec) as unknown as Array<{ id: string }>
    if (sess.length === 0) return { sessions: 0, rows: [] }
    const ids = sess.map((s) => s.id)
    const placeholders = ids.map(() => '?').join(',')
    const rows = db.prepare(
      `SELECT id, session_id, role, tool_name, tool_calls, timestamp, token_count, finish_reason, reasoning, reasoning_content, content FROM messages WHERE session_id IN (${placeholders}) ORDER BY timestamp ASC, id ASC`,
    ).all(...ids) as unknown as MessageRow[]
    // 会话归属带上 profile（供报告按账号分组呈现；session_id 原值在 detail 可反查）
    for (const r of rows) r.session_id = `${profile}:${r.session_id}`
    return { sessions: ids.length, rows }
  } catch { return { sessions: 0, rows: [] } } finally { try { (db as { close(): void }).close() } catch { /* 已关 */ } }
}

export function readProfileWindowMessages(
  explicitRoot: string | undefined, webuiDb: string | null, sinceSec: number, untilSec: number,
): ProfileWindowMessages | null {
  const root = profileRootCandidates(explicitRoot, webuiDb).find((p) => existsSync(p))
  if (!root) return null
  let profiles: string[]
  try { profiles = readdirSync(root).filter((d) => existsSync(join(root, d, 'state.db'))) } catch { return null }
  const byProfile: ProfileWindowMessages['byProfile'] = []
  const merged: MessageRow[] = []
  for (const p of profiles) {
    const { sessions, rows } = readProfileDb(join(root, p, 'state.db'), p, sinceSec, untilSec)
    if (sessions === 0) continue
    byProfile.push({ profile: p, sessions, total: rows.length })
    merged.push(...rows)
  }
  merged.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id)
  const combined: SessionMessages = {
    rows: [], total: merged.length, byRole: {}, toolNameCounts: {}, reasoningTurns: 0,
    firstTs: merged.length ? merged[0].timestamp : null,
    lastTs: merged.length ? merged[merged.length - 1].timestamp : null,
    tokens: 0,
  }
  for (const r of merged) {
    combined.byRole[r.role] = (combined.byRole[r.role] ?? 0) + 1
    combined.tokens += r.token_count ?? 0
    const names = r.tool_name ? [r.tool_name] : parseToolCallNames(r.tool_calls)
    for (const n of names) combined.toolNameCounts[n] = (combined.toolNameCounts[n] ?? 0) + 1
    if (r.reasoning || r.reasoning_content) combined.reasoningTurns += 1
    combined.rows.push({
      id: r.id, session_id: r.session_id, role: r.role, tool_name: r.tool_name,
      timestamp: r.timestamp, token_count: r.token_count, finish_reason: r.finish_reason,
      contentPreview: (r.content ?? '').slice(0, 160),
      toolCallNames: names,
      hasReasoning: Boolean(r.reasoning || r.reasoning_content),
    })
  }
  return { profilesRoot: root, window: { sinceSec, untilSec }, byProfile, combined }
}

// ---------- 2. run-trace JSONL ----------

export interface TraceChunk {
  kind: 'llm_span' | 'tool_span' | 'subagent_span'
  phase?: string
  tool_name?: string
  tool_call_id?: string
  subagent_label?: string
  model?: string
  provider?: string
  started_at?: number
  ended_at?: number
  duration_ms?: number
  usage?: { input_tokens?: number; output_tokens?: number }
  status?: string
  error_message?: string
  args?: unknown
  ts?: number
  turn_id?: string
}

export interface TraceSummary {
  file: string
  startedAt?: number
  endedAt?: number
  model?: string
  provider?: string
  outcome?: string
  error?: string
  llmCalls: number
  inputTokens: number
  outputTokens: number
  toolCalls: Array<{ name: string; status: string; durationMs?: number; turnId?: string; semantic?: ToolSemantic }>
  subagents: Array<{ label: string; status: string }>
  errorSpans: Array<{ name: string; message?: string }>
  /** 工具入参键清单（不落值——脱敏纪律，对齐 tool-hooks）。 */
  toolArgKeys: Record<string, string[]>
}

export function traceDirCandidates(explicit?: string): string[] {
  const out: string[] = []
  const push = (p: string | undefined) => { if (p && !out.includes(p)) out.push(p) }
  push(explicit?.trim() || process.env.HERMES_INCIDENT_TRACE_DIR?.trim())
  push(join(homedir(), '.hermes', 'traces'))
  return out
}

export function readTraceSummary(
  explicitDir: string | undefined, sessionId: string,
  win?: { sinceSec: number; untilSec: number } | null,
): TraceSummary | null {
  // 解析序（2026-10-17 A7 数据面）：①<sessionId>.jsonl 精确命中（单会话）；
  // ②未命中且带窗口 → 窗口聚合目录内全部 *.jsonl（hermes 会话文件名=时间戳
  // 形态如 20261017_014348_12c540，与 RUN_ID 永不相等——按文件查=永远查不到，
  // 推演轮只能按 header.started_at 落窗聚合）。
  const dirs = traceDirCandidates(explicitDir)
  const file = dirs.map((d) => join(d, `${sessionId}.jsonl`)).find((f) => existsSync(f))
  let files: string[]
  if (file) {
    files = [file]
  } else if (win) {
    const inWin: string[] = []
    for (const d of dirs) {
      let entries: string[] = []
      try { entries = readdirSync(d).filter((f) => f.endsWith('.jsonl')) } catch { continue }
      for (const f of entries) {
        const full = join(d, f)
        try {
          const first = readFileSync(full, 'utf8').split('\n', 1)[0]
          const head = JSON.parse(first) as { started_at?: number }
          const ts = Math.floor(Number(head.started_at ?? 0))
          if (ts >= win.sinceSec && ts < win.untilSec) inWin.push(full)
        } catch { /* 坏档跳过 */ }
      }
    }
    if (inWin.length === 0) return null
    files = inWin
  } else {
    return null
  }
  const summary: TraceSummary = {
    file: files[0], llmCalls: 0, inputTokens: 0, outputTokens: 0, toolCalls: [], subagents: [], errorSpans: [], toolArgKeys: {},
  }
  for (const cur of files) {
  for (const line of readFileSync(cur, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let obj: Record<string, unknown>
    try { obj = JSON.parse(line) } catch { continue }
    if (obj.type === 'header') {
      summary.startedAt = obj.started_at as number | undefined
      summary.model = obj.model as string | undefined
      summary.provider = obj.provider as string | undefined
    } else if (obj.type === 'trailer') {
      summary.endedAt = obj.ended_at as number | undefined
      summary.outcome = obj.outcome as string | undefined
      summary.error = obj.error as string | undefined
    } else if (obj.type === 'chunk') {
      const c = obj as unknown as TraceChunk
      if (c.kind === 'llm_span' && c.phase !== 'pre') {
        summary.llmCalls += 1
        summary.inputTokens += Number(c.usage?.input_tokens) || 0
        summary.outputTokens += Number(c.usage?.output_tokens) || 0
      } else if (c.kind === 'tool_span' && c.tool_name) {
        const status = c.status ?? (c.error_message ? 'error' : 'unknown')
        // H1 语义层：按实参生成业务动作短语（未识别工具不带 semantic 如实降级）
        summary.toolCalls.push({
          name: c.tool_name, status, durationMs: c.duration_ms, turnId: c.turn_id,
          semantic: describeToolCall(c.tool_name, c.args) ?? undefined,
        })
        if (c.args && typeof c.args === 'object') {
          summary.toolArgKeys[c.tool_name] = Object.keys(c.args as object).sort()
        }
        if (status === 'error') summary.errorSpans.push({ name: c.tool_name, message: c.error_message })
      } else if (c.kind === 'subagent_span' && c.subagent_label && c.phase === 'stop') {
        summary.subagents.push({ label: c.subagent_label, status: c.status ?? 'unknown' })
      }
    }
  }
  }
  return summary
}

// ---------- 3. 工具执行审计账（toolpipeline，全局窗口） ----------

export interface ToolAuditWindow {
  entries: number
  byTool: Record<string, { pre: number; post: number; errors: number }>
  errors: Array<{ tool: string; error?: string }>
}

export function readToolAuditWindow(limit = 500): ToolAuditWindow {
  // 动态 require 防测试环境把工具账模块拖进 vitest 假执行器（对齐 approval-log 先例）。
  let readAudit: (n?: number) => Array<{ phase: string; tool: string; ok?: boolean; error?: string }>
  try {
    readAudit = require('../toolpipeline/tool-hooks').readToolExecAudit
  } catch { return { entries: 0, byTool: {}, errors: [] } }
  if (typeof readAudit !== 'function') return { entries: 0, byTool: {}, errors: [] }
  const entries = readAudit(limit)
  const out: ToolAuditWindow = { entries: entries.length, byTool: {}, errors: [] }
  for (const e of entries) {
    const b = out.byTool[e.tool] ?? { pre: 0, post: 0, errors: 0 }
    if (e.phase === 'pre') b.pre += 1
    else { b.post += 1; if (e.ok === false) { b.errors += 1; out.errors.push({ tool: e.tool, error: e.error }) } }
    out.byTool[e.tool] = b
  }
  return out
}

// ---------- 4. 审批决策历史（approvals，复用单一收口） ----------

export interface ApprovalWindow {
  entries: number
  byDecision: Record<string, number>
  recent: Array<{ ts: number; targetKind: string; decision: string; risk?: string }>
}

export function readApprovalWindow(limit = 200): ApprovalWindow {
  let query: (n?: number) => Array<{ ts: number; targetKind?: string; decision: string; risk?: string }>
  try {
    query = require('../approvals/approval-log').queryApprovalLog
  } catch { return { entries: 0, byDecision: {}, recent: [] } }
  if (typeof query !== 'function') return { entries: 0, byDecision: {}, recent: [] }
  const rows = query(limit)
  const out: ApprovalWindow = { entries: rows.length, byDecision: {}, recent: [] }
  for (const r of rows) {
    out.byDecision[r.decision] = (out.byDecision[r.decision] ?? 0) + 1
    out.recent.push({ ts: r.ts, targetKind: r.targetKind ?? '(未知)', decision: r.decision, risk: r.risk })
  }
  return out
}

// ---------- 5. agentidentity（身份/委托/凭证——非敏感字段） ----------

export interface IdentitySnapshot {
  count: number
  byKind: Record<string, number>
  /** 与会话 profile 名匹配的身份（名字对得上才连，连不上不编造归属）。 */
  matched: Array<{ id: string; name: string; kind: string; owner?: string; toolAllowlist: string[]; credentials: Array<{ label: string; kind: string; status: string }> }>
  delegationChains: Array<{ from: string; edges: Array<{ from: string; to: string; scope: string; revoked: boolean }> }>
}

export function readIdentitySnapshot(profileNames: string[]): IdentitySnapshot {
  const mod: typeof import('../agentidentity/agent-identity') = agentIdentity
  try {
    const identities = mod.listIdentities()
    const byKind: Record<string, number> = {}
    for (const i of identities) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1
    // 匹配口径（2026-10-17 A7）：身份名=「项目前缀-账号」（aipaydev-chen）而 profile
    // 名=裸账号（chen）——旧严格等名匹配恒 0（身份册 15 档全静默）。双向去前缀匹配：
    // 裸名相等、或一方为另一方去前缀后的形态。
    const _bare = (s: string) => s.replace(/^[a-z0-9]+-/, '')
    const matched = identities
      .filter((i) => {
        const ib = _bare(i.name)
        return profileNames.some((p) => p && (i.name === p || i.id === p || ib === p || _bare(p) === ib))
      })
      .map((i) => ({
        id: i.id, name: i.name, kind: i.kind, owner: i.owner,
        toolAllowlist: i.toolAllowlist ?? [],
        // 凭证只带 label/kind/status——绝不带密钥原文（论文：存指纹不存密钥）
        credentials: (i.credentials ?? []).map((c) => ({ label: c.label, kind: c.kind, status: c.status })),
      }))
    const delegationChains = matched.map((m) => {
      const chain = mod.activeDelegationChain(m.id)
      return {
        from: m.name,
        edges: chain.edges.map((e) => ({ from: e.from, to: e.to, scope: e.scope, revoked: Boolean(e.revokedAt) })),
      }
    })
    return { count: identities.length, byKind, matched, delegationChains }
  } catch { return { count: 0, byKind: {}, matched: [], delegationChains: [] } }
}

// ---------- 6. ekko 记忆审计事件 ----------

export interface MemoryAuditWindow {
  file: string
  events: number
  byType: Record<string, number>
  forSession: number
}

export function ekkoDbCandidates(explicit?: string): string[] {
  const out: string[] = []
  const push = (p: string | undefined) => { if (p && !out.includes(p)) out.push(p) }
  push(explicit?.trim() || process.env.HERMES_INCIDENT_EKKO_DB?.trim())
  push(join(homedir(), '.hermes-web-ui', 'ekko.db'))
  push(join(homedir(), '.hermes', 'ekko', 'ekko.db'))
  return out
}

export function readMemoryAudit(explicitDb: string | undefined, sessionId: string): MemoryAuditWindow | null {
  const file = ekkoDbCandidates(explicitDb).find((p) => existsSync(p))
  if (!file) return null
  let db
  try { db = openReadonlySync(file) } catch { return null }
  try {
    const rows = db.prepare(
      'SELECT event_type, session_id FROM memory_audit_events ORDER BY row_id DESC LIMIT 2000',
    ).all() as unknown as Array<{ event_type: string; session_id: string | null }>
    const byType: Record<string, number> = {}
    let forSession = 0
    for (const r of rows) {
      byType[r.event_type] = (byType[r.event_type] ?? 0) + 1
      if (r.session_id === sessionId) forSession += 1
    }
    return { file, events: rows.length, byType, forSession }
  } catch { return null } finally { try { (db as { close(): void }).close() } catch { /* 已关 */ } }
}

// ---------- 7. 编排面：workflow 快照 vs 实际执行 / gc handoff ----------

export interface WorkflowEvidence {
  runIds: string[]
  designNodes: number
  designEdges: number
  executedNodes: Array<{ executionId: string; nodeKey: string; iterations: number; error?: string }>
  edgeDecisions: Array<{ edge: string; route: string; reason?: string }>
}

export function readWorkflowEvidence(dbPath: string, sessionId: string): WorkflowEvidence | null {
  let db
  try { db = openReadonlySync(dbPath) } catch { return null }
  try {
    // 节点会话按 session_id 关联 run——列名存在性防御（表结构随上游演进）。
    let nodeRows: Array<Record<string, unknown>> = []
    try {
      nodeRows = db.prepare(
        'SELECT * FROM workflow_run_node_sessions WHERE session_id = ?',
      ).all(sessionId) as unknown as Array<Record<string, unknown>>
    } catch { return null }
    if (nodeRows.length === 0) return null
    const runIds = [...new Set(nodeRows.map((r) => String(r.run_id ?? r.workflowRunId ?? '')).filter(Boolean))]
    const out: WorkflowEvidence = { runIds, designNodes: 0, designEdges: 0, executedNodes: [], edgeDecisions: [] }
    for (const runId of runIds) {
      const run = db.prepare('SELECT snapshot_nodes_json, snapshot_edges_json FROM workflow_runs WHERE id = ?').get(runId) as
        { snapshot_nodes_json?: string; snapshot_edges_json?: string } | undefined
      if (run) {
        try { out.designNodes += (JSON.parse(run.snapshot_nodes_json ?? '[]') as unknown[]).length } catch { /* 坏档如实跳过 */ }
        try { out.designEdges += (JSON.parse(run.snapshot_edges_json ?? '[]') as unknown[]).length } catch { /* 坏档如实跳过 */ }
      }
      let edges: Array<Record<string, unknown>> = []
      try {
        edges = db.prepare('SELECT * FROM workflow_run_edge_evaluations WHERE run_id = ?').all(runId) as unknown as Array<Record<string, unknown>>
      } catch { /* 列名演进防御 */ }
      for (const e of edges) {
        out.edgeDecisions.push({
          edge: String(e.edge_id ?? e.edgeId ?? '(未知)'),
          route: String(e.route ?? e.chosen ?? ''),
          reason: typeof e.reason === 'string' ? e.reason : undefined,
        })
      }
    }
    for (const n of nodeRows) {
      out.executedNodes.push({
        executionId: String(n.execution_id ?? n.id ?? ''),
        nodeKey: String(n.node_key ?? n.nodeId ?? '(未知)'),
        iterations: Number(n.iterations ?? n.iteration_count ?? 1) || 1,
        error: typeof n.error === 'string' && n.error ? n.error : undefined,
      })
    }
    return out
  } catch { return null } finally { try { (db as { close(): void }).close() } catch { /* 已关 */ } }
}

export interface HandoffEvidence {
  chains: Array<{ chainId: string; roomId: string; depth: number; maxDepth: number | null; status: string; stopReason: string }>
}

export function readHandoffEvidence(dbPath: string, roomId?: string): HandoffEvidence | null {
  if (!roomId) return null
  let db
  try { db = openReadonlySync(dbPath) } catch { return null }
  try {
    const rows = db.prepare(
      'SELECT chainId, roomId, currentDepth, maxDepth, status, stopReason FROM gc_handoff_chains WHERE roomId = ? ORDER BY updatedAt DESC LIMIT 50',
    ).all(roomId) as unknown as Array<{ chainId: string; roomId: string; currentDepth: number; maxDepth: number | null; status: string; stopReason: string }>
    return { chains: rows.map((r) => ({ chainId: r.chainId, roomId: r.roomId, depth: r.currentDepth, maxDepth: r.maxDepth, status: r.status, stopReason: r.stopReason })) }
  } catch { return null } finally { try { (db as { close(): void }).close() } catch { /* 已关 */ } }
}
