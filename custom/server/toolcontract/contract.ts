// overlay/toolcontract 域：工具契约（2026-10-18 Harness 可靠性轮）。
//
// 来源：《Harness Engineering 从零到生产》第一层要求工具具备「严格输入输出
// Schema、前置条件与副作用、可机器处理的错误码、超时/重试/幂等规则、权限/
// 成本/审计信息」；《90% 的 Agent 止步于 Demo》第 05/07 节要求幂等三层防护与
// 可重试/不可重试分类。盘点现状：图节点对任何异常一律重试，审计只记 ok/error
// 摘要，没有工具级副作用声明——重试策略与脱敏口径散落各处。
//
// 本模块只做纯函数与静态契约表：不做 IO、不执行工具。消费者是
// toolpipeline/tool-hooks（审计与重复调用告警）、loop/graph/graph-runtime
// （重试退避）与后续执行器。新增工具族时只改 BUILTIN_CONTRACTS 一处。
import { createHash } from 'crypto'

export type ToolSideEffect = 'read' | 'write' | 'external'

/** 错误类别：可机器处理的归一分类（源文 07 节的两分法展开）。 */
export type ErrorCategory =
  | 'transient'
  | 'rate_limit'
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'unknown'

export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  /** 抖动比例（0~1）：延迟在 [base*(1-r), base*(1+r)] 内随机。 */
  jitterRatio: number
  strategy: 'linear' | 'exponential'
  /** 只有这些类别进入重试；其余类别立即失败。 */
  retryOn: ErrorCategory[]
}

export interface IdempotencyPolicy {
  /** key=外部副作用工具需要幂等键；none=只读或天然幂等。 */
  mode: 'key' | 'none'
  ttlMs: number
  /** 参与幂等键的参数字段；缺省=全量参数。 */
  keyFields?: string[]
}

export interface ToolContract {
  /** 匹配模式：精确名，或以 * 结尾的前缀。 */
  match: string
  sideEffect: ToolSideEffect
  timeoutMs: number
  retry: RetryPolicy
  idempotency: IdempotencyPolicy
  /** 审计摘要额外脱敏的键（内置敏感键始终脱敏）。 */
  redactKeys: string[]
  /** 审计参数摘要的字符上限。 */
  maxArgSummaryChars: number
}

/** 工具契约表版本：运行清单记录该值，回答“这次运行用的是哪版契约”。 */
export const TOOL_CONTRACT_VERSION = '2026-10-18.1'

export const DEFAULT_TIMEOUT_MS = 60_000

const NO_RETRY: RetryPolicy = {
  maxAttempts: 0,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitterRatio: 0,
  strategy: 'exponential',
  retryOn: [],
}

const READ_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 10_000,
  jitterRatio: 0.3,
  strategy: 'exponential',
  retryOn: ['transient', 'rate_limit'],
}

const WRITE_RETRY: RetryPolicy = {
  maxAttempts: 2,
  baseDelayMs: 1_000,
  maxDelayMs: 20_000,
  jitterRatio: 0.3,
  strategy: 'exponential',
  retryOn: ['transient', 'rate_limit'],
}

/** 外部副作用工具默认不重试：写两次的代价高于失败一次（源文 07 节确定性问题）。 */
const EXTERNAL_RETRY: RetryPolicy = {
  maxAttempts: 1,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
  jitterRatio: 0.3,
  strategy: 'exponential',
  retryOn: ['transient', 'rate_limit'],
}

const READ_IDEMPOTENT: IdempotencyPolicy = { mode: 'none', ttlMs: 0 }
const WRITE_IDEMPOTENT: IdempotencyPolicy = { mode: 'key', ttlMs: 24 * 60 * 60 * 1000 }
const EXTERNAL_IDEMPOTENT: IdempotencyPolicy = { mode: 'key', ttlMs: 60 * 60 * 1000 }

function readContract(match: string, extra?: Partial<ToolContract>): ToolContract {
  return {
    match,
    sideEffect: 'read',
    timeoutMs: 60_000,
    retry: READ_RETRY,
    idempotency: READ_IDEMPOTENT,
    redactKeys: [],
    maxArgSummaryChars: 400,
    ...extra,
  }
}

