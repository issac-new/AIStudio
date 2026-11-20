// overlay[toolresultguard] P1a · 判定编排核（文 5 §3.3 置信度三段门控）。
//
// 编排顺序（每步都对应一条 P1a 纪律）：
//   disabled → S0 预筛（s0Gate 以下零 S1 成本）→ 判定席位快路径 → 缓存 → 熔断检查
//   → S1 判定 → τ 三段裁决（≥τ_high 重处置 / ≤τ_low 放行 / 灰区 CONFIRM 标记）
//   →（可选）灰区 S2 回交。
//
// 判定席位（Agnes Harness 吸收批二，2026-11-20）：
//   - 快路径键 = 精确情境键 + 策略指纹 + 模型版本；同输入同版本重复一致 3 次才固化。
//   - 快路径是「可复现缓存」而不是「正确性证明」：它只保证同输入同版本下不重复付
//     一次模型调用；正确性仍由原判定核与人工复核负责。
//   - S2 回交默认关（TRG_HANDOFF=1 才开）：灰区在 S1 拿不准时交更强模型再判一次，
//     S2 失败/超时回落既有「灰区放行+警示」行为。
// 本模块保持纯函数面（无 fs/网络副作用，依赖全注入），留痕由 index 层做。
import { computeSuspicion } from './rules'
import { buildInputRequest, buildToolResultRequest, type GuardMeta, type SystemOneRequest } from './questions'
import { Breaker, JudgeUnavailableError, clefJudge, sha1Of, type ClefJudgeDeps } from './client'
import { TtlCache } from './cache'
import { seatMode, type FastPathEntry, type FastPathStore, type SeatFacts, type SeatRequest } from '../judgment'
import type {
  GuardConfig, GuardDecision, GuardFastPathPayload, GuardStage, GuardVerdict, JudgeAnswers,
} from './types'
import { GUARD_FAST_PATH_MIN_CONFIDENCE, GUARD_LOGIC_VERSION } from './types'

export interface EvaluateDeps {
  config: GuardConfig
  judge?: (request: SystemOneRequest, config: GuardConfig) => Promise<JudgeAnswers>
  /** S2 回交判定端（缺省=clefJudge + config.s2Model/s2TimeoutMs）。 */
  s2Judge?: (request: SystemOneRequest, config: GuardConfig) => Promise<JudgeAnswers>
  cache?: TtlCache<GuardDecision>
  breaker?: Breaker
  /** 持久快路径（缺省=不走快路径，行为与旧版一致）。 */
  fastPath?: FastPathStore<GuardFastPathPayload>
  /** 席位即时事实（连续自动判定计数等）。 */
  seatFacts?: SeatFacts
  now?: () => number
  fetchDeps?: ClefJudgeDeps
}

const SEVERITY_FLOOR = 1.5

function baseDecision(stage: GuardStage, via: string, contentSha: string, score0: number, reason: string): GuardDecision {
  return {
    stage, verdict: 'PASS', via, score0, attackP: null, category: null, severity: null,
    rewrittenContent: null, warningLine: null, reason, latencyMs: null, contentSha,
  }
}

function isolationNotice(sha: string, category: string | null, p: number): string {
  return `[toolresultguard] 检测到疑似注入内容（类别 ${category ?? 'unknown'}，置信 ${p.toFixed(2)}），已隔离回注。`
    + `原始内容 sha1=${sha}，可查审计台账人工复核。`
}

function warningLine(score0: number, p: number): string {
  return `[toolresultguard] 可疑信号（S0 规则分 ${score0}，判定 p=${p.toFixed(2)}，灰区）。原文保留，请注意甄别。`
}

/**
 * 策略指纹：模型、阈值、S0 门、S2 模型、截断长度、问句文本。
 * 任一变化都必须让缓存/快路径失效——这正是旧版缓存键缺的维度。
 */
export function guardPolicyFingerprint(stage: GuardStage, config: GuardConfig): string {
  const request = stage === 'input'
    ? buildInputRequest('', {}, config)
    : buildToolResultRequest('', {}, config)
  return sha1Of(JSON.stringify({
    logicVersion: GUARD_LOGIC_VERSION,
    baseUrl: config.baseUrl,
    model: config.model,
    s2Model: config.s2Model,
    handoffS2: config.handoffS2,
    s2TimeoutMs: config.s2TimeoutMs,
    tauHigh: config.tauHigh,
    tauLow: config.tauLow,
    s0Gate: config.s0Gate,
    maxStateChars: config.maxStateChars,
    questions: request.questions,
  }))
}

/**
 * 精确情境键：阶段 + 工具 + 来源 + 内容指纹。
 * 刻意不含 sessionId（否则跨会话永远不命中）与自由文本相似度（历史先例只作参考）。
 */
