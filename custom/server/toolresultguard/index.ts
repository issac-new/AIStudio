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
//   TRG_MODEL                模型名（默认 clef-flash-4bit）
//   TRG_TIMEOUT_MS           S1 超时（默认 12000，超时即 fail-open）
//   TRG_TAU_HIGH / TRG_TAU_LOW  三段门控阈值（默认 0.85 / 0.25）
//   TRG_S0_GATE              S0 可疑度门（默认 1：任一规则命中才付 S1 延迟）
//   TRG_HANDOFF=1            灰区回交 S2（默认 0：保持灰区放行+警示）
//   TRG_S2_MODEL             S2 模型（默认 clef-4bit）
//   TRG_S2_TIMEOUT_MS        S2 超时（默认 30000）
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { evaluate, buildSeatRequest, guardPolicyFingerprint, guardSituationKey, normalizeVerdictForStage } from './decide'
import { Breaker, sha1Of } from './client'
import { TtlCache } from './cache'
import { appendAudit, type GuardAuditEntry } from './audit'
import {
  DEFAULT_CONFIG, GUARD_FAST_PATH_MIN_CONFIDENCE,
  type GuardConfig, type GuardDecision, type GuardFastPathPayload, type GuardStage, type JudgeAnswers,
} from './types'
import type { GuardMeta, SystemOneRequest } from './questions'
import {
  observeEntry, advanceConsecutiveAuto,
  type FastPathEntry, type FastPathObservation, type FastPathStore, type SeatFacts, type SeatRequest,
} from '../judgment'
import { atomicWriteText } from '../lib/fs-store'
import { underWebUi } from '../lib/paths'

export * from './types'
export * from './rules'
export { computeSuspicion } from './rules'
export { Breaker, JudgeUnavailableError, parseJudgeAnswers, clefJudge } from './client'
export type { SystemOneRequest, SystemOneQuestion } from './questions'
export { truncateForState } from './questions'
export { TtlCache } from './cache'
export {
  evaluate, buildSeatRequest, guardPolicyFingerprint, guardSituationKey,
  normalizeVerdictForStage, validFastPathPayload,
} from './decide'

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
    fastPathEnabled: envFlag('TRG_FASTPATH'),
    baseUrl: process.env.TRG_BASE_URL?.trim() || undefined,
    model: process.env.TRG_MODEL?.trim() || undefined,
    timeoutMs: envNumber('TRG_TIMEOUT_MS'),
    tauHigh: envNumber('TRG_TAU_HIGH'),
    tauLow: envNumber('TRG_TAU_LOW'),
    s0Gate: envNumber('TRG_S0_GATE'),
    maxStateChars: envNumber('TRG_MAX_STATE_CHARS'),
    cacheTtlMs: envNumber('TRG_CACHE_TTL_MS'),
    handoffS2: envFlag('TRG_HANDOFF'),
    s2Model: process.env.TRG_S2_MODEL?.trim() || undefined,
    s2TimeoutMs: envNumber('TRG_S2_TIMEOUT_MS'),
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

// ── 判定席位快路径（Agnes Harness 吸收批二）──────────────────────────────────
// 落在既有审计目录的独立 JSON（不新建账本域）；同输入同版本重复一致 3 次才 active。
// 读一次进内存、写时原子落盘；坏档按空处理，任何异常都 fail-soft 不阻断判定。

interface FastPathFile {
  version: 1
  updatedAt: number
  entries: Record<string, FastPathEntry<GuardFastPathPayload>>
}

const FAST_PATH_CAP = 2000
let fastPathCache: { file: string; mtimeMs: number; data: FastPathFile } | null = null

function fastPathFile(): string {
  const dir = process.env.TOOLRESULTGUARD_AUDIT_DIR?.trim()
  return join(dir ? resolve(dir) : underWebUi('toolresultguard-audit'), 'toolresultguard-fastpath.json')
}

function emptyFastPathFile(): FastPathFile {
  return { version: 1, updatedAt: 0, entries: {} }
}

function fileMtime(file: string): number {
  try {
    return statSync(file).mtimeMs
  } catch {
    return 0
  }
}

function loadFastPath(file: string): FastPathFile {
  // mtime 检查：外部进程/人工清理后不能继续用旧内存副本（P1 审查发现）。
  const mtimeMs = fileMtime(file)
  if (fastPathCache?.file === file && fastPathCache.mtimeMs === mtimeMs) return fastPathCache.data
  let data = emptyFastPathFile()
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as FastPathFile
      if (parsed && parsed.version === 1 && parsed.entries && typeof parsed.entries === 'object') data = parsed
    }
  } catch { /* 坏档按空处理（下次写覆盖） */ }
  fastPathCache = { file, mtimeMs, data }
  return data
}

