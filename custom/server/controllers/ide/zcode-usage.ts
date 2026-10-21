/**
 * 本机 zcode 用量账本与全链路追踪（2026-10-21，dsh-context 数据面吸收轮）。
 *
 * 数据面：只读消费 zcode CLI/引擎库 ~/.zcode/cli/db/db.sqlite 的三张用量表
 *   model_usage（逐次模型调用：provider/model/agent/query_source/TTFT/五类 token）
 *   tool_usage（逐次工具调用：名称/状态/时长/只读/破坏性/审批/字节数）
 *   turn_usage（逐轮：状态/TTFT/时长/汇总）
 * 不新增任何埋点与落库（spec D2）；库缺席=空态+说明，不造数据。
 *
 * 端点（native-routes.ts 原生 koa 中间件挂载，devtools 同款先例）：
 *   GET /api/ide/zcode-usage/summary?days=7|30|0     KPI + byDay/byModel/byAgent/bySource
 *   GET /api/ide/zcode-usage/sessions?limit=&offset=  逐会话用量行（含子代理标记）
 *   GET /api/ide/zcode-usage/sessions/:id/rounds      逐轮账单 + 轮内按模型分解
 *   GET /api/ide/zcode-usage/sessions/:id/tools       工具调用时间线
 *
 * 口径契约（本机库实测，spec D5）：output_tokens 已包含 reasoning_tokens；
 * billed（计费口径 token）= input + output + cache_creation + cache_read，
 * 与库内 computed_total_tokens 对账一致；时间戳毫秒 epoch。
 * 缓存命中率 = cache_read / (input + cache_creation + cache_read)（提示词侧命中率）。
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'koa'

// ── 类型与常量 ───────────────────────────────────────────────────────────────

export interface TokenSums {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
}

export interface TokenSumsBilled extends TokenSums {
  billedTokens: number
}

export interface UsageSummaryKpi extends TokenSumsBilled {
  sessions: number
  turns: number
  modelCalls: number
  modelErrors: number
  toolCalls: number
  toolErrors: number
  turnErrors: number
  /** 提示词侧缓存命中率（0-1；无样本=null 不显示） */
  cacheHitRate: number | null
  /** 完成轮的活跃时长合计（毫秒） */
  activeMs: number
}

export interface SummaryByDay { day: string; billedTokens: number; modelCalls: number }
export interface SummaryByModel extends TokenSumsBilled {
  provider: string
  model: string
  calls: number
  errors: number
}
export interface SummaryByAgent { agent: string; calls: number; billedTokens: number }
export interface SummaryBySource { source: string; calls: number; billedTokens: number }

export interface UsageSummary {
  days: number
  fromMs: number | null
  kpi: UsageSummaryKpi
  byDay: SummaryByDay[]
  byModel: SummaryByModel[]
  byAgent: SummaryByAgent[]
  bySource: SummaryBySource[]
  note?: string
}

export interface UsageSessionRow extends TokenSumsBilled {
  id: string
  title: string
  directory: string
  taskType: string
  parentId: string | null
  isSubagent: boolean
  timeCreated: number
  timeUpdated: number
  turns: number
  modelCalls: number
  toolCalls: number
  turnErrors: number
  firstAt: number | null
  lastAt: number | null
}

export interface UsageRoundModel extends TokenSumsBilled {
  provider: string
  model: string
  calls: number
}

export interface UsageRoundRow {
  turnId: string
  status: string
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  ttftMs: number | null
  modelRequestCount: number
  toolCallCount: number
  toolErrorCount: number
  errorType: string
  errorCode: string
  models: UsageRoundModel[]
}

export interface UsageToolRow {
  id: string
  turnId: string | null
  toolName: string
  status: string
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  readOnly: boolean
  destructive: boolean
  approvalStatus: string
  outputBytes: number
  errorType: string
}

const DAY_MS = 86_400_000

// ── 纯函数层（测试锚点）──────────────────────────────────────────────────────

export function clampDays(raw: unknown): number {
  const n = Number(raw)
  if (n === 0) return 0
  if (n === 7) return 7
  return 30
}

export function clampLimit(raw: unknown, fallback = 30, max = 100): number {
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(Math.max(1, Math.trunc(n)), max) : fallback
}

export function clampOffset(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
}

