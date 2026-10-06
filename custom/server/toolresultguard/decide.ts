// overlay[toolresultguard] P1a · 判定编排核（文 5 §3.3 置信度三段门控）。
//
// 编排顺序（每步都对应一条 P1a 纪律）：
//   disabled → S0 预筛（s0Gate 以下零 S1 成本）→ 缓存 → 熔断检查 → S1 判定
//   → τ 三段裁决（≥τ_high 重处置 / ≤τ_low 放行 / 灰区 CONFIRM 标记）。
// S2 灰区 LLM 复核不在 v1：灰区现行为"放行 + 警示标记 + 留痕"，等 P1b 与
// 实测延迟数据后再决定是否补（如实声明，不冒充已有纵深）。
// 本模块保持纯函数面（无 fs/网络副作用，依赖全注入），留痕由 index 层做。
import { computeSuspicion } from './rules'
import { buildInputRequest, buildToolResultRequest, type GuardMeta, type SystemOneRequest } from './questions'
import { Breaker, JudgeUnavailableError, clefJudge, sha1Of, type ClefJudgeDeps } from './client'
import { TtlCache } from './cache'
import type { GuardConfig, GuardDecision, GuardStage, JudgeAnswers } from './types'

export interface EvaluateDeps {
  config: GuardConfig
  judge?: (request: SystemOneRequest, config: GuardConfig) => Promise<JudgeAnswers>
  cache?: TtlCache<GuardDecision>
  breaker?: Breaker
  now?: () => number
  fetchDeps?: ClefJudgeDeps
}

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

  const cache = deps.cache ?? new TtlCache<GuardDecision>(config.cacheTtlMs)
  const cacheKey = `${stage}:${contentSha}`
  const cached = cache.get(cacheKey)
  if (cached) return { ...cached, via: 'cache' }

  const breaker = deps.breaker ?? new Breaker(config.breakerThreshold, config.breakerCooldownMs)
  if (breaker.isOpen(now())) {
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
    return baseDecision(stage, 'fail-open-error', contentSha, suspicion.score, `judge unavailable: ${reason}`)
  }
  const latencyMs = now() - started
  breaker.recordSuccess()

  const { attackP, category, severity } = answers
  let decision: GuardDecision
  if (attackP >= config.tauHigh) {
    decision = stage === 'input'
      ? { ...baseDecision(stage, 's1', contentSha, suspicion.score, `attack p=${attackP.toFixed(2)} ≥ τ_high`),
          verdict: 'BLOCK', attackP, category, severity, latencyMs }
      : { ...baseDecision(stage, 's1', contentSha, suspicion.score, `attack p=${attackP.toFixed(2)} ≥ τ_high`),
          verdict: 'REWRITE', attackP, category, severity, latencyMs,
          rewrittenContent: isolationNotice(contentSha, category, attackP) }
  } else if (attackP <= config.tauLow) {
    decision = { ...baseDecision(stage, 's1', contentSha, suspicion.score, `clean p=${attackP.toFixed(2)} ≤ τ_low`),
      attackP, category, severity, latencyMs }
  } else {
    decision = { ...baseDecision(stage, 's1', contentSha, suspicion.score, `gray p=${attackP.toFixed(2)}`),
      verdict: 'CONFIRM', attackP, category, severity, latencyMs, warningLine: warningLine(suspicion.score, attackP) }
  }
  cache.set(cacheKey, decision)
  return decision
}
