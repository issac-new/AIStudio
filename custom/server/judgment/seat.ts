// overlay[judgment] 判定席位 · 回交与快路径裁决（纯函数，无 IO）。
//
// 顺序即优先级（Agnes 的强制回交纪律，按本仓语义改写）：
//   用户刚发言 → 上一步失败 → 连续自动判定达上限 → 策略不一致 → 情境不可复现
//   → 快路径（仅 active + 版本匹配 + 选项在允许集 + 置信度过线）→ 原判定。
//
// 快路径只回答「同情境同版本下重复一致过 3 次」；它不回答「这个判定正确」。
// 正确性仍由原判定核与人工复核负责（一手报告自述 Sys1 非幻觉率低于对照 18pp，
// 单次概率不能当正确率）。
import type { FastPathEntry, SeatPolicy, SeatRequest, SeatVerdict } from './types'

export const DEFAULT_MAX_CONSECUTIVE_AUTO = 3
export const DEFAULT_MIN_CONFIDENCE = 0.8
export const DEFAULT_SOLIDIFY_AFTER = 3
export const DEFAULT_MAX_ENTRY_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface ResolvedSeatPolicy {
  maxConsecutiveAuto: number
  minConfidence: number
  solidifyAfter: number
  maxEntryAgeMs: number
}

export function resolveSeatPolicy(policy: SeatPolicy = {}): ResolvedSeatPolicy {
  return {
    maxConsecutiveAuto: policy.maxConsecutiveAuto ?? DEFAULT_MAX_CONSECUTIVE_AUTO,
    minConfidence: policy.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
    solidifyAfter: policy.solidifyAfter ?? DEFAULT_SOLIDIFY_AFTER,
    maxEntryAgeMs: policy.maxEntryAgeMs ?? DEFAULT_MAX_ENTRY_AGE_MS,
  }
}

function back<P>(reason: Extract<SeatVerdict<P>, { mode: 'hand-back' }>['reason'], detail: string): SeatVerdict<P> {
  return { mode: 'hand-back', reason, detail }
}

/**
 * 席位裁决。`lookup` 由调用方注入（各判定点自己的存储）；不传=永远 evaluate。
 */
export function seatMode<P = unknown>(
  request: SeatRequest,
  policy: SeatPolicy = {},
  lookup?: (request: SeatRequest) => FastPathEntry<P> | null,
): SeatVerdict<P> {
  const resolved = resolveSeatPolicy(policy)
  const facts = request.facts ?? {}

  if (facts.userJustSpoke) {
    return back('user_turn', '用户刚发言：第一步交慢系统解析意图与计划')
  }
  if (facts.priorStepFailed) {
    return back('prior_failure', '上一步失败：失败后的下一步不走快路径')
  }
  const consecutive = facts.consecutiveAuto ?? 0
  if (consecutive >= resolved.maxConsecutiveAuto) {
    return back(
      'consecutive_cap',
      `已连续自动判定 ${consecutive} 步（上限 ${resolved.maxConsecutiveAuto}）：强制交慢系统复核，防快路径无人看管地漂移`,
    )
  }
  if (facts.policyMismatch) {
    return back('policy_mismatch', '当前策略与运行时不一致：版本未对齐时不走近路')
  }
  if (!request.situationKey.trim() || !request.policyVersion.trim() || !request.modelVersion.trim()) {
    return back('unknown_situation', '情境键/策略版本/模型版本缺失：无法建立可复现的判定')
  }
  if (request.options.length === 0) {
    return back('unknown_situation', '选项集为空：没有可判定的候选')
  }

  const entry = lookup ? lookup(request) : null
  if (!entry) return { mode: 'evaluate', reason: '无已验证快路径' }
  if (entry.situationKey !== request.situationKey) {
    return { mode: 'evaluate', reason: '快路径情境键不符（条目损坏或串键）' }
  }
  if (!Number.isFinite(entry.confidence) || !Number.isFinite(entry.verifiedCount)) {
    return { mode: 'evaluate', reason: '快路径条目数值损坏' }
  }
  const now = policy.now ? policy.now() : Date.now()
  if (now - entry.lastVerifiedAt > resolved.maxEntryAgeMs) {
    return { mode: 'evaluate', reason: `快路径过期（超过 ${Math.round(resolved.maxEntryAgeMs / 86_400_000)} 天未再验证）` }
  }
  if (entry.status !== 'active') {
    return { mode: 'evaluate', reason: `快路径未固化（status=${entry.status}）` }
  }
  if (entry.verifiedCount < resolved.solidifyAfter) {
    return {
      mode: 'evaluate',
      reason: `已验证次数不足（${entry.verifiedCount}/${resolved.solidifyAfter}）`,
    }
  }
  if (entry.policyVersion !== request.policyVersion) {
    return { mode: 'evaluate', reason: '策略版本不符：快路径失效' }
  }
  if (entry.modelVersion !== request.modelVersion) {
    return { mode: 'evaluate', reason: '模型版本不符：快路径失效' }
  }
  if (!request.options.includes(entry.option)) {
    return { mode: 'evaluate', reason: `快路径选项 ${entry.option} 不在允许集内` }
  }
  if (entry.confidence < resolved.minConfidence) {
    return {
      mode: 'evaluate',
      reason: `快路径置信度 ${entry.confidence.toFixed(2)} 低于阈值 ${resolved.minConfidence.toFixed(2)}`,
    }
  }
  return {
    mode: 'fast-path',
    entry,
    reason: `已验证 ${entry.verifiedCount} 次一致（策略/模型版本匹配）`,
  }
}

/** 连续自动判定计数推进：快路径 +1，其余（回交/原判定）归零。 */
export function advanceConsecutiveAuto(current: number, mode: SeatVerdict['mode']): number {
  return mode === 'fast-path' ? current + 1 : 0
}