export interface RawNums {
  input_tokens?: unknown
  output_tokens?: unknown
  reasoning_tokens?: unknown
  cache_creation_input_tokens?: unknown
  cache_read_input_tokens?: unknown
}

export function shapeTokenSums(r: RawNums): TokenSums {
  const outputTokens = Number(r.output_tokens) || 0
  return {
    inputTokens: Number(r.input_tokens) || 0,
    outputTokens,
    // output 已含推理（实测包含关系），展示细分时封顶防脏数据
    reasoningTokens: Math.min(Number(r.reasoning_tokens) || 0, outputTokens),
    cacheWriteTokens: Number(r.cache_creation_input_tokens) || 0,
    cacheReadTokens: Number(r.cache_read_input_tokens) || 0,
  }
}

/** 计费 token = 输入 + 输出 + 缓存写 + 缓存读（与库内 computed_total 口径一致）。 */
export function billedOf(s: TokenSums): number {
  return s.inputTokens + s.outputTokens + s.cacheWriteTokens + s.cacheReadTokens
}

export function withBilled(s: TokenSums): TokenSumsBilled {
  return { ...s, billedTokens: billedOf(s) }
}

/** 缓存命中率：提示词侧（输入+缓存写+缓存读）中缓存读占比；分母 0 = null。 */
export function cacheHitRateOf(cacheRead: number, input: number, cacheWrite: number): number | null {
  const denom = cacheRead + input + cacheWrite
  return denom > 0 ? cacheRead / denom : null
}

// ── deps 注入面 ──────────────────────────────────────────────────────────────

export interface SqliteDb {
  prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] }
  close: () => void
}

export interface ZcodeUsageDeps {
  dbPath?: () => string
  exists?: (p: string) => boolean
  now?: () => number
  openSqlite?: (path: string) => SqliteDb
}

function defaultDbPath(): string {
  return process.env.ZCODE_CLI_DB?.trim() || join(homedir(), '.zcode', 'cli', 'db', 'db.sqlite')
}

function openDefault(path: string): SqliteDb {
  // 局部 require：node:sqlite 实验特性，缺失环境（旧 node）如实降级
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require('node:sqlite')
  return new DatabaseSync(path, { readOnly: true }) as unknown as SqliteDb
}

function q(ctx: Context, key: string): unknown {
  const raw = (ctx.query as Record<string, unknown> | undefined)?.[key]
  return Array.isArray(raw) ? raw[0] : raw
}

