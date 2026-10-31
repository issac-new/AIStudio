// custom/server/orchestrator/mandate.ts
// Mandate 签发、撤销与重新校验（2026-10-31 A+B 批 spec §4.2）。
// 语义对照 docs/002-authorization.md：
//   Mandate 记录「哪条 Decision 授权了哪个 Ticket、按什么范围与强度」；
//   人员 stop 撤销、策略变更后 revalidate 失败即失效。
// 默认策略版本不匹配只告警（spec D10），严格模式下拒绝。
import { getAdmission, admit } from './admission'
import { policyVersionCheck } from './policy-version'
import { getMandate, insertMandate, listMandates, revokeMandate } from './store'
import type { AuthStrength, Mandate } from './types'

function newMandateId(): string {
  const t = Date.now().toString(36).padStart(9, '0')
  const r = Math.random().toString(36).slice(2, 10).padStart(8, '0')
  return `man_${t}${r}`
}

export interface RevalidateResult {
  valid: boolean
  reason: string
  /** 非阻断告警：policy 版本落后但未开严格模式。 */
  warnings: string[]
}

export function issueMandate(input: {
  decisionId: string
  ticketId: string
  scope: Record<string, unknown>
  strength: AuthStrength
  ruleIds: string[]
  policyVersion: number
  issuer: string
  ttlMs?: number
  issuedAt?: number
}): Mandate {
  const issuedAt = input.issuedAt ?? Date.now()
  const mandate: Mandate = {
    id: newMandateId(),
    decisionId: input.decisionId,
    ticketId: input.ticketId,
    scope: input.scope ?? {},
    strength: input.strength,
    ruleIds: Array.isArray(input.ruleIds) ? input.ruleIds.slice() : [],
    policyVersion: Number.isFinite(input.policyVersion) ? Math.max(0, Math.floor(input.policyVersion)) : 0,
    issuer: input.issuer,
    issuedAt,
    expiresAt: typeof input.ttlMs === 'number' && Number.isFinite(input.ttlMs) && input.ttlMs > 0
      ? issuedAt + Math.floor(input.ttlMs)
      : null,
    revokedAt: null,
    revokedReason: null,
  }
  insertMandate(mandate)
  return mandate
}

export function revoke(id: string, reason: string): boolean {
  return revokeMandate(id, reason)
}

/** 有未撤销且未过期的凭证即视为授权有效（不关心具体哪一条）。 */
export function activeMandateFor(ticketId: string, at = Date.now()): Mandate | null {
  const rows = listMandates(ticketId, 20)
  return rows.find(m => m.revokedAt === null && (m.expiresAt === null || m.expiresAt > at)) ?? null
}

/**
 * 续作前重新校验（对应上游 revalidation）：
 * 1) 未撤销；2) 未过期；3) 策略版本仍满足（严格模式拒绝，默认告警）；
 * 4) 若签发依据含 inferred，则源准入必须仍允许 inferred（否则失效）。
 */
export function revalidate(
  mandateId: string,
  ctx: {
    currentSenderListed?: boolean
    addressed?: boolean
    nowMs?: number
    env?: NodeJS.ProcessEnv
  } = {},
): RevalidateResult {
  const mandate = getMandate(mandateId)
  if (!mandate) return { valid: false, reason: 'not_found', warnings: [] }
  if (mandate.revokedAt !== null) return { valid: false, reason: 'revoked', warnings: [] }
  const now = ctx.nowMs ?? Date.now()
  if (mandate.expiresAt !== null && now >= mandate.expiresAt) return { valid: false, reason: 'expired', warnings: [] }

  const warnings: string[] = []
  const versionCheck = policyVersionCheck('source-admission', mandate.policyVersion, { env: ctx.env })
  if (!versionCheck.ok) {
    return { valid: false, reason: 'policy_version_changed', warnings }
  }
  if (versionCheck.recorded < versionCheck.current) {
    warnings.push(`policy_version_outdated:${versionCheck.recorded}<${versionCheck.current}`)
  }

  if (mandate.strength === 'inferred') {
    // 推断型授权依赖准入表：源配置缺失或已收紧即失效。
    const admission = getAdmission(String(mandate.scope.sourceId ?? ''))
    if (!admission) return { valid: false, reason: 'admission_missing', warnings }
    const result = admit(admission, ctx.currentSenderListed ?? false, ctx.addressed ?? false)
    if (result.action !== 'inferred' && result.action !== 'accept') {
      return { valid: false, reason: 'admission_downgraded', warnings }
    }
  }

  return { valid: true, reason: 'ok', warnings }
}
