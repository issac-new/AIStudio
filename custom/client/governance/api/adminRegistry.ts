// overlay/custom/client/governance/api/adminRegistry.ts
// P6-P8 管理维护 API 客户端（/api/governance/registry|matrix-*）。
import { request } from '@/api/client'

export interface RegistryDoc { markdown: string; commit: string }

export function fetchRegistry(kind: 'roster' | 'app-registry' | 'org'): Promise<RegistryDoc> {
  return request(`/api/governance/registry/${kind}`)
}

export function saveRegistry(kind: 'roster' | 'app-registry' | 'org', markdown: string, message: string, actor?: string): Promise<{ commit: string }> {
  return request(`/api/governance/registry/${kind}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown, message, actor }),
  })
}

export function provisionAccount(inp: Record<string, string>): Promise<{ created: string[]; rosterCommit: string }> {
  return request('/api/governance/matrix-users', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inp),
  })
}

export function offboardAccount(inp: Record<string, unknown>): Promise<{ handoverCommit: string; deactivated: string[]; auditCommit: string }> {
  return request('/api/governance/matrix-offboard', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inp),
  })
}

/** D20 账号邀请：服务端生成一次性初始口令预建号；口令只在本次响应中出现 */
export interface InviteResult {
  created: string[]; rosterCommit: string; invitesCommit: string
  userId: string; initialPassword: string; expires: string
}
export function createInvite(inp: Record<string, string | number>): Promise<InviteResult> {
  return request('/api/governance/invites', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inp),
  })
}
