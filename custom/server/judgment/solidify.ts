// overlay[judgment] 判定席位 · 快路径固化/撤回（纯函数，无 IO）。
//
// 固化条件刻意保守（Agnes 的「3 次一致才固化」纪律，按本仓语义改写）：
//   1. 只有 verified 观察才计数——模型自己的输出不能给自己当证据；
//   2. 同情境 + 同策略版本 + 同模型版本 + 同选项才累加；
//   3. 任意一次人工翻案立即 revoked，不自动复活（复活须人工删除条目）；
//   4. 置信度低于阈值的观察不计数。
import type { FastPathEntry, FastPathObservation, SeatRequest } from './types'
import { DEFAULT_MIN_CONFIDENCE, DEFAULT_SOLIDIFY_AFTER } from './seat'

export interface SolidifyOptions {
  solidifyAfter?: number
  minConfidence?: number
  at?: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

/** 新建候选（verifiedCount=0，不可命中）。 */
export function newCandidate<P = unknown>(request: SeatRequest, at = Date.now()): FastPathEntry<P> {
  return {
    situationKey: request.situationKey,
    policyVersion: request.policyVersion,
    modelVersion: request.modelVersion,
    option: '',
    confidence: 0,
    verifiedCount: 0,
    status: 'candidate',
    createdAt: at,
    lastVerifiedAt: at,
  }
}

/**
 * 应用一次观察。返回 null 表示「无需落盘」（未验证且无既有条目）。
 */
export function observeEntry<P = unknown>(
  existing: FastPathEntry<P> | null,
  request: SeatRequest,
  observation: FastPathObservation<P>,
  options: SolidifyOptions = {},
): FastPathEntry<P> | null {
  const at = observation.at ?? options.at ?? Date.now()
  const solidifyAfter = Math.max(1, Math.trunc(options.solidifyAfter ?? DEFAULT_SOLIDIFY_AFTER))
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE

  if (observation.overturned) {
    if (!existing) return null
    return {
      ...existing,
      status: 'revoked',
      revokedAt: at,
      revokedReason: 'overturned_by_human',
    }
  }
  if (existing?.status === 'revoked') return existing
  if (!observation.verified) return existing
  if (clamp01(observation.confidence) < minConfidence) return existing

  const sameIdentity = existing
    && existing.situationKey === request.situationKey
    && existing.policyVersion === request.policyVersion
    && existing.modelVersion === request.modelVersion
  if (!existing || !sameIdentity || existing.option !== observation.option) {
    return {
      situationKey: request.situationKey,
      policyVersion: request.policyVersion,
      modelVersion: request.modelVersion,
      option: observation.option,
      confidence: clamp01(observation.confidence),
      verifiedCount: 1,
      status: 'candidate',
      createdAt: existing?.createdAt ?? at,
      lastVerifiedAt: at,
      ...(observation.payload !== undefined ? { payload: observation.payload } : {}),
    }
  }

  const verifiedCount = existing.verifiedCount + 1
  // 保守取小：后续观察不能把置信度抬高到超过最早那次的水平。
  const confidence = Math.min(existing.confidence || 1, clamp01(observation.confidence))
  return {
    ...existing,
    verifiedCount,
    confidence,
    status: verifiedCount >= solidifyAfter ? 'active' : 'candidate',
    lastVerifiedAt: at,
    ...(observation.payload !== undefined ? { payload: observation.payload } : {}),
  }
}

/** 人工/策略撤回（不自动复活）。 */
export function revokeEntry<P = unknown>(
  existing: FastPathEntry<P>,
  reason: string,
  at = Date.now(),
): FastPathEntry<P> {
  return { ...existing, status: 'revoked', revokedAt: at, revokedReason: reason }
}
