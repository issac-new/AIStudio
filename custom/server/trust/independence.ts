// overlay/trust 域：审阅者独立性声明（四性四格收敛批 C3，2026-11-03）。
//
// 背景：trust 域已机械拒绝「主张人自审」（auditor === claimedBy 直接 400），但它只比对
// 身份字符串。测试者与写码者用两个账号、却共用同一模型时，身份检查过得去，模型级
// 独立性并不成立。这是个无法消除的事实（换模型成本不可控、运行时未必能取到指纹），
// 但可以做到「可见 + 可策略拒绝」。
//
// 三态：
//   independent  两枚指纹都存在且不同
//   same-model   两枚指纹都存在且相同（共模）
//   unknown      至少一枚缺失（取不到指纹时不猜成独立）
//
// 策略（env HERMES_TRUST_INDEPENDENCE）：
//   report（默认）          只记录，不改裁决
//   require-for-verified    共模时 verified 裁决直接拒（unverified/refuted 不受影响）
//
// 指纹算法：provider|model|version 归一化（小写、去空白）后 sha1，只存摘要不存原值，
// 避免把部署细节写进证据账。

import { createHash } from 'node:crypto'

export const INDEPENDENCE_POLICIES = ['report', 'require-for-verified'] as const
export type IndependencePolicyMode = (typeof INDEPENDENCE_POLICIES)[number]

export interface IndependencePolicy {
  mode: IndependencePolicyMode
  raw: string | null
  policyInvalid: boolean
}

export interface ModelRef {
  provider?: string
  model?: string
  version?: string
}

export type IndependenceStatus = 'independent' | 'same-model' | 'unknown'

export interface IndependenceAssessment {
  status: IndependenceStatus
  /** 作者模型指纹（空串=未提供）。 */
  authorFingerprint: string
  /** 审阅者模型指纹（空串=未提供）。 */
  reviewerFingerprint: string
  /** 策略开启且共模时，verified 裁决不被接受。 */
  blocksVerified: boolean
  reason?: string
}

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

/** 模型指纹：三要素归一化后 sha1；全空返回空串（不伪造指纹）。 */
export function modelFingerprint(ref: ModelRef | null | undefined): string {
  if (!ref) return ''
  const provider = norm(ref.provider)
  const model = norm(ref.model)
  const version = norm(ref.version)
  if (!provider && !model && !version) return ''
  return createHash('sha1').update(`${provider}|${model}|${version}`).digest('hex')
}

/** 策略解析：缺省 report；非法值回落 report 并标 invalid（不静默）。 */
export function resolveIndependencePolicy(
  env: Record<string, string | undefined> = process.env,
): IndependencePolicy {
  const raw = env.HERMES_TRUST_INDEPENDENCE?.trim() || null
  if (!raw) return { mode: 'report', raw: null, policyInvalid: false }
  if ((INDEPENDENCE_POLICIES as readonly string[]).includes(raw)) {
    return { mode: raw as IndependencePolicyMode, raw, policyInvalid: false }
  }
  return { mode: 'report', raw, policyInvalid: true }
}

/**
 * 独立性判定（纯函数）。
 * 缺指纹一律 unknown——取不到就说取不到，不默认成 independent。
 */
export function assessIndependence(input: {
  authorModel?: ModelRef | null
  reviewerModel?: ModelRef | null
  policy?: IndependencePolicy
}): IndependenceAssessment {
  const authorFingerprint = modelFingerprint(input.authorModel)
  const reviewerFingerprint = modelFingerprint(input.reviewerModel)
  const policy = input.policy ?? { mode: 'report' as const, raw: null, policyInvalid: false }

  let status: IndependenceStatus
  let reason: string | undefined
  if (!authorFingerprint || !reviewerFingerprint) {
    status = 'unknown'
    reason = '作者或审阅者模型指纹缺席：不判独立，如实标未取得'
  } else if (authorFingerprint === reviewerFingerprint) {
    status = 'same-model'
    reason = '作者与审阅者模型指纹相同：身份可分离但模型级不独立'
  } else {
    status = 'independent'
  }

  const blocksVerified = policy.mode === 'require-for-verified' && status === 'same-model'
  return {
    status,
    authorFingerprint,
    reviewerFingerprint,
    blocksVerified,
    ...(reason ? { reason } : {}),
  }
}