function num(v: unknown): number {
  return Number(v) || 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function optNum(v: unknown): number | null {
  return v == null ? null : Number(v) || 0
}

/** 打开库并执行（统一缺席空态与异常面）。 */
function withDb<T>(ctx: Context, deps: ZcodeUsageDeps, empty: () => T, run: (db: SqliteDb) => T): void {
  const exists = deps.exists ?? existsSync
  const dbPath = (deps.dbPath ?? defaultDbPath)()
  if (!exists(dbPath)) {
    ctx.body = empty()
    return
  }
  const openSqlite = deps.openSqlite ?? openDefault
  let db: SqliteDb | null = null
  try {
    db = openSqlite(dbPath)
    ctx.body = run(db)
  } catch (e) {
    ctx.status = 500
    ctx.body = { error: `读取 zcode 用量库失败：${(e as Error).message}` }
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
}

function rangeWhere(days: number, now: number): { where: string; params: unknown[] } {
  if (days <= 0) return { where: '', params: [] }
  return { where: 'where started_at >= ?', params: [now - days * DAY_MS] }
}

export type ZcodeUsageRoute =
  | { kind: 'summary' }
  | { kind: 'sessions' }
  | { kind: 'rounds'; sessionId: string }
  | { kind: 'tools'; sessionId: string }
  | { kind: 'context'; sessionId: string }

/** 路由匹配（native-routes.ts 复用；纯函数供单测）：子路径提取会话 id（URL 解码）。 */
export function matchZcodeUsageRoute(method: string, path: string): ZcodeUsageRoute | null {
  if (method.toUpperCase() !== 'GET') return null
  if (path === '/api/ide/zcode-usage/summary') return { kind: 'summary' }
  if (path === '/api/ide/zcode-usage/sessions') return { kind: 'sessions' }
  const m = /^\/api\/ide\/zcode-usage\/sessions\/([^/]+)\/(rounds|tools|context)$/.exec(path)
  if (!m) return null
  return { kind: m[2] as 'rounds' | 'tools' | 'context', sessionId: decodeURIComponent(m[1]) }
}

interface AggRow extends RawNums {
  n?: unknown
  errors?: unknown
  sessions?: unknown
  active_ms?: unknown
  provider_id?: unknown
  model_id?: unknown
  agent?: unknown
  query_source?: unknown
  day?: unknown
  billed?: unknown
}

// ── GET /summary ─────────────────────────────────────────────────────────────

export function emptySummary(days: number, note: string): UsageSummary {
  return {
    days,
    fromMs: null,
    kpi: {
      inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0,
      billedTokens: 0, sessions: 0, turns: 0, modelCalls: 0, modelErrors: 0,
      toolCalls: 0, toolErrors: 0, turnErrors: 0, cacheHitRate: null, activeMs: 0,
    },
    byDay: [], byModel: [], byAgent: [], bySource: [], note,
  }
}

export function handleUsageSummary(ctx: Context, deps: ZcodeUsageDeps = {}): void {
  const days = clampDays(q(ctx, 'days'))
  const now = (deps.now ?? Date.now)()
  withDb(ctx, deps, () => emptySummary(days, '未找到 zcode CLI 会话库（本机没有 zcode 使用记录）'), db => {
    const { where, params } = rangeWhere(days, now)

    const mu = db.prepare(
      `select count(*) n, sum(input_tokens) input_tokens, sum(output_tokens) output_tokens,
              sum(reasoning_tokens) reasoning_tokens, sum(cache_creation_input_tokens) cache_creation_input_tokens,
              sum(cache_read_input_tokens) cache_read_input_tokens,
              count(distinct session_id) sessions,
              sum(case when status='error' then 1 else 0 end) errors
       from model_usage ${where}`,
    ).all(...params)[0] as AggRow

    const tu = db.prepare(
      `select count(*) n, sum(case when status='error' then 1 else 0 end) errors,
              sum(case when status='completed' then duration_ms else 0 end) active_ms
       from turn_usage ${where}`,
    ).all(...params)[0] as AggRow

    const tools = db.prepare(
      `select count(*) n, sum(case when status='error' then 1 else 0 end) errors
       from tool_usage ${where}`,
    ).all(...params)[0] as AggRow

    const byDay: SummaryByDay[] = (db.prepare(
      `select strftime('%Y-%m-%d', started_at/1000, 'unixepoch', 'localtime') day,
              sum(input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens) billed,
              count(*) n
       from model_usage ${where} group by day order by day`,
    ).all(...params) as AggRow[]).map(r => ({
      day: str(r.day), billedTokens: num(r.billed), modelCalls: num(r.n),
    }))

    const byModel: SummaryByModel[] = (db.prepare(
      `select provider_id, model_id, count(*) n,
              sum(case when status='error' then 1 else 0 end) errors,
              sum(input_tokens) input_tokens, sum(output_tokens) output_tokens,
              sum(reasoning_tokens) reasoning_tokens,
              sum(cache_creation_input_tokens) cache_creation_input_tokens,
              sum(cache_read_input_tokens) cache_read_input_tokens
       from model_usage ${where} group by provider_id, model_id order by 3 desc`,
    ).all(...params) as AggRow[]).map(r => ({
      provider: str(r.provider_id),
      model: str(r.model_id),
      calls: num(r.n),
      errors: num(r.errors),
      ...withBilled(shapeTokenSums(r)),
    }))

    const byAgent: SummaryByAgent[] = (db.prepare(
      `select coalesce(agent, '未知') agent, count(*) n,
              sum(input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens) billed
       from model_usage ${where} group by agent order by 3 desc`,
    ).all(...params) as AggRow[]).map(r => ({
      agent: str(r.agent), calls: num(r.n), billedTokens: num(r.billed),
    }))

    const bySource: SummaryBySource[] = (db.prepare(
      `select coalesce(query_source, '未知') query_source, count(*) n,
              sum(input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens) billed
       from model_usage ${where} group by query_source order by 3 desc`,
    ).all(...params) as AggRow[]).map(r => ({
      source: str(r.query_source), calls: num(r.n), billedTokens: num(r.billed),
    }))

    const kpiTokens = withBilled(shapeTokenSums(mu))
    return {
      days,
      fromMs: days > 0 ? now - days * DAY_MS : null,
      kpi: {
        ...kpiTokens,
        sessions: num(mu.sessions),
        turns: num(tu.n),
        modelCalls: num(mu.n),
        modelErrors: num(mu.errors),
        toolCalls: num(tools.n),
        toolErrors: num(tools.errors),
        turnErrors: num(tu.errors),
        cacheHitRate: cacheHitRateOf(kpiTokens.cacheReadTokens, kpiTokens.inputTokens, kpiTokens.cacheWriteTokens),
        activeMs: num(tu.active_ms),
      },
      byDay, byModel, byAgent, bySource,
    } as UsageSummary
  })
}

// ── GET /sessions ────────────────────────────────────────────────────────────

export function handleUsageSessions(ctx: Context, deps: ZcodeUsageDeps = {}): void {
  const limit = clampLimit(q(ctx, 'limit'), 30, 100)
  const offset = clampOffset(q(ctx, 'offset'))
  withDb<{ sessions: UsageSessionRow[]; note?: string }>(ctx, deps, () => ({ sessions: [], note: '未找到 zcode CLI 会话库（本机没有 zcode 使用记录）' }), db => {
    // turn_usage 仅数千行：全表按会话聚合走主键前缀，再 join session 元数据与两侧计数
    const rows = db.prepare(
      `select s.id, s.title, s.directory, s.task_type, s.parent_id, s.time_created, s.time_updated,
              tu.turns, tu.turn_errors, tu.first_at, tu.last_at,
              coalesce(mu.calls, 0) model_calls,
              coalesce(tu.input_tokens, 0) input_tokens, coalesce(tu.output_tokens, 0) output_tokens,
              coalesce(tu.reasoning_tokens, 0) reasoning_tokens,
              coalesce(tu.cache_creation_input_tokens, 0) cache_creation_input_tokens,
              coalesce(tu.cache_read_input_tokens, 0) cache_read_input_tokens,
              coalesce(tools.n, 0) tool_calls
       from (
         select session_id, count(*) turns,
                sum(case when status='error' then 1 else 0 end) turn_errors,
                min(started_at) first_at, max(started_at) last_at,
                sum(input_tokens) input_tokens, sum(output_tokens) output_tokens,
                sum(reasoning_tokens) reasoning_tokens,
                sum(cache_creation_input_tokens) cache_creation_input_tokens,
                sum(cache_read_input_tokens) cache_read_input_tokens
         from turn_usage group by session_id
       ) tu
       join session s on s.id = tu.session_id
       left join (
         select session_id, count(*) calls from model_usage group by session_id
       ) mu on mu.session_id = tu.session_id
       left join (
         select session_id, count(*) n from tool_usage group by session_id
       ) tools on tools.session_id = tu.session_id
       order by tu.last_at desc limit ? offset ?`,
    ).all(limit, offset) as Array<Record<string, unknown>>

    const sessions: UsageSessionRow[] = rows.map(r => {
      const t = shapeTokenSums(r)
      return {
        id: str(r.id),
        title: str(r.title).trim() || '（未命名会话）',
        directory: str(r.directory),
        taskType: str(r.task_type),
        parentId: r.parent_id == null ? null : str(r.parent_id),
        isSubagent: str(r.id).startsWith('sess_subagent'),
        timeCreated: num(r.time_created),
        timeUpdated: num(r.time_updated),
        turns: num(r.turns),
        modelCalls: num(r.model_calls),
        toolCalls: num(r.tool_calls),
        turnErrors: num(r.turn_errors),
        firstAt: optNum(r.first_at),
        lastAt: optNum(r.last_at),
        ...withBilled(t),
      }
    })
    return { sessions }
  })
}

// ── GET /sessions/:id/rounds ────────────────────────────────────────────────

export function handleUsageRounds(ctx: Context, sessionId: string, deps: ZcodeUsageDeps = {}): void {
  const limit = clampLimit(q(ctx, 'limit'), 50, 200)
  withDb<{ rounds: UsageRoundRow[]; note?: string }>(ctx, deps, () => ({ rounds: [], note: '未找到 zcode CLI 会话库' }), db => {
    const turns = db.prepare(
      `select turn_id, status, started_at, completed_at, duration_ms, time_to_first_token_ms,
              model_request_count, tool_call_count, tool_error_count, error_type, error_code
       from turn_usage where session_id = ? order by started_at desc limit ?`,
    ).all(sessionId, limit) as Array<Record<string, unknown>>

    const models = db.prepare(
      `select turn_id, provider_id, model_id, count(*) n,
              sum(input_tokens) input_tokens, sum(output_tokens) output_tokens,
              sum(reasoning_tokens) reasoning_tokens,
              sum(cache_creation_input_tokens) cache_creation_input_tokens,
              sum(cache_read_input_tokens) cache_read_input_tokens
       from model_usage where session_id = ? group by turn_id, provider_id, model_id`,
    ).all(sessionId) as Array<Record<string, unknown>>

    const byTurn = new Map<string, UsageRoundModel[]>()
    for (const m of models) {
      const row: UsageRoundModel = {
        provider: str(m.provider_id), model: str(m.model_id), calls: num(m.n),
        ...withBilled(shapeTokenSums(m)),
      }
      const key = str(m.turn_id)
      const list = byTurn.get(key) ?? []
      list.push(row)
      byTurn.set(key, list)
    }

    const rounds: UsageRoundRow[] = turns.map(t => ({
      turnId: str(t.turn_id),
      status: str(t.status),
      startedAt: num(t.started_at),
      completedAt: optNum(t.completed_at),
      durationMs: optNum(t.duration_ms),
      ttftMs: optNum(t.time_to_first_token_ms),
      modelRequestCount: num(t.model_request_count),
      toolCallCount: num(t.tool_call_count),
      toolErrorCount: num(t.tool_error_count),
      errorType: str(t.error_type),
      errorCode: str(t.error_code),
      models: byTurn.get(str(t.turn_id)) ?? [],
    }))
    return { rounds }
  })
}

// ── GET /sessions/:id/tools ─────────────────────────────────────────────────

export function handleUsageTools(ctx: Context, sessionId: string, deps: ZcodeUsageDeps = {}): void {
  const limit = clampLimit(q(ctx, 'limit'), 100, 500)
  withDb<{ tools: UsageToolRow[]; note?: string }>(ctx, deps, () => ({ tools: [], note: '未找到 zcode CLI 会话库' }), db => {
    const rows = db.prepare(
      `select id, turn_id, tool_name, status, started_at, completed_at, duration_ms,
              read_only, destructive, approval_status, output_bytes, error_type
       from tool_usage where session_id = ? order by started_at desc limit ?`,
    ).all(sessionId, limit) as Array<Record<string, unknown>>
    const tools: UsageToolRow[] = rows.map(t => ({
      id: str(t.id),
      turnId: t.turn_id == null ? null : str(t.turn_id),
      toolName: str(t.tool_name),
      status: str(t.status),
      startedAt: num(t.started_at),
      completedAt: optNum(t.completed_at),
      durationMs: optNum(t.duration_ms),
      readOnly: num(t.read_only) === 1,
      destructive: num(t.destructive) === 1,
      approvalStatus: str(t.approval_status),
      outputBytes: num(t.output_bytes),
      errorType: str(t.error_type),
    }))
    return { tools }
  })
}

// ── GET /sessions/:id/context — 逐请求趋势（精确）+ 构成折叠（≈估算）+ 压缩事件 ──
// Phase 2（2026-10-21 dsh-context 吸收）：requests 取 model_usage 真值
// （prompt = input + cache_creation + cache_read，即每次请求实际入窗的提示词
// token，精确）；构成按 message×part 折叠估算（D2：CJK≈1 token/字 + ASCII/4，
// UI 必须带 ≈ 标注）；compaction part 即上下文事件。

export interface ContextRequest {
  at: number
  turnId: string
  model: string
  provider: string
  status: string
  ttftMs: number | null
  /** 精确：本次请求提示词 token（input+缓存写+缓存读） */
  promptTokens: number
  /** 精确：本次请求输出 token */
  outputTokens: number
}

export interface ContextCategory { key: string; estTokens: number; count: number }

export interface ContextLargestItem {
  messageId: string
  role: string
  at: number
  estTokens: number
  /** 预览截断（D4：仅 top 列表携带，防大 payload） */
  preview: string
}

export interface ContextCompaction {
  at: number
  trigger: string
  reason: string
  status: string
}

export interface UsageContext {
  sessionId: string
  requests: ContextRequest[]
  /** 估算口径总量（≈）；requests 精确口径单独看 byRequestPromptPeak */
  est: {
    categories: ContextCategory[]
    estTotalTokens: number
    partsParsed: number
    partsSkipped: number
  }
  largest: ContextLargestItem[]
  compactions: ContextCompaction[]
  note?: string
}

/** ≈ 估算器（D2）：CJK 字符≈1 token，其余≈4 字符/token。 */
export function estimateTokensOf(text: string): number {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef)) cjk++
    else other++
  }
  return Math.round(cjk + other / 4)
}