export function guardSituationKey(stage: GuardStage, contentSha: string, meta: GuardMeta): string {
  return sha1Of(JSON.stringify({
    stage,
    tool: meta.toolName ?? null,
    source: meta.source ?? null,
    contentSha,
  }))
}

/** 席位模型版本：开 S2 回交时把 S2 模型并入，换 S2 即失效。 */
function seatModelVersion(config: GuardConfig): string {
  return config.handoffS2 ? `${config.model}|s2:${config.s2Model}` : config.model
}

export function buildSeatRequest(
  stage: GuardStage,
  contentSha: string,
  meta: GuardMeta,
  config: GuardConfig,
  facts?: SeatFacts,
): SeatRequest {
  return {
    situationKey: guardSituationKey(stage, contentSha, meta),
    policyVersion: guardPolicyFingerprint(stage, config),
    modelVersion: seatModelVersion(config),
    options: ['PASS', 'REWRITE', 'CONFIRM', 'BLOCK'],
    ...(facts ? { facts } : {}),
  }
}

/** S1 判据校准（P2 深化，2026-10-16；探针实测依据见 __tests__/s1-calibration.probe）。 */
function resolveProbability(answers: JudgeAnswers, config: GuardConfig): { effectiveP: number; calibrated: boolean } {
  const categoryAssertsAttack = !!answers.category && answers.category !== 'A0_not_an_attack'
  const calibrated = categoryAssertsAttack && answers.severity >= SEVERITY_FLOOR
  return {
    effectiveP: calibrated ? Math.max(answers.attackP, config.tauHigh) : answers.attackP,
    calibrated,
  }
}

/** 由 S1/S2 答案构造判定（高/低/灰三段；调用方决定 via 与附加上下文）。 */
function decisionFromAnswers(
  stage: GuardStage,
  contentSha: string,
  score0: number,
  answers: JudgeAnswers,
  config: GuardConfig,
  latencyMs: number,
  via: 's1' | 's2-handoff',
  extra: Partial<GuardDecision> = {},
): GuardDecision {
  const { attackP, category, severity } = answers
  const { effectiveP, calibrated } = resolveProbability(answers, config)
  const base: GuardDecision = {
    stage, verdict: 'PASS', via, score0, attackP, category, severity,
    rewrittenContent: null, warningLine: null,
    reason: '', latencyMs, s1LatencyMs: latencyMs, contentSha, ...extra,
  }
  if (effectiveP >= config.tauHigh) {
    const reason = calibrated
      ? `attack p=${attackP.toFixed(2)} + 类别 ${category}/严重度 ${severity.toFixed(2)} 合并信号 ≥ τ_high`
      : `attack p=${attackP.toFixed(2)} ≥ τ_high`
    return stage === 'input'
      ? { ...base, verdict: 'BLOCK', via: via === 's1' && calibrated ? 's1-calibrated' : via, reason }
      : {
          ...base,
          verdict: 'REWRITE',
          via: via === 's1' && calibrated ? 's1-calibrated' : via,
          reason,
          rewrittenContent: isolationNotice(contentSha, category, attackP),
        }
  }
  if (effectiveP <= config.tauLow) {
    return {
      ...base,
      verdict: 'PASS',
      via,
      reason: `clean p=${attackP.toFixed(2)} ≤ τ_low${calibrated ? '（第二信号已合并）' : ''}`,
    }
  }
  const grey: GuardDecision = {
    ...base,
    verdict: 'CONFIRM',
    via,
    reason: `gray p=${attackP.toFixed(2)}`,
    warningLine: warningLine(score0, attackP),
  }
  if (calibrated) {
    grey.warningLine = (grey.warningLine ?? '') + `（类别 ${category} 严重度 ${severity.toFixed(2)}：第二信号已达合并标准，仅概率未过线）`
  }
  return grey
}

/** 脏载荷校验：快路径文件可能被外部改坏；形状不符一律当未命中（fail-closed 到原判定）。 */
export function validFastPathPayload(payload: unknown, option?: string): payload is GuardFastPathPayload {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as GuardFastPathPayload
  if (p.verdict !== 'PASS' && p.verdict !== 'BLOCK' && p.verdict !== 'REWRITE') return false
  if (option !== undefined && p.verdict !== option) return false
  if (typeof p.attackP !== 'number' || !Number.isFinite(p.attackP) || p.attackP < 0 || p.attackP > 1) return false
  if (typeof p.severity !== 'number' || !Number.isFinite(p.severity)) return false
  if (typeof p.reason !== 'string' || p.reason.length > 1000) return false
  if (p.category !== null && typeof p.category !== 'string') return false
  return true
}

/**
 * 跨阶段归一：input 侧只有 BLOCK 会拒跑，tool_result 侧只有 REWRITE 会隔离。
 * 快路径文件若被改坏/串阶段（如 tool_result 出现 BLOCK），必须归一到该阶段的
 * 保守处置，不能让脏载荷落到「放行」。
 */
