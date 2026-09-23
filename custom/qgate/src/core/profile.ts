// Profile 解析与裁剪（设计 §4.3/§5.1）：enable/disable（支持点号通配后缀）+ 逐门 override。
// tier 别名只随 Profile 元数据走，不参与求值。

import type { GateSpec, Profile } from './types.js'

export interface ResolvedProfile {
  profileId: string
  tier?: string
  /** 门 id → 是否启用。 */
  enabled: Map<string, boolean>
  /** 覆盖后的 policy（仅含被 override 的字段）。 */
  policyOverrides: Map<string, Partial<GateSpec['spec']['policy']>>
}

function patternMatches(pattern: string, gate: GateSpec): boolean {
  const gateId = gate.metadata.id
  // 质量域模式：`L2` / `L2.*` / `L2.**` 匹配 spec.domain === L2（域是裁剪的一等维度）
  const domainMatch = /^(L[0-5])(?:\.\*{1,2})?$/.exec(pattern)
  if (domainMatch) return gate.spec.domain === domainMatch[1]
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2)
    return gateId === prefix || gateId.startsWith(`${prefix}.`)
  }
  if (pattern.endsWith('.**')) {
    return gateId.startsWith(`${pattern.slice(0, -3)}.`)
  }
  return pattern === gateId
}

export function resolveProfile(
  gates: readonly GateSpec[],
  profile: Profile | undefined,
  configuredProfileId: string | undefined,
): ResolvedProfile {
  const chosen = profile
  // 未配置或未找到 → 全门启用（裁剪是 opt-in，不是默认收缩）
  const resolved: ResolvedProfile = {
    profileId: chosen?.metadata.id ?? configuredProfileId ?? '(all)',
    tier: chosen?.metadata.tier,
    enabled: new Map(gates.map((g) => [g.metadata.id, true])),
    policyOverrides: new Map(),
  }
  if (!chosen) return resolved

  for (const pattern of chosen.spec.disable) {
    for (const g of gates) if (patternMatches(pattern, g)) resolved.enabled.set(g.metadata.id, false)
  }
  for (const pattern of chosen.spec.enable) {
    for (const g of gates) if (patternMatches(pattern, g)) resolved.enabled.set(g.metadata.id, true)
  }
  for (const [gateId, override] of Object.entries(chosen.spec.overrides ?? {})) {
    if (override.policy && Object.keys(override.policy).length > 0) {
      resolved.policyOverrides.set(gateId, override.policy)
    }
  }
  return resolved
}

/** 应用 override 后的有效 policy（供 run/status 使用）。 */
export function effectivePolicy(spec: GateSpec, resolved: ResolvedProfile): GateSpec['spec']['policy'] {
  const override = resolved.policyOverrides.get(spec.metadata.id)
  return override ? { ...spec.spec.policy, ...override } : spec.spec.policy
}

export function findProfile(profiles: readonly Profile[], id: string | undefined): Profile | undefined {
  if (!id) return undefined
  return profiles.find((p) => p.metadata.id === id)
}