/** 单 part 估算（D5：tool 取整 JSON 长度=参数+结果近似）。返回 [tokens, 类别]。 */
export function estimatePart(partData: unknown): { tokens: number; key: string } {
  const d = partData as { type?: unknown; text?: unknown } | null
  if (!d || typeof d !== 'object') return { tokens: 0, key: 'other' }
  const type = str(d.type)
  switch (type) {
    case 'text':
      return { tokens: estimateTokensOf(typeof d.text === 'string' ? d.text : ''), key: 'text' }
    case 'reasoning':
      return { tokens: estimateTokensOf(typeof d.text === 'string' ? d.text : ''), key: 'reasoning' }
    case 'tool':
      return { tokens: estimateTokensOf(JSON.stringify(d)), key: 'tool' }
    case 'file':
      return { tokens: 1000, key: 'file' } // 无逐图计量，≈固定 1k（图像体量主导，JSON 长度无意义）
    default:
      return { tokens: 0, key: 'other' } // step-start/finish、timeline、compaction 等=控制元数据不计
  }
}

const CONTEXT_REQUEST_CAP = 500
const PART_PARSE_CAP = 8000
const LARGEST_TOP = 20
const PREVIEW_LEN = 120

interface PartRow { message_id: unknown; data: unknown }
interface MsgRow { id: unknown; time_created: unknown; data: unknown }