export function normalizeVerdictForStage(stage: GuardStage, verdict: GuardVerdict): GuardVerdict {
  if (stage === 'input' && verdict === 'REWRITE') return 'BLOCK'
  if (stage === 'tool_result' && verdict === 'BLOCK') return 'REWRITE'
  return verdict
}

/** 快路径命中：用存下来的载荷重建判定，不再调模型。 */
function decisionFromFastPath(
  stage: GuardStage,
  contentSha: string,
  score0: number,
  payload: GuardFastPathPayload,
  fastPathKey: string,
  reason: string,
): GuardDecision {
  const verdict = normalizeVerdictForStage(stage, payload.verdict)
  return {
    stage,
    verdict,
    via: 'fast-path',
    score0,
    attackP: payload.attackP,
    category: payload.category,
    severity: payload.severity,
    rewrittenContent: verdict === 'REWRITE' ? isolationNotice(contentSha, payload.category, payload.attackP) : null,
    warningLine: null,
    reason: `fast-path: ${reason}`,
    latencyMs: null,
    contentSha,
    fastPathKey,
  }
}

function fastPathPayload(decision: GuardDecision): GuardFastPathPayload | null {
  if (decision.verdict === 'CONFIRM') return null
  if (decision.attackP == null || decision.severity == null) return null
  return {
    verdict: decision.verdict,
    attackP: decision.attackP,
    category: decision.category,
    severity: decision.severity,
    reason: decision.reason.slice(0, 500),
  }
}

/** 观测置信度：攻击判定取 attackP，放行判定取 1-attackP。 */
function observationConfidence(decision: GuardDecision): number {
  const p = decision.attackP ?? 0
  return decision.verdict === 'PASS' ? Math.max(0, Math.min(1, 1 - p)) : Math.max(0, Math.min(1, p))
}

/** 非灰判定进入快路径观察；灰区/无载荷不固化。任何异常都不影响判定。 */
function observeFastPath(
  fastPath: FastPathStore<GuardFastPathPayload> | undefined,
  request: SeatRequest,
  decision: GuardDecision,
): void {
  if (!fastPath) return
  const payload = fastPathPayload(decision)
  if (!payload) return
  try {
    fastPath.observe(request, {
      option: payload.verdict,
      confidence: observationConfidence(decision),
      verified: true,
      payload,
    })
  } catch { /* 快路径落盘失败不影响判定 */ }
}

/**
 * 强制回交失败时的兜底：优先沿用已验证快路径，其次沿用进程内上次判定。
 * 只有 hand-back 场景使用——正常路径的失败兜底仍是 fail-open（保持旧行为）。
 * 这是 P0 审查发现：回交后判定端故障不能把已知的 REWRITE/BLOCK 降成 PASS。
 */
function fallbackDecision(
  stage: GuardStage,
  contentSha: string,
  score0: number,
  entry: FastPathEntry<GuardFastPathPayload> | null,
  cached: GuardDecision | undefined,
  why: string,
): GuardDecision | null {
  if (entry && validFastPathPayload(entry.payload, entry.option)) {
    return {
      ...decisionFromFastPath(stage, contentSha, score0, entry.payload, '', `fallback: ${why}`),
      via: 'fast-path-fallback',
      reason: `fast-path fallback: ${why}；沿用已知判定 ${entry.option}（已验证 ${entry.verifiedCount} 次）`,
    }
  }
  if (cached) {
    return { ...cached, via: 'cache-fallback', reason: `${cached.reason}；${why}，沿用上次判定` }
  }
  return null
}

