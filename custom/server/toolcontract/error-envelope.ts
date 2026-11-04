// overlay/toolcontract 域：统一错误信封（2026-11-04 W1 执法轮）。
//
// 来源：vivo《面向技术产品经理的 Agent Harness 设计》04 节——工具应返回稳定
// 结果结构 `{ok:false, code, retryable, requestId, details}`，让执行器据
// retryable 决定重试、据 details 决定跳转已有记录，而不是把异常拼成自然语言。
// 盘点现状：仓内至少四种失败形状并存（error 自由文本 / ok:false / success:false
// / status:'error'），消费方只能按文案正则猜类别。
//
// 本模块只做归一读取（纯函数）：不改变工具原始返回体、不包揽执行器改造——
// 第一步是让审计/执行面拿到统一的机器可读结局。写入侧由 contractGuardHook
// 的拒绝信封与后续执行器改造逐步收敛。
import { classifyToolError, type ErrorCategory, type ToolContract } from './contract'

/** 统一结局信封：ok=true 时 code/category 可缺省，失败时 code/category 必有。 */
export interface ToolOutcome {
  ok: boolean
  /** 稳定错误码（SCREAMING_SNAKE；无稳定词表时按 category 兜底）。 */
  code?: string
  category: ErrorCategory
  retryable: boolean
  /** 日志关联 ID（上游有 requestId/traceId 时透传）。 */
  requestId?: string
  /** 机器可读细节（如幂等重放的既有记录 id）；不落敏感原值。 */
  details?: Record<string, unknown>
  /** 人类可读摘要（截断；仅供日志，不作为判定依据）。 */
  message?: string
}

interface ResultLike {
  ok?: unknown
  error?: unknown
  success?: unknown
  status?: unknown
  code?: unknown
  requestId?: unknown
  request_id?: unknown
  data?: unknown
}

function readOk(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return undefined
}

/**
 * 归一四种存量失败形状为统一信封：
 *   {ok:false} / {error:'...'} / {success:false} / {status:'error'}。
 * 成功结果返回 {ok:true, category:'unknown', retryable:false}——成功路径不强求
 * 类别字段（成功没有类别），消费方按 ok 分流。
 */
export function normalizeToolOutcome(raw: unknown, contract?: ToolContract, now = Date.now()): ToolOutcome {
  const r: ResultLike = raw && typeof raw === 'object' ? (raw as ResultLike) : {}

  const okFlag = readOk(r.ok) ?? readOk(r.success)
  const statusFailed = typeof r.status === 'string' && /error|fail/i.test(r.status)
  const hasError = typeof r.error === 'string' && r.error.length > 0
  const ok = okFlag ?? !(hasError || statusFailed)

  const requestId =
    typeof r.requestId === 'string' ? r.requestId : typeof r.request_id === 'string' ? r.request_id : undefined
  const code = typeof r.code === 'string' && r.code ? r.code : undefined

  if (ok) {
    return { ok: true, category: 'unknown', retryable: false, requestId }
  }

  // 失败：优先复用已有分类器（契约感知的 retryable 判定），错误码兜底词表。
  const info = classifyToolError(r.error ?? raw, contract, now)
  const fallbackCode = `TOOL_${info.category.toUpperCase()}`
  return {
    ok: false,
    code: code ?? fallbackCode,
    category: info.category,
    retryable: info.retryable,
    requestId,
    details: r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : undefined,
    message: typeof r.error === 'string' ? r.error.slice(0, 200) : undefined,
  }
}

/** 契约执法拒绝信封：contractGuardHook 专用（机器可读 code + 违规明细）。 */
export function schemaRejectionEnvelope(issues: Array<{ path: string; rule: string; detail: string }>): {
  ok: false
  code: 'INPUT_SCHEMA_INVALID'
  error: string
  details: { issues: Array<{ path: string; rule: string; detail: string }> }
} {
  return {
    ok: false,
    code: 'INPUT_SCHEMA_INVALID',
    error: `入参违反工具契约：${issues.map((i) => `${i.path}(${i.rule})`).join('; ')}`,
    details: { issues: issues.slice(0, 20) },
  }
}

/** 出参契约违规信封（strict 档改写结果用）。 */
export function outputSchemaViolationEnvelope(issues: Array<{ path: string; rule: string; detail: string }>): {
  ok: false
  code: 'OUTPUT_SCHEMA_INVALID'
  error: string
  details: { issues: Array<{ path: string; rule: string; detail: string }> }
} {
  return {
    ok: false,
    code: 'OUTPUT_SCHEMA_INVALID',
    error: `工具结果违反出参契约：${issues.map((i) => `${i.path}(${i.rule})`).join('; ')}`,
    details: { issues: issues.slice(0, 20) },
  }
}

/**
 * 幂等回放信封：拒绝重复执行＋携带首次结果（文章「跳转已有记录」语义）。
 * 信封构造统一收敛在本模块（失败字面量只在统一出口出现）。
 */
export function idempotentReplayEnvelope(tool: string, cached: unknown, firstAt: number): string {
  return JSON.stringify({
    ok: false,
    code: 'IDEMPOTENT_REPLAY',
    replayed: true,
    tool,
    firstAt,
    cached,
    hint: '同一业务动作已完成（见 cached）；请使用首次结果或改变参数，勿重复调用',
  })
}

/**
 * W4（2026-11-04 未做项收口）：幂等回放的替换形态——patch 565 瀑布 {replace}
 * 判决消费。ok:true 替换首次结果（不再以拒绝形态回放），content 自述回放语义、
 * data 携带首次结果，审计配对完整（pre/post 行齐）。
 */
export function idempotentReplayResult(tool: string, cached: unknown, firstAt: number): {
  ok: true
  content: string
  data: { replayed: true; cached: unknown }
} {
  const payload = {
    code: 'IDEMPOTENT_REPLAY',
    replayed: true,
    tool,
    firstAt,
    cached,
    hint: '同一业务动作已完成，本次为幂等回放首次结果；请直接使用 cached，勿重复调用',
  }
  return {
    ok: true,
    content: JSON.stringify(payload),
    data: { replayed: true, cached },
  }
}


/**
 * 出参违规结果改写（strict 档 postExecute 用）：保留原结果字段，结局置为
 * 失败、content/error 换错误信封——构造细节收敛在本模块，执法钩子只做判定。
 */
export function rewriteAsOutputViolation<T extends { ok: boolean; content: string; error?: string }>(
  result: T,
  issues: Array<{ path: string; rule: string; detail: string }>,
): T & { ok: false; content: string; error: string } {
  const envelope = outputSchemaViolationEnvelope(issues)
  return { ...result, ok: false, content: JSON.stringify(envelope), error: envelope.error }
}
