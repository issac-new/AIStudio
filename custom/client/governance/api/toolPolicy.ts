// overlay/custom/client/governance/api/toolPolicy.ts
// 工具策略数据面（/api/governance/tool-policies*，2026-10-21 AGT 调研轮）。
// DTO 与 governance-controller 新增三端点逐字段对齐；请求走 @/api/client（域内先例）。
import { request } from '@/api/client'

export type PolicyModeDto = 'permissive' | 'strict'
export type PolicyActionDto = 'allow' | 'deny' | 'require_approval'
export type PolicyCategoryDto = 'read' | 'write' | 'exec' | 'network'

export interface ToolPolicyRuleDto {
  id: string
  name: string
  enabled: boolean
  priority: number
  action: PolicyActionDto
  match: {
    tools?: string[]
    categories?: PolicyCategoryDto[]
    users?: string[]
    profiles?: string[]
    argPattern?: string
  }
  reason?: string
}

export interface ToolPolicyDocDto {
  version: 1
  mode: PolicyModeDto
  rules: ToolPolicyRuleDto[]
  updatedAt?: number
  updatedBy?: string
}

export interface PolicyPostureDto {
  status: 'unconfigured' | 'broken' | 'saved-only' | 'strict' | 'permissive'
  mode: PolicyModeDto | null
  totalRules: number
  enabledRules: number
  problems: string[]
  warnings: string[]
}

export interface ToolPolicyStateDto {
  ok: boolean
  exists: boolean
  doc: ToolPolicyDocDto | null
  problems: string[]
  warnings: string[]
  posture: PolicyPostureDto
  enforcement: { masterOn: boolean }
  recent: {
    days: number
    allow: number
    deny: number
    byRule: Array<{ rule: string; count: number; denied: number }>
  }
}

export function fetchToolPolicies(): Promise<ToolPolicyStateDto> {
  return request<ToolPolicyStateDto>('/api/governance/tool-policies')
}

export function fetchStarterPolicyDoc(): Promise<{ ok: boolean; doc: ToolPolicyDocDto }> {
  return request<{ ok: boolean; doc: ToolPolicyDocDto }>('/api/governance/tool-policies/starter')
}

export function lintToolPolicyDoc(doc: unknown): Promise<{ ok: boolean; doc: ToolPolicyDocDto | null; problems: string[]; warnings: string[] }> {
  return request('/api/governance/tool-policies/lint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
}

export function saveToolPolicyDoc(doc: { mode: PolicyModeDto; rules: ToolPolicyRuleDto[] }): Promise<{ ok: boolean; doc: ToolPolicyDocDto; warnings?: string[]; problems?: string[] }> {
  return request('/api/governance/tool-policies', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  })
}