function writeContract(match: string, extra?: Partial<ToolContract>): ToolContract {
  return {
    match,
    sideEffect: 'write',
    timeoutMs: 120_000,
    retry: WRITE_RETRY,
    idempotency: WRITE_IDEMPOTENT,
    redactKeys: [],
    maxArgSummaryChars: 400,
    ...extra,
  }
}

function externalContract(match: string, extra?: Partial<ToolContract>): ToolContract {
  return {
    match,
    sideEffect: 'external',
    timeoutMs: 120_000,
    retry: EXTERNAL_RETRY,
    idempotency: EXTERNAL_IDEMPOTENT,
    redactKeys: [],
    maxArgSummaryChars: 400,
    ...extra,
  }
}

/** 内置契约表：按工具族声明副作用、超时、重试与幂等。顺序无关，解析时取最长匹配。 */
export const BUILTIN_CONTRACTS: ToolContract[] = [
  // ---- 只读 ----
  readContract('read_file'),
  readContract('search_files'),
  readContract('view_image'),
  readContract('read_terminal'),
  readContract('read_window_below'),
  readContract('memory_search'),
  readContract('memory_get'),
  readContract('skills_list'),
  readContract('skill_view'),
  readContract('session_search'),
  readContract('obs_recall'),
  readContract('web_search', { timeoutMs: 30_000 }),
  readContract('web_extract', { timeoutMs: 60_000 }),
  readContract('x_search', { timeoutMs: 30_000 }),
  readContract('feishu_doc_read'),
  readContract('vision_analyze', { timeoutMs: 90_000 }),
  readContract('video_analyze', { timeoutMs: 120_000 }),
  readContract('image_generate', { timeoutMs: 120_000 }),
  readContract('video_generate', { timeoutMs: 180_000 }),
  readContract('text_to_speech', { timeoutMs: 60_000 }),
  readContract('lsp', { timeoutMs: 30_000 }),
  readContract('clarify', { sideEffect: 'external', retry: NO_RETRY }),

  // ---- 写入（本地，有幂等键） ----
  writeContract('write_file'),
  writeContract('patch'),
  writeContract('memory_write'),
  writeContract('memory_forget'),
  writeContract('skill_manage'),
  writeContract('execute_code'),
  writeContract('todo_list'),
  writeContract('annotate_preview'),
  writeContract('set_theme'),

  // ---- 外部副作用（重试最多一次，幂等键必备） ----
  externalContract('terminal', { timeoutMs: 120_000 }),
  externalContract('process_manage', { timeoutMs: 30_000, retry: NO_RETRY }),
  externalContract('close_terminal', { retry: NO_RETRY }),
  externalContract('delegate_task', { idempotency: EXTERNAL_IDEMPOTENT }),
  externalContract('browser_*', { timeoutMs: 60_000 }),
  externalContract('computer_use', { timeoutMs: 120_000 }),
  externalContract('desktop_*'),
  externalContract('drive_preview', { retry: NO_RETRY }),
  externalContract('cronjob_manage', { retry: NO_RETRY }),
  externalContract('kanban_*', { timeoutMs: 60_000, idempotency: EXTERNAL_IDEMPOTENT }),
  externalContract('react_to_message', { retry: NO_RETRY }),
  externalContract('setup_beat', { retry: NO_RETRY }),
  externalContract('focus_pane', { retry: NO_RETRY }),
  externalContract('gui_tour', { retry: NO_RETRY }),
  externalContract('show_tip', { retry: NO_RETRY }),
]

/** 未声明工具的兜底契约：按外部副作用处理，不重试（宁可失败一次，不盲目重放）。 */
export const DEFAULT_CONTRACT: ToolContract = {
  match: '*',
  sideEffect: 'external',
  timeoutMs: DEFAULT_TIMEOUT_MS,
  retry: NO_RETRY,
  idempotency: EXTERNAL_IDEMPOTENT,
  redactKeys: [],
  maxArgSummaryChars: 400,
}

function matches(pattern: string, name: string): boolean {
  if (pattern.endsWith('*')) return name.startsWith(pattern.slice(0, -1))
  return pattern === name
}