function persistFastPath(file: string, data: FastPathFile): void {
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
    const keys = Object.keys(data.entries)
    if (keys.length > FAST_PATH_CAP) {
      const sorted = keys.sort((a, b) => {
        const ea = data.entries[a]
        const eb = data.entries[b]
        const ra = ea.status === 'revoked' ? 0 : 1
        const rb = eb.status === 'revoked' ? 0 : 1
        return ra - rb || ea.lastVerifiedAt - eb.lastVerifiedAt
      })
      for (const key of sorted.slice(0, keys.length - FAST_PATH_CAP)) delete data.entries[key]
    }
    data.updatedAt = Date.now()
    atomicWriteText(file, JSON.stringify(data, null, 2) + '\n')
    // 快路径文件是可被 agent 文件工具触碰的用户目录：收紧到仅本人可读写。
    try { chmodSync(file, 0o600) } catch { /* 权限收紧失败不阻断 */ }
    fastPathCache = { file, mtimeMs: fileMtime(file), data }
  } catch { /* 落盘失败 fail-soft：下次观察再试 */ }
}

class JsonFastPathStore implements FastPathStore<GuardFastPathPayload> {
  private key(request: SeatRequest): string {
    return `${request.situationKey}::${request.policyVersion}::${request.modelVersion}`
  }
  lookup(request: SeatRequest): FastPathEntry<GuardFastPathPayload> | null {
    try {
      const file = fastPathFile()
      return loadFastPath(file).entries[this.key(request)] ?? null
    } catch {
      return null
    }
  }
  observe(request: SeatRequest, observation: FastPathObservation<GuardFastPathPayload>): FastPathEntry<GuardFastPathPayload> | null {
    try {
      const file = fastPathFile()
      const data = loadFastPath(file)
      const key = this.key(request)
      const previous = data.entries[key] ?? null
      const next = observeEntry<GuardFastPathPayload>(previous, request, observation, {
        minConfidence: GUARD_FAST_PATH_MIN_CONFIDENCE,
      })
      // 未验证/低置信/已撤回：observeEntry 原样返回旧对象，不产生写放大。
      if (next === previous) return next
      if (!next) return null
      data.entries[key] = next
      persistFastPath(file, data)
      return next
    } catch {
      return null
    }
  }
  revoke(request: SeatRequest, reason: string): void {
    try {
      const file = fastPathFile()
      const data = loadFastPath(file)
      const key = this.key(request)
      const existing = data.entries[key]
      if (!existing) return
      data.entries[key] = { ...existing, status: 'revoked', revokedAt: Date.now(), revokedReason: reason }
      persistFastPath(file, data)
    } catch { /* fail-soft */ }
  }
  remove(request: SeatRequest): void {
    try {
      const file = fastPathFile()
      const data = loadFastPath(file)
      const key = this.key(request)
      if (!(key in data.entries)) return
      delete data.entries[key]
      persistFastPath(file, data)
    } catch { /* fail-soft */ }
  }
}

const sharedFastPath = new JsonFastPathStore()

/** 连续快路径计数：命中 +1，其余归零；达上限后席位强制回交（再走一次模型）。 */
const consecutiveFastPath = new Map<string, number>()

function seatKey(meta: GuardMeta): string {
  return meta.sessionId ?? 'global'
}

function seatFactsFor(meta: GuardMeta): SeatFacts {
  return { consecutiveAuto: consecutiveFastPath.get(seatKey(meta)) ?? 0 }
}

function noteDecision(meta: GuardMeta, via: string): void {
  const key = seatKey(meta)
  const current = consecutiveFastPath.get(key) ?? 0
  const next = advanceConsecutiveAuto(current, via === 'fast-path' ? 'fast-path' : 'evaluate')
  consecutiveFastPath.set(key, next)
  if (consecutiveFastPath.size > 1000) consecutiveFastPath.clear()
}

/** 人工翻案入口：撤回一条快路径。撤回后不自动复活，需显式 resetFastPath 才能重新观察。 */
export function revokeFastPath(
  stage: GuardStage,
  content: string,
  meta: GuardMeta = {},
  reason = 'manual_revoke',
  overrides: Partial<GuardConfig> = {},
): void {
  const config = loadConfig(overrides)
  sharedFastPath.revoke(buildSeatRequest(stage, sha1Of(content), meta, config), reason)
}

