import type { RouteLocationRaw } from 'vue-router'

export type TenantKind = 'matrix' | 'session' | 'group' | 'plain'

export interface ParsedTenant {
  kind: TenantKind
  label: string
  routeTarget?: RouteLocationRaw
  raw: string
}

/**
 * tenant 三段式解析（决策 #9/#10）：
 *   matrix:<roomId>:<name>           （roomId 可含冒号，如 !abc:matrix.org）
 *   session:<sessionId>[@<profile>]:<name>
 *   group:<roomId>:<name>
 *   <其他>                            （plain，仅作分组键）
 */
export function parseTenant(tenant: string | null | undefined): ParsedTenant | null {
  if (!tenant) return null
  const parts = tenant.split(':')
  const prefix = parts[0]

  if (prefix === 'matrix' || prefix === 'group') {
    // 最后一节是 name，其余（去掉 prefix）拼回 roomId（roomId 可能含冒号）
    if (parts.length < 3) {
      // 格式不全（如 'matrix:X'），fallback 为 plain
      return { kind: 'plain', label: tenant, raw: tenant }
    }
    const id = parts.slice(1, -1).join(':')
    const name = parts[parts.length - 1] || id
    return {
      kind: prefix,
      label: name,
      raw: tenant,
      routeTarget: {
        name: prefix === 'matrix' ? 'hermes.matrixChatRoom' : 'hermes.groupChatRoom',
        params: { roomId: id },
      },
    }
  }

  if (prefix === 'session') {
    // rest = '<sessionId>[@<profile>]:<name>'
    const rest = parts.slice(1).join(':')
    const firstColon = rest.indexOf(':')
    const idPart = firstColon >= 0 ? rest.slice(0, firstColon) : rest
    const name = firstColon >= 0 ? rest.slice(firstColon + 1) : idPart
    const atIdx = idPart.indexOf('@')
    const sessionId = atIdx > 0 ? idPart.slice(0, atIdx) : idPart
    const profile = atIdx > 0 ? idPart.slice(atIdx + 1) : undefined
    return {
      kind: 'session',
      label: name || sessionId,
      raw: tenant,
      routeTarget: {
        name: 'hermes.session',
        params: { sessionId },
        query: profile ? { profile } : {},
      },
    }
  }

  return { kind: 'plain', label: tenant, raw: tenant }
}
