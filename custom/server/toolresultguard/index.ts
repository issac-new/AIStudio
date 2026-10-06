// overlay[toolresultguard] P1a · 公共面（2026-10-06 五文轮，文 5 安全围栏）。
//
// 两个消费点：
//   1. stage=tool_result：由 custom/server/toolpipeline/tool-hooks.ts 组合进
//      ekkoToolExecuteHooks 的 postExecute（工具结果回填模型前，patch 565/566
//      既有瀑布，本域零新增 patch）。
//   2. stage=input：patch 571 挂 handle-ekko-agent-run 入口（状态创建前）。
// 配置（env，全部 TRG_ 前缀，默认关）：
//   TRG_ENABLED=1            总开关（默认 0；关闭时全部判定零成本直通）
//   TRG_BASE_URL             S1 端点（默认 http://127.0.0.1:8000，本地 clef serve）
//   TRG_MODEL                模型名（默认 clef-4bit）
//   TRG_TIMEOUT_MS           S1 超时（默认 3000，超时即 fail-open）
//   TRG_TAU_HIGH / TRG_TAU_LOW  三段门控阈值（默认 0.85 / 0.25）
//   TRG_S0_GATE              S0 可疑度门（默认 1：任一规则命中才付 S1 延迟）
import { evaluate } from './decide'
import { Breaker, sha1Of } from './client'
import { TtlCache } from './cache'
import { appendAudit, type GuardAuditEntry } from './audit'
import { DEFAULT_CONFIG, type GuardConfig, type GuardDecision, type GuardStage, type JudgeAnswers } from './types'
import type { GuardMeta, SystemOneRequest } from './questions'

export * from './types'
export * from './rules'
export { computeSuspicion } from './rules'
export { Breaker, JudgeUnavailableError, parseJudgeAnswers, clefJudge } from './client'
export type { SystemOneRequest, SystemOneQuestion } from './questions'
export { truncateForState } from './questions'
export { TtlCache } from './cache'
export { evaluate } from './decide'

function envFlag(name: string): boolean | undefined {
  const raw = process.env[name]?.trim()
  if (!raw) return undefined
  return raw === '1' || raw.toLowerCase() === 'true'
}
function envNumber(name: string): number | undefined {
  const raw = process.env[name]?.trim()
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

export function loadConfig(overrides: Partial<GuardConfig> = {}): GuardConfig {
  const env = {
    enabled: envFlag('TRG_ENABLED'),
    baseUrl: process.env.TRG_BASE_URL?.trim() || undefined,
    model: process.env.TRG_MODEL?.trim() || undefined,
    timeoutMs: envNumber('TRG_TIMEOUT_MS'),
    tauHigh: envNumber('TRG_TAU_HIGH'),
    tauLow: envNumber('TRG_TAU_LOW'),
    s0Gate: envNumber('TRG_S0_GATE'),
    maxStateChars: envNumber('TRG_MAX_STATE_CHARS'),
    cacheTtlMs: envNumber('TRG_CACHE_TTL_MS'),
  }
  const merged = { ...DEFAULT_CONFIG }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value
  }
  return { ...merged, ...overrides }
}

/** 进程级共享实例（缓存/熔断器跨判定复用；env 热读由 TRG_RELOAD 之外的测试覆盖）。 */
const sharedCache = new TtlCache<GuardDecision>(DEFAULT_CONFIG.cacheTtlMs)
const sharedBreaker = new Breaker(DEFAULT_CONFIG.breakerThreshold, DEFAULT_CONFIG.breakerCooldownMs)

/** 判定端注入钩子：仅测试用（公共面端到端走 mock 判定），生产恒 null。 */
let judgeOverride: ((request: SystemOneRequest, config: GuardConfig) => Promise<JudgeAnswers>) | null = null
export function _useJudgeForTests(fn: typeof judgeOverride): void {
  judgeOverride = fn
}

async function run(
  stage: GuardStage,
  content: string,
  meta: GuardMeta,
  config: GuardConfig,
): Promise<GuardDecision> {
  const decision = await evaluate(stage, content, meta, {
    config, cache: sharedCache, breaker: sharedBreaker, ...(judgeOverride ? { judge: judgeOverride } : {}),
  })
  appendAudit({ ...decision, ts: Date.now(), tool: meta.toolName, source: meta.source, sessionId: meta.sessionId })
  return decision
}

export interface InputGuardResult {
  blocked: boolean
  verdict: GuardDecision['verdict']
  reason: string
}

/** 输入侧围栏（patch 571 消费）：BLOCK 以外一律放行（CONFIRM=放行+留痕警示）。 */
export async function guardUserInput(
  text: string,
  meta: GuardMeta = {},
  overrides: Partial<GuardConfig> = {},
): Promise<InputGuardResult> {
  const config = loadConfig(overrides)
  const decision = await run('input', text, meta, config)
  return {
    blocked: decision.verdict === 'BLOCK',
    verdict: decision.verdict,
    reason: decision.reason,
  }
}

export type ToolResultAction = 'pass' | 'rewrite' | 'mark'

export interface ToolResultGuardResult {
  action: ToolResultAction
  /** action=rewrite/mark 时的新内容；pass 时 undefined（原样回注） */
  content?: string
  verdict: GuardDecision['verdict']
  reason: string
}

/** 工具结果回注侧围栏（toolpipeline 钩子消费）。 */
export async function guardToolResult(
  toolName: string,
  content: string,
  meta: GuardMeta = {},
  overrides: Partial<GuardConfig> = {},
): Promise<ToolResultGuardResult> {
  const config = loadConfig(overrides)
  const decision = await run('tool_result', content, { ...meta, toolName }, config)
  if (decision.verdict === 'REWRITE' && decision.rewrittenContent) {
    return { action: 'rewrite', content: decision.rewrittenContent, verdict: decision.verdict, reason: decision.reason }
  }
  if (decision.verdict === 'CONFIRM' && decision.warningLine) {
    return { action: 'mark', content: `${decision.warningLine}\n${content}`, verdict: decision.verdict, reason: decision.reason }
  }
  return { action: 'pass', verdict: decision.verdict, reason: decision.reason }
}

/** ekko ToolExecuteHook 形状（结构化类型，不 import 上游——tool-hooks.ts 同款先例）。 */
export interface EkkoToolResultLike {
  ok: boolean
  content: string
  contentParts?: unknown
  data?: unknown
  error?: string
}

/** 生成挂进 ekkoToolExecuteHooks 的 postExecute 钩子（结果回填模型前）。 */
export function ekkoGuardHook(overrides: Partial<GuardConfig> = {}) {
  return {
    // 泛型保形：进什么结果类型就回什么类型（只改 content 字段），
    // 以结构化类型满足上游 ToolExecuteHook.postExecute 的 AgentToolResult 契约。
    async postExecute<T extends { ok: boolean; content: string }>(name: string, _input: Record<string, unknown>, result: T) {
      if (typeof result?.content !== 'string' || result.content.length < 8) return undefined
      const guarded = await guardToolResult(name, result.content, { source: 'ekko_tool' }, overrides)
      if (guarded.action === 'pass' || guarded.content === undefined) return undefined
      // 只动 content；ok/error/data 原样保留（工具是否成功与内容是否有毒无关）
      return { ...result, content: guarded.content } as T
    },
  }
}

export { sha1Of }
export { appendAudit, readAudit, _useAuditDirForTests } from './audit'
export type { GuardAuditEntry }