/** 人工确认后重新观察：删除条目（下一次判定从候选重新开始）。 */
export function resetFastPath(
  stage: GuardStage,
  content: string,
  meta: GuardMeta = {},
  overrides: Partial<GuardConfig> = {},
): void {
  const config = loadConfig(overrides)
  sharedFastPath.remove(buildSeatRequest(stage, sha1Of(content), meta, config))
}

/** 测试种子：预置一条已固化条目（只给单测，生产无调用）。 */
export function _seedFastPathForTests(
  stage: GuardStage,
  content: string,
  meta: GuardMeta,
  option: string,
  payload: GuardFastPathPayload,
  overrides: Partial<GuardConfig> = {},
): void {
  const config = loadConfig({ fastPathEnabled: true, ...overrides })
  const request = buildSeatRequest(stage, sha1Of(content), meta, config)
  for (let i = 0; i < 3; i += 1) {
    sharedFastPath.observe(request, { option, confidence: 0.95, verified: true, payload })
  }
}

/** 测试隔离：清空内存快路径与连续计数（文件由 TOOLRESULTGUARD_AUDIT_DIR 隔离）。 */
export function _resetFastPathForTests(): void {
  fastPathCache = null
  consecutiveFastPath.clear()
}

/** 测试面：暴露共享快路径存储，供 evaluate 直连用例注入。 */
export function _fastPathStoreForTests(): FastPathStore<GuardFastPathPayload> {
  return sharedFastPath
}

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
  facts?: SeatFacts,
): Promise<GuardDecision> {
  const decision = await evaluate(stage, content, meta, {
    config,
    cache: sharedCache,
    breaker: sharedBreaker,
    // 快路径独立开关：TRG_FASTPATH=1 才注入，TRG_ENABLED=1 的存量部署升级后行为不变。
    ...(config.fastPathEnabled ? { fastPath: sharedFastPath } : {}),
    seatFacts: { ...seatFactsFor(meta), ...(facts ?? {}) },
    ...(judgeOverride ? { judge: judgeOverride } : {}),
  })
  noteDecision(meta, decision.via)
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
  // 用户发起的输入：第一步永远交给慢系统解析意图，不走快路径（Agnes 强制回交纪律）。
  const decision = await run('input', text, meta, config, { userJustSpoke: true })
  const verdict = normalizeVerdictForStage('input', decision.verdict)
  return {
    blocked: verdict === 'BLOCK',
    verdict,
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
  facts?: SeatFacts,
): Promise<ToolResultGuardResult> {
  const config = loadConfig(overrides)
  const decision = await run('tool_result', content, { ...meta, toolName }, config, facts)
  // 消费端守消费不变量：只有 PASS 才放行；BLOCK/REWRITE 缺正文时也必须隔离，不能落到 pass。
  const verdict = normalizeVerdictForStage('tool_result', decision.verdict)
  if (verdict === 'REWRITE') {
    const rewritten = decision.rewrittenContent
      ?? `[toolresultguard] 已隔离疑似注入内容（sha1=${decision.contentSha}；${decision.reason}）。原文未回注，可查审计台账复核。`
    return { action: 'rewrite', content: rewritten, verdict: 'REWRITE', reason: decision.reason }
  }
  if (verdict === 'CONFIRM') {
    const line = decision.warningLine ?? `[toolresultguard] 可疑内容（${decision.reason}），原文保留，请注意甄别。`
    return { action: 'mark', content: `${line}\n${content}`, verdict: 'CONFIRM', reason: decision.reason }
  }
  return { action: 'pass', verdict, reason: decision.reason }
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
      // 上一步失败：不走近路，先交慢系统（Agnes 强制回交纪律；result.ok 是现成事实）。
      const guarded = await guardToolResult(
        name,
        result.content,
        { source: 'ekko_tool' },
        overrides,
        { priorStepFailed: result.ok === false },
      )
      if (guarded.action === 'pass' || guarded.content === undefined) return undefined
      // 只动 content；ok/error/data 原样保留（工具是否成功与内容是否有毒无关）
      return { ...result, content: guarded.content } as T
    },
  }
}

export { sha1Of }
export { appendAudit, readAudit, _useAuditDirForTests } from './audit'
export type { GuardAuditEntry }
