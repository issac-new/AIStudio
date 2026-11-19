// overlay/custom/client/governance/api/capability-pool.ts
// 能力池地基（批二点五）数据面：/api/harness/capabilitypool/* + /api/metricpolicy/capability。
// DTO 与服务端 capabilitypool/types.ts、metricpolicy/types.ts 逐字段对齐；请求走 @/api/client。
import { request } from '@/api/client'
import type { DerivedReadingDto } from './org-governance'

export interface CapabilitySourceAvailabilityDto {
  available: boolean
  note?: string
}

export interface CapabilityGapRowDto {
  tag: string
  demand: number
  supplyUnits: number
  supplyAgents: number
  supplySkills: number
  gap: number
  distinctBoards: number
  supplyLeadTimeMedianMs: number | null
  lastUsedAt: number | null
  sources: Record<string, CapabilitySourceAvailabilityDto>
  evidenceRefs: string[]
}

export interface CapabilityTagIssueDto {
  tag: string
  reason: 'empty' | 'illegal' | 'duplicate'
}

export interface CapabilitySupplyReportDto {
  generatedAt: number
  rows: CapabilityGapRowDto[]
  tagIssues: CapabilityTagIssueDto[]
  sources: Record<string, CapabilitySourceAvailabilityDto>
  unknowns: string[]
}

export function fetchCapabilitySupplyDemand(): Promise<{ ok: boolean; report: CapabilitySupplyReportDto }> {
  return request<{ ok: boolean; report: CapabilitySupplyReportDto }>('/api/harness/capabilitypool/supply-demand')
}

export function fetchCapabilityMetrics(): Promise<{ ok: boolean; readings: DerivedReadingDto[] }> {
  return request<{ ok: boolean; readings: DerivedReadingDto[] }>('/api/metricpolicy/capability')
}

export interface CapabilityReadinessCandidateDto {
  agentId: string
  tags: string[]
  reliability: number | null
  load: number
  evidenceRefs: string[]
}

export interface CapabilityReadinessDto {
  decision: 'pass' | 'warn' | 'block'
  reasons: string[]
  candidates: CapabilityReadinessCandidateDto[]
  evidenceRefs: string[]
}

/** 派单前能力候选/准入（只读建议，不自动改派）。 */
export function fetchCapabilityCandidates(
  tags: string[],
  assignee?: string | null,
): Promise<{ ok: boolean; readiness: CapabilityReadinessDto }> {
  const params = new URLSearchParams({ tags: tags.join(',') })
  if (assignee?.trim()) params.set('assignee', assignee.trim())
  return request<{ ok: boolean; readiness: CapabilityReadinessDto }>(
    `/api/harness/capabilitypool/candidates?${params.toString()}`,
  )
}
