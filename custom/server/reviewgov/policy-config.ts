// overlay/custom/server/reviewgov/policy-config.ts
// 有效评审策略装载：内置默认值 + 可选 JSON 覆盖。
// 覆盖文件优先级：HERMES_REVIEW_POLICY_FILE > <cwd>/config/review-policy.json。
// 覆盖采用浅合并（tiers/convergence/circuitBreaker 逐键合并，数组整体替换），
// 未知键忽略，非法值回落默认，避免一份坏配置把审批门槛清零。
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { DEFAULT_POLICY, type ReviewPolicy } from './types'

function candidateFiles(): string[] {
  const out: string[] = []
  const explicit = process.env.HERMES_REVIEW_POLICY_FILE?.trim()
  if (explicit) out.push(resolve(explicit))
  out.push(resolve(process.cwd(), 'config/review-policy.json'))
  return out
}

function asStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null
  return v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
}

function mergePolicy(base: ReviewPolicy, raw: unknown): ReviewPolicy {
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  const next: ReviewPolicy = { ...base }
  const tiers = o.tiers as Record<string, unknown> | undefined
  if (tiers && typeof tiers === 'object') {
    const t = { ...base.tiers }
    for (const key of ['low', 'medium', 'high'] as const) {
      const v = tiers[key]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) t[key] = Math.floor(v)
    }
    next.tiers = t
  }
  for (const key of ['trustedAuthors', 'protectedPaths', 'sensitivePaths', 'docPaths', 'internalPaths'] as const) {
    const arr = asStringArray(o[key])
    if (arr) next[key] = arr
  }
  const conv = o.convergence as Record<string, unknown> | undefined
  if (conv && typeof conv === 'object') {
    const c = { ...base.convergence }
    if (typeof conv.maxRounds === 'number' && conv.maxRounds >= 1) c.maxRounds = Math.floor(conv.maxRounds)
    if (typeof conv.diffOnlyAfterRound === 'number' && conv.diffOnlyAfterRound >= 0) c.diffOnlyAfterRound = Math.floor(conv.diffOnlyAfterRound)
    if (typeof conv.nitBudgetPerRound === 'number' && conv.nitBudgetPerRound >= 0) c.nitBudgetPerRound = Math.floor(conv.nitBudgetPerRound)
    if (typeof conv.deferPreexisting === 'boolean') c.deferPreexisting = conv.deferPreexisting
    next.convergence = c
  }
  const cb = o.circuitBreaker as Record<string, unknown> | undefined
  if (cb && typeof cb === 'object') {
    const c = { ...base.circuitBreaker }
    if (typeof cb.windowHours === 'number' && cb.windowHours > 0) c.windowHours = cb.windowHours
    if (typeof cb.revertRateThreshold === 'number' && cb.revertRateThreshold >= 0) c.revertRateThreshold = cb.revertRateThreshold
    if (typeof cb.incidentCountThreshold === 'number' && cb.incidentCountThreshold >= 0) c.incidentCountThreshold = Math.floor(cb.incidentCountThreshold)
    if (typeof cb.escalateOneTier === 'boolean') c.escalateOneTier = cb.escalateOneTier
    next.circuitBreaker = c
  }
  for (const key of ['largeDiffLines', 'hugeDiffLines'] as const) {
    const v = o[key]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) next[key] = Math.floor(v)
  }
  return next
}

/** 读取有效策略（每次调用都读盘，便于测试与热改；IO 很小）。 */
export function loadReviewPolicy(): ReviewPolicy {
  let policy = { ...DEFAULT_POLICY }
  for (const file of candidateFiles()) {
    if (!existsSync(file)) continue
    try {
      policy = mergePolicy(policy, JSON.parse(readFileSync(file, 'utf8')))
      break
    } catch (err) {
      console.warn(`[reviewgov] 策略文件解析失败，回落内置默认：${file} ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const envTrusted = process.env.HERMES_REVIEW_TRUSTED_AUTHORS?.split(',').map((s) => s.trim()).filter(Boolean)
  if (envTrusted?.length) {
    policy = { ...policy, trustedAuthors: [...new Set([...policy.trustedAuthors, ...envTrusted])] }
  }
  return policy
}