/** message×part 折叠（纯函数供单测）：六类估算+top 消息+压缩事件。 */
export function foldContext(
  msgs: MsgRow[],
  parts: PartRow[],
): { categories: ContextCategory[]; largest: ContextLargestItem[]; compactions: ContextCompaction[]; partsSkipped: number } {
  const cat = new Map<string, ContextCategory>()
  const bump = (key: string, tokens: number) => {
    const c = cat.get(key) ?? { key, estTokens: 0, count: 0 }
    c.estTokens += tokens
    c.count += 1
    cat.set(key, c)
  }
  const perMsg = new Map<string, { role: string; at: number; tokens: number; preview: string; isCompaction: boolean }>()
  for (const m of msgs) {
    let role = ''
    let at = num(m.time_created)
    try {
      const md = JSON.parse(str(m.data)) as { role?: unknown }
      role = str(md.role)
    } catch { /* 脏 data 跳过 */ }
    perMsg.set(str(m.id), { role, at, tokens: 0, preview: '', isCompaction: false })
  }

  const compactions: ContextCompaction[] = []
  let partsSkipped = 0
  for (const p of parts) {
    let d: Record<string, unknown>
    try {
      d = JSON.parse(str(p.data)) as Record<string, unknown>
    } catch {
      partsSkipped++
      continue
    }
    const mid = str(p.message_id)
    const agg = perMsg.get(mid)
    const type = str(d.type)
    if (type === 'compaction') {
      if (agg) agg.isCompaction = true
      compactions.push({
        at: num((d.time as { start?: unknown } | undefined)?.start ?? p.time_created ?? 0),
        trigger: str(d.trigger),
        reason: str(d.compactReason),
        status: str((d as { timelineStatus?: unknown }).timelineStatus),
      })
      bump('compaction-event', 0)
      continue
    }
    // 解析上限外的 part 只计数不展开（D3）
    if (compactions.length + (cat.get('tool')?.count ?? 0) + (cat.get('text')?.count ?? 0) >= PART_PARSE_CAP) {
      partsSkipped++
      continue
    }
    const { tokens, key } = estimatePart(d)
    bump(key, tokens)
    if (agg) {
      agg.tokens += tokens
      if (!agg.preview && (key === 'text' || key === 'reasoning') && typeof d.text === 'string' && d.text) {
        agg.preview = d.text.slice(0, PREVIEW_LEN)
      }
    }
  }

  // 文本 part 无角色字段——先按所属消息归角色，user/assistant 文本类据此汇总；
  // 其余类别（推理/工具/文件/压缩事件）part 自带类型，直接类别累计。
  const roleText = new Map<string, { tokens: number; count: number }>([
    ['user', { tokens: 0, count: 0 }],
    ['assistant', { tokens: 0, count: 0 }],
  ])
  for (const p of parts) {
    let d: Record<string, unknown>
    try {
      d = JSON.parse(str(p.data)) as Record<string, unknown>
    } catch {
      continue
    }
    if (str(d.type) !== 'text') continue
    const agg = perMsg.get(str(p.message_id))
    if (!agg) continue
    const r = roleText.get(agg.role)
    if (r) {
      r.tokens += estimateTokensOf(typeof d.text === 'string' ? d.text : '')
      r.count += 1
    }
  }
  const finalCats: ContextCategory[] = [
    { key: 'user-text', estTokens: roleText.get('user')?.tokens ?? 0, count: roleText.get('user')?.count ?? 0 },
    { key: 'assistant-text', estTokens: roleText.get('assistant')?.tokens ?? 0, count: roleText.get('assistant')?.count ?? 0 },
    cat.get('reasoning') ?? { key: 'reasoning', estTokens: 0, count: 0 },
    cat.get('tool') ?? { key: 'tool', estTokens: 0, count: 0 },
    cat.get('file') ?? { key: 'file', estTokens: 0, count: 0 },
  ]

  const largest = [...perMsg.entries()]
    .filter(([, agg]) => agg.tokens > 0)
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, LARGEST_TOP)
    .map(([messageId, agg]) => ({
      messageId, role: agg.role, at: agg.at, estTokens: agg.tokens, preview: agg.preview,
    }))

  return { categories: finalCats, largest, compactions, partsSkipped }
}