/** 工具名 → 契约：精确匹配优先，其次最长前缀通配，最后兜底。 */
export function resolveToolContract(name: string): ToolContract {
  const normalized = String(name ?? '').trim()
  if (!normalized) return DEFAULT_CONTRACT

  const exact = BUILTIN_CONTRACTS.find((c) => !c.match.endsWith('*') && c.match === normalized)
  if (exact) return exact

  let best: ToolContract | null = null
  for (const c of BUILTIN_CONTRACTS) {
    if (!c.match.endsWith('*')) continue
    if (!matches(c.match, normalized)) continue
    if (!best || c.match.length > best.match.length) best = c
  }
  return best ?? DEFAULT_CONTRACT
}

export interface ToolErrorInfo {
  category: ErrorCategory
  retryable: boolean
  /** 服务端 Retry-After 换算的毫秒（无则 null）。 */
  retryAfterMs: number | null
  message: string
  status?: number
  code?: string
}

const PATTERNS: Array<[ErrorCategory, RegExp]> = [
  ['auth', /\b401\b|unauthor|unauthenticated|invalid[_\s-]?(token|api[_\s-]?key|credential)|authentication|expired[_\s-]?token/i],
  ['permission', /\b403\b|forbidden|permission[_\s-]?denied|access[_\s-]?denied|not[_\s-]?allowed|审批拒绝|权限不足/i],
  ['not_found', /\b404\b|not[_\s-]?found|no[_\s-]?such[_\s-]?file|ENOENT|does not exist/i],
  ['validation', /\b400\b|\b422\b|invalid[_\s-]?(argument|param|input|schema)|validation|schema[_\s-]?error|EINVAL|typeerror|unexpected token/i],
  ['conflict', /\b409\b|conflict|EEXIST|already[_\s-]?exists|resource[_\s-]?exhausted/i],
  ['rate_limit', /\b429\b|rate[_\s-]?limit|too[_\s-]?many[_\s-]?requests|quota[_\s-]?exceeded|throttl/i],
  ['transient', /\b50[0234]\b|timeout|timed[_\s-]?out|transient|temporar|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EAI_AGAIN|EPIPE|network[_\s-]?error|socket[_\s-]?hang[_\s-]?up|connection[_\s-]?reset/i],
]

function readStatus(err: Record<string, unknown>): number | undefined {
  const raw = err.status ?? err.statusCode ?? err.httpStatus ?? err.code
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 400 && n <= 599 ? n : undefined
}

function readRetryAfter(err: Record<string, unknown>, now: number): number | null {
  const direct = err.retryAfterMs ?? err.retry_after_ms
  if (typeof direct === 'number' && Number.isFinite(direct) && direct >= 0) return direct
  const seconds = err.retryAfter ?? err.retry_after
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const header = err['retry-after'] ?? err['Retry-After']
  if (typeof header === 'string') {
    const asNumber = Number(header)
    if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber * 1000
    const at = Date.parse(header)
    if (Number.isFinite(at)) return Math.max(0, at - now)
  }
  return null
}

/** 错误 → 类别/可重试性/Retry-After。纯函数，不依赖具体 SDK。 */
export function classifyToolError(error: unknown, contract?: ToolContract, now = Date.now()): ToolErrorInfo {
  const err: Record<string, unknown> =
    error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const message = typeof error === 'string'
    ? error
    : typeof err.message === 'string'
      ? err.message
      : String(error ?? '')
  const status = readStatus(err)
  const code = typeof err.code === 'string' ? err.code : undefined
  const retryAfterMs = readRetryAfter(err, now)

  let category: ErrorCategory = 'unknown'
  if (status === 401) category = 'auth'
  else if (status === 403) category = 'permission'
  else if (status === 404) category = 'not_found'
  else if (status === 409) category = 'conflict'
  else if (status === 429) category = 'rate_limit'
  else if (status === 422 || status === 400) category = 'validation'
  else if (status && status >= 500) category = 'transient'
  else {
    const haystack = `${code ?? ''} ${message}`
    for (const [cat, re] of PATTERNS) {
      if (re.test(haystack)) { category = cat; break }
    }
  }

  const policy = contract?.retry
  const retryable = policy
    ? policy.maxAttempts > 0 && policy.retryOn.includes(category)
    : category === 'transient' || category === 'rate_limit'

  return { category, retryable, retryAfterMs, message, status, code }
}