export async function evaluate(
  stage: GuardStage,
  content: string,
  meta: GuardMeta,
  deps: EvaluateDeps,
): Promise<GuardDecision> {
  const { config } = deps
  const now = deps.now ?? Date.now
  const contentSha = sha1Of(content)

  if (!config.enabled) return baseDecision(stage, 'disabled', contentSha, 0, 'guard disabled (default)')

  const suspicion = computeSuspicion(content)
  if (suspicion.score < config.s0Gate) {
    return baseDecision(stage, 's0-clean', contentSha, suspicion.score, `s0 clean (hits=${suspicion.hits.join(',') || 'none'})`)
  }

  const seatRequest = buildSeatRequest(stage, contentSha, meta, config, deps.seatFacts)
  const fastPathKey = `${stage}:${seatRequest.situationKey}:${seatRequest.policyVersion}`

  // 1) 判定席位快路径：S0 已判定可疑才值得查（S0 干净已在上面零成本返回）。
  //    回交=强制重新判定：必须同时绕过缓存，否则「连续 3 步后交慢系统」会被缓存吃掉；
  //    但回交失败时仍要用已知判决兜底，不能把 REWRITE/BLOCK 降成 fail-open PASS。
  let forceEvaluate = false
  let fallbackEntry: FastPathEntry<GuardFastPathPayload> | null = null
  if (deps.fastPath) {
    try {
      fallbackEntry = deps.fastPath.lookup(seatRequest)
      const seat = seatMode<GuardFastPathPayload>(
        seatRequest,
        { minConfidence: GUARD_FAST_PATH_MIN_CONFIDENCE },
        () => fallbackEntry,
      )
      if (seat.mode === 'fast-path' && validFastPathPayload(seat.entry.payload, seat.entry.option)) {
        return decisionFromFastPath(stage, contentSha, suspicion.score, seat.entry.payload, fastPathKey, seat.reason)
      }
      if (seat.mode === 'hand-back') forceEvaluate = true
    } catch { /* 快路径故障不阻断判定：继续走原路径 */ }
  }

  // 2) 进程内 TTL 缓存（键含策略指纹：换模型/阈值不再复用旧结论）。
  //    缓存命中不计入快路径观察（P0 审查：缓存重放不是独立模型调用，不能给固化当证据）。
  const cache = deps.cache ?? new TtlCache<GuardDecision>(config.cacheTtlMs)
  const cacheKey = `${stage}:${contentSha}:${seatRequest.policyVersion}`
  const cachedAny = cache.get(cacheKey)
  if (!forceEvaluate && cachedAny) return { ...cachedAny, via: 'cache' }

  const breaker = deps.breaker ?? new Breaker(config.breakerThreshold, config.breakerCooldownMs)
  if (breaker.isOpen(now())) {
    if (forceEvaluate) {
      const fallback = fallbackDecision(stage, contentSha, suspicion.score, fallbackEntry, cachedAny, 'judge breaker open')
      if (fallback) return fallback
    }
    return baseDecision(stage, 'fail-open-breaker', contentSha, suspicion.score, 'judge breaker open; fail-open')
  }

  const request = stage === 'input'
    ? buildInputRequest(content, meta, config)
    : buildToolResultRequest(content, meta, config)
  const judge = deps.judge ?? ((req, cfg) => clefJudge(req, cfg, deps.fetchDeps))
  const started = now()
  let answers: JudgeAnswers
  try {
    answers = await judge(request, config)
  } catch (error) {
    breaker.recordFailure(now())
    const reason = error instanceof JudgeUnavailableError ? error.message : String(error)
    if (forceEvaluate) {
      const fallback = fallbackDecision(stage, contentSha, suspicion.score, fallbackEntry, cachedAny, `judge unavailable: ${reason}`)
      if (fallback) return fallback
    }
    return baseDecision(stage, 'fail-open-error', contentSha, suspicion.score, `judge unavailable: ${reason}`)
  }
  const latencyMs = now() - started
  breaker.recordSuccess()

  let decision = decisionFromAnswers(stage, contentSha, suspicion.score, answers, config, latencyMs, 's1')

  // 3) 灰区 S2 回交（默认关；S2 失败回落既有灰区行为）。
  if (decision.verdict === 'CONFIRM' && config.handoffS2) {
    const s2Started = now()
    const s2Request: SystemOneRequest = { ...request, model: config.s2Model }
    const s2Judge = deps.s2Judge
      ?? ((req, cfg) => clefJudge(req, { ...cfg, model: cfg.s2Model, timeoutMs: cfg.s2TimeoutMs }, deps.fetchDeps))
    try {
      const s2Answers = await s2Judge(s2Request, config)
      const s2Latency = now() - s2Started
      const resolved = decisionFromAnswers(stage, contentSha, suspicion.score, s2Answers, config, s2Latency, 's2-handoff', {
        latencyMs: latencyMs + s2Latency,
        s1LatencyMs: latencyMs,
        s2LatencyMs: s2Latency,
      })
      decision = {
        ...resolved,
        handoff: { from: 's1', reason: 'gray', model: config.s2Model, resolved: resolved.verdict !== 'CONFIRM' },
      }
    } catch (error) {
      const reason = error instanceof JudgeUnavailableError ? error.message : String(error)
      const s2Latency = now() - s2Started
      decision = {
        ...decision,
        latencyMs: latencyMs + s2Latency,
        s1LatencyMs: latencyMs,
        s2LatencyMs: s2Latency,
        via: 's2-handoff-failed',
        reason: `${decision.reason}；S2 回交失败（${reason}），回落灰区放行`,
        handoff: { from: 's1', reason: 'gray', model: config.s2Model, resolved: false },
      }
    }
  }

  // 4) 非灰判定进入快路径观察（灰区不固化：灰区本来就没有稳定结论）。
  observeFastPath(deps.fastPath, seatRequest, decision)

  cache.set(cacheKey, decision)
  return decision
}