export function handleUsageContext(ctx: Context, sessionId: string, deps: ZcodeUsageDeps = {}): void {
  withDb<{ sessions?: unknown } & UsageContext>(ctx, deps, () => ({
    sessionId, requests: [], est: { categories: [], estTotalTokens: 0, partsParsed: 0, partsSkipped: 0 },
    largest: [], compactions: [], note: '未找到 zcode CLI 会话库',
  }), db => {
    const reqRows = db.prepare(
      `select started_at, turn_id, provider_id, model_id, status, time_to_first_token_ms,
              input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens
       from model_usage where session_id = ? order by started_at asc limit ?`,
    ).all(sessionId, CONTEXT_REQUEST_CAP) as Array<Record<string, unknown>>
    const requests: ContextRequest[] = reqRows.map(r => ({
      at: num(r.started_at),
      turnId: str(r.turn_id),
      model: str(r.model_id),
      provider: str(r.provider_id),
      status: str(r.status),
      ttftMs: optNum(r.time_to_first_token_ms),
      promptTokens: num(r.input_tokens) + num(r.cache_creation_input_tokens) + num(r.cache_read_input_tokens),
      outputTokens: num(r.output_tokens),
    }))

    // 组成折叠：消息与 part 各取（part 只取会话内前 PART_PARSE_CAP*2 行，data 大文本在行内）
    const msgs = db.prepare(
      `select id, time_created, data from message where session_id = ? order by sequence asc`,
    ).all(sessionId) as MsgRow[]
    const parts = db.prepare(
      `select message_id, data from part where session_id = ? order by message_id, sequence asc limit ?`,
    ).all(sessionId, PART_PARSE_CAP * 2) as PartRow[]

    const folded = foldContext(msgs, parts)
    const estTotalTokens = folded.categories.reduce((s, c) => s + c.estTokens, 0)
    const partsParsed = folded.categories.reduce((s, c) => s + c.count, 0)

    const body: UsageContext = {
      sessionId,
      requests,
      est: { categories: folded.categories, estTotalTokens, partsParsed, partsSkipped: folded.partsSkipped },
      largest: folded.largest,
      compactions: folded.compactions,
    }
    if (requests.length === 0 && folded.categories.every(c => c.count === 0)) {
      body.note = '该会话没有模型调用与消息记录（或会话 ID 不存在）'
    }
    return body
  })
}