export interface BackoffOptions {
  /** 1-based 重试序号（第一次重试=1）。 */
  attempt: number
  retry: RetryPolicy
  retryAfterMs?: number | null
  random?: () => number
}

/** 退避毫秒：Retry-After 优先，其次线性/指数 + 抖动，最后封顶。 */
export function computeBackoffMs({ attempt, retry, retryAfterMs, random = Math.random }: BackoffOptions): number {
  const max = Math.max(0, retry.maxDelayMs)
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(max, Math.round(retryAfterMs))
  }
  const n = Math.max(1, Math.floor(attempt))
  const base = retry.strategy === 'exponential'
    ? retry.baseDelayMs * 2 ** (n - 1)
    : retry.baseDelayMs * n
  const ratio = Math.min(1, Math.max(0, retry.jitterRatio))
  const jittered = ratio > 0 ? base * (1 + (random() * 2 - 1) * ratio) : base
  return Math.min(max, Math.max(0, Math.round(jittered)))
}

/** 稳定序列化：对象键排序、数组保序、深度/宽度有界。 */
export function stableStringify(value: unknown, depth = 0): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') return JSON.stringify(value)
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return 'null'
  }
  if (depth >= 4) return '"[depth]"'
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((v) => stableStringify(v, depth + 1))
    return `[${items.join(',')}]`
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k], depth + 1)}`)
  return `{${pairs.join(',')}}`
}

export function sha1(text: string): string {
  return createHash('sha1').update(text).digest('hex')
}

/** 参数摘要指纹：只用于把同一调用的 pre/post 关联与重复识别，不可反推参数。 */
export function argDigest(args: unknown): string {
  return sha1(stableStringify(args)).slice(0, 16)
}

const SENSITIVE_KEY = /token|secret|password|passwd|api[_-]?key|apikey|authorization|auth[_-]?header|cookie|credential|private[_-]?key|access[_-]?key|session[_-]?id/i

function redactScalar(value: unknown, maxChars: number): unknown {
  if (typeof value === 'string') {
    return value.length > maxChars ? `${value.slice(0, maxChars)}…` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => redactScalar(v, Math.floor(maxChars / 2)))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      out[k] = SENSITIVE_KEY.test(k) || v === undefined ? '***' : redactScalar(v, Math.floor(maxChars / 2))
    }
    return out
  }
  return undefined
}

/**
 * 审计参数摘要。默认只记「键名 + 值形状」（string(12)/object(3)）——延续
 * 2026-10-16 安全轮「不落入参值」纪律；显式 `includeValues: true`（业界排障
 * 场景需人工开启）才落脱敏后的短值：敏感键整体替换、长值截断。
 * 无论哪种模式，摘要都不能用于还原敏感数据。
 */
export function summarizeArgs(
  args: unknown,
  opts: { redactKeys?: string[]; maxChars?: number; includeValues?: boolean } = {},
): Record<string, unknown> {
  const maxChars = Math.max(20, opts.maxChars ?? 120)
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { _value: opts.includeValues ? redactScalar(args, maxChars) : shapeOf(args) }
  }
  const extra = new Set((opts.redactKeys ?? []).map((k) => k.toLowerCase()))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (extra.has(k.toLowerCase()) || SENSITIVE_KEY.test(k)) {
      out[k] = '***'
      continue
    }
    out[k] = opts.includeValues ? redactScalar(v, maxChars) : shapeOf(v)
  }
  return out
}

/** 值形状：只暴露类型与规模，不暴露内容。 */
export function shapeOf(value: unknown): string {
  if (typeof value === 'string') return `string(${value.length})`
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (value === null) return 'null'
  if (Array.isArray(value)) return `array(${value.length})`
  if (typeof value === 'object') return `object(${Object.keys(value as object).length})`
  return typeof value
}

/**
 * 指纹输入脱敏：敏感键值替换为固定标记，其余值保留（用于区分不同调用）。
 * 供 argDigest / 幂等键使用——避免把低熵密钥的哈希写进审计或幂等账。
 */
export function redactSensitive(args: unknown, extraKeys: string[] = [], depth = 0): unknown {
  if (args === null || typeof args !== 'object') return args
  if (depth >= 4) return '<depth>'
  const extra = new Set(extraKeys.map((k) => k.toLowerCase()))
  if (Array.isArray(args)) return args.slice(0, 20).map((v) => redactSensitive(v, extraKeys, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args as Record<string, unknown>).slice(0, 40)) {
    out[k] = extra.has(k.toLowerCase()) || SENSITIVE_KEY.test(k)
      ? '<redacted>'
      : redactSensitive(v, extraKeys, depth + 1)
  }
  return out
}

export interface IdempotencyKeyInput {
  tool: string
  args: unknown
  userId?: string
  runId?: string
  windowMs: number
  now?: number
  keyFields?: string[]
}

/** 幂等键：工具名 + 发起者 + 时间窗 + 关键参数指纹。 */
export function computeIdempotencyKey(input: IdempotencyKeyInput): string {
  const now = input.now ?? Date.now()
  const window = Math.floor(now / Math.max(1, input.windowMs))
  let args = input.args
  if (input.keyFields?.length && input.args && typeof input.args === 'object' && !Array.isArray(input.args)) {
    const src = input.args as Record<string, unknown>
    const picked: Record<string, unknown> = {}
    for (const key of input.keyFields) picked[key] = src[key]
    args = picked
  }
  const material = `${input.tool}\n${input.userId ?? ''}\n${stableStringify(args)}\n${window}`
  return sha1(material).slice(0, 24)
}

export interface CallSignatureObservation {
  signature: string
  /** 连续相同签名的次数。 */
  streak: number
  /** 是否达到重复阈值。 */
  duplicate: boolean
  /** 本次是否刚好跨过阈值（用于只告警一次）。 */
  firstDuplicate: boolean
}

export interface CallSignatureTrackerOptions {
  /** 连续相同调用达到即判重复（源文经验值 3）。 */
  threshold?: number
  /** 签名计数跨窗口失效。 */
  windowMs?: number
  /** 最多跟踪的 scope 数（防止无界增长）。 */
  maxScopes?: number
  now?: () => number
}

interface ScopeState {
  signature: string
  streak: number
  at: number
  warned: boolean
}

/**
 * 连续重复调用追踪（源文 05 节第三层）：同一会话/运行连续 N 轮调用同一工具、
 * 传相同参数 → 大概率模型陷入死循环。只观测告警，不阻断执行。
 */
export class CallSignatureTracker {
  private readonly threshold: number
  private readonly windowMs: number
  private readonly maxScopes: number
  private readonly now: () => number
  private readonly scopes = new Map<string, ScopeState>()

  constructor(opts: CallSignatureTrackerOptions = {}) {
    this.threshold = Math.max(2, opts.threshold ?? 3)
    this.windowMs = Math.max(1_000, opts.windowMs ?? 10 * 60 * 1000)
    this.maxScopes = Math.max(1, opts.maxScopes ?? 500)
    this.now = opts.now ?? Date.now
  }

  observe(scopeKey: string, tool: string, args: unknown): CallSignatureObservation {
    const now = this.now()
    const signature = argDigest({ tool, args })
    const scope = scopeKey || 'anonymous'
    let state = this.scopes.get(scope)

    if (!state || now - state.at > this.windowMs || state.signature !== signature) {
      state = { signature, streak: 1, at: now, warned: false }
      this.scopes.set(scope, state)
      this.evict()
      return { signature, streak: 1, duplicate: false, firstDuplicate: false }
    }

    state.streak += 1
    state.at = now
    const duplicate = state.streak >= this.threshold
    const firstDuplicate = duplicate && !state.warned
    if (firstDuplicate) state.warned = true
    return { signature, streak: state.streak, duplicate, firstDuplicate }
  }

  /** 测试/收口用：清空全部追踪状态。 */
  reset(): void {
    this.scopes.clear()
  }

  private evict(): void {
    if (this.scopes.size <= this.maxScopes) return
    let oldestKey = ''
    let oldestAt = Infinity
    for (const [key, state] of this.scopes) {
      if (state.at < oldestAt) { oldestAt = state.at; oldestKey = key }
    }
    if (oldestKey) this.scopes.delete(oldestKey)
  }
}
