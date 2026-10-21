// overlay/custom/client/governance/api/mcpSecurity.ts
// MCP 注册面安全扫描数据面（/api/governance/mcp-security-scan，2026-10-21 AGT 调研轮三）。
import { request } from '@/api/client'

export type McpScanSeverityDto = 'high' | 'medium' | 'low'
export type McpScanKindDto = 'dangerous-command' | 'embedded-secret' | 'remote-url' | 'typosquat' | 'suspicious-path'

export interface McpSecurityFindingDto {
  severity: McpScanSeverityDto
  kind: McpScanKindDto
  server: string
  profiles: string[]
  profileCount: number
  detail: string
}

export interface McpSecurityScanDto {
  ok: boolean
  profilesScanned: number
  serversScanned: number
  uniqueServers: number
  findings: McpSecurityFindingDto[]
  summary: Record<McpScanSeverityDto, number>
  problems: string[]
  meta: { boundary: string }
}

export function fetchMcpSecurityScan(): Promise<McpSecurityScanDto> {
  return request<McpSecurityScanDto>('/api/governance/mcp-security-scan')
}
