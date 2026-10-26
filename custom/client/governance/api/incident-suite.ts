// overlay/custom/client/governance/api/incident-suite.ts
// 六文调研轮 UI 数据面（/api/incident/* + /api/hermes/virtual-pl + /api/hermes/
// governance-events + /api/hermes/autonomy-ladder）。DTO 与 server 侧逐字段对齐
// （DTO 即契约，对齐 harness.ts 先例）；请求走 @/api/client 的 request。
import { request } from '@/api/client'

// ---- A+B. 事故报告（incident 域） ----

export type IncidentCategoryKey = 'trajectory' | 'capability' | 'orchestration'
export type IncidentElementStatus = 'collected' | 'partial' | 'absent'

export interface IncidentElementDto {
  key: string
  title: string
  category: IncidentCategoryKey
  status: IncidentElementStatus
  summary: string
  sources: string[]
  note?: string
}

export interface AutonomyFaceDto {
  sources: string[]
  facts: string[]
  status: IncidentElementStatus
  note?: string
}

export interface IncidentReportDto {
  sessionId: string
  generatedAt: number
  subject: { title?: string; createdAt?: number; messages?: number; dbFile?: string; traceFile?: string }
  elements: IncidentElementDto[]
  autonomy: {
    theoretical: AutonomyFaceDto
    effective: AutonomyFaceDto
    divergences: Array<{ finding: string; severity: 'info' | 'warn'; evidence: string[] }>
    note?: string
  }
  coverage: { collected: number; partial: number; absent: number; total: number }
}

export function fetchIncidentReport(sessionId: string): Promise<IncidentReportDto> {
  return request<IncidentReportDto>(`/api/incident/sessions/${encodeURIComponent(sessionId)}/report`)
}

/** Markdown 导出（浏览器原生下载：带 Content-Disposition 附件头）。 */
export function incidentReportMdUrl(sessionId: string): string {
  return `/api/incident/sessions/${encodeURIComponent(sessionId)}/report.md`
}

// ---- E. 虚拟损益表 ----

export interface VirtualPnlRowDto {
  profile: string
  delivered: number
  inFlight: number
  tokens: { input: number; output: number; calls: number }
  costIdle: number
  costPeak: number
  unpricedRows: number
  costPerDeliveredIdle: number | null
  costPerDeliveredPeak: number | null
  valuePerDelivered?: number
  valueTotal?: number
  lastActiveAt: number | null
}

export interface VirtualPnlDto {
  days: number
  currency: string
  rows: VirtualPnlRowDto[]
  global: { interventions: number | null; reworkHours: number | null; waitP95SecondsWithinDay: number | null }
  anomalies: Array<{ profile: string; day: string; costPeak: number; trailingMeanPeak: number; ratio: number; note: string }>
  benefitNote: string
  sourcesAvailable: { usageDb: boolean; kanban: boolean; pricing: boolean }
}

export function fetchVirtualPnl(days = 30): Promise<VirtualPnlDto> {
  return request<VirtualPnlDto>(`/api/hermes/virtual-pl?days=${days}`)
}

// ---- F. 治理事件总线 ----

export type GovEventDomainDto = 'quality' | 'security' | 'cost' | 'approval' | 'autonomy' | 'system'
export type GovEventSeverityDto = 'info' | 'warn' | 'high'

export interface GovEventDto {
  eventId: string
  ts: number
  domain: GovEventDomainDto
  severity: GovEventSeverityDto
  type: string
  source: string
  summary: string
}

export function fetchGovEvents(opts: { domain?: string; minSeverity?: string; limit?: number } = {}): Promise<{ ok: boolean; events: GovEventDto[] }> {
  const params = new URLSearchParams()
  if (opts.domain) params.set('domain', opts.domain)
  if (opts.minSeverity) params.set('minSeverity', opts.minSeverity)
  if (opts.limit) params.set('limit', String(opts.limit))
  const q = params.toString()
  return request<{ ok: boolean; events: GovEventDto[] }>(`/api/hermes/governance-events${q ? `?${q}` : ''}`)
}

// ---- H2. 自治阶梯 ----

export type LadderLevelDto = 'insight' | 'assist' | 'auto'

export interface LadderEntryDto {
  target: string
  level: LadderLevelDto
  approvalPoints: string[]
  maxRiskTier: 'low' | 'medium' | 'high'
  updatedAt: number
  updatedBy?: string
  note?: string
}

export function fetchLadder(): Promise<{ ok: boolean; entries: LadderEntryDto[] }> {
  return request<{ ok: boolean; entries: LadderEntryDto[] }>('/api/hermes/autonomy-ladder')
}

export function putLadder(target: string, body: { level: LadderLevelDto; approvalPoints?: string[]; maxRiskTier?: 'low' | 'medium' | 'high'; note?: string }): Promise<{ ok: boolean; entry: LadderEntryDto }> {
  return request<{ ok: boolean; entry: LadderEntryDto }>(`/api/hermes/autonomy-ladder/${encodeURIComponent(target)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

export function deleteLadder(target: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/hermes/autonomy-ladder/${encodeURIComponent(target)}`, {
    method: 'DELETE',
  })
}

// ---- H4. 主动性两轴（proactivity 域，Qoder 吸收轮+挂账清偿批） ----

export type ProblemDefinerLevelDto = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
export type ActionTierDto = 'inform' | 'suggest' | 'draft' | 'reversible_exec' | 'irreversible_exec'

export interface ProactivityModelDto {
  axes: {
    problemDefiner: Array<{ level: ProblemDefinerLevelDto; title: string; definer: string; example: string }>
    actionTier: Array<{ tier: ActionTierDto; title: string }>
  }
  rules: string[]
  alignmentPolicy: { maxConfirmAgeDays: number; neverConfirmedGraceDays: number }
  caps: Array<{ level: ProblemDefinerLevelDto; noContract: ActionTierDto; withContract: ActionTierDto }>
  executionFace: string
}

export interface PolicyEntryDto {
  profile: string
  level: ProblemDefinerLevelDto
  contract?: { goalExplicit: boolean; acceptanceCriteria: boolean }
  goalId?: string
  updatedAt: number
  updatedBy?: string
  note?: string
  resolved?: { level: ProblemDefinerLevelDto; contract?: { goalExplicit: boolean; acceptanceCriteria: boolean }; goalStatus?: 'fresh' | 'stale' | 'never-confirmed' }
}

export interface AlignmentEntryDto {
  goalId: string
  goalSummary: string
  createdAt: number
  confirmations: Array<{ at: number; by?: string; note?: string }>
  contract?: { goalExplicit: boolean; acceptanceCriteria: boolean }
  status: { status: 'fresh' | 'stale' | 'never-confirmed'; lastConfirmedAt: number | null; daysSinceConfirm: number | null; reason: string }
}

export function fetchProactivityModel(): Promise<ProactivityModelDto> {
  return request<ProactivityModelDto>('/api/hermes/proactivity/model')
}

export function fetchProactivityPolicies(): Promise<{ ok: boolean; entries: PolicyEntryDto[] }> {
  return request<{ ok: boolean; entries: PolicyEntryDto[] }>('/api/hermes/proactivity/policy')
}

export function putProactivityPolicy(profile: string, body: { level: ProblemDefinerLevelDto; contract?: { goalExplicit: boolean; acceptanceCriteria: boolean }; goalId?: string; note?: string }): Promise<{ ok: boolean; entry: PolicyEntryDto }> {
  return request<{ ok: boolean; entry: PolicyEntryDto }>(`/api/hermes/proactivity/policy/${encodeURIComponent(profile)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

export function deleteProactivityPolicy(profile: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/hermes/proactivity/policy/${encodeURIComponent(profile)}`, { method: 'DELETE' })
}

export function fetchProactivityAlignments(): Promise<{ ok: boolean; entries: AlignmentEntryDto[] }> {
  return request<{ ok: boolean; entries: AlignmentEntryDto[] }>('/api/hermes/proactivity/alignment')
}

export function confirmProactivityAlignment(goalId: string, note?: string): Promise<{ ok: boolean; entry: AlignmentEntryDto }> {
  return request<{ ok: boolean; entry: AlignmentEntryDto }>(`/api/hermes/proactivity/alignment/${encodeURIComponent(goalId)}/confirm`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note ? { note } : {}),
  })
}

export function postProactivityAlignment(body: { goalId: string; goalSummary: string }): Promise<{ ok: boolean; entry: AlignmentEntryDto }> {
  return request<{ ok: boolean; entry: AlignmentEntryDto }>('/api/hermes/proactivity/alignment', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

export interface AssessResultDto {
  ok: boolean
  assessment: { allowed: boolean; cappedAt: ActionTierDto; reasons: string[] }
  upgrade: { note: string }
  failureCostTier: string | null
  goalStatus: { status: 'fresh' | 'stale' | 'never-confirmed'; reason: string } | null
}

export function assessProactivity(body: {
  level: ProblemDefinerLevelDto
  action: ActionTierDto
  contract?: { goalExplicit: boolean; acceptanceCriteria: boolean }
  failureCost?: { reversible: boolean; impactScope: 'self' | 'team' | 'external'; verifiable: boolean }
  goalStatus?: 'fresh' | 'stale' | 'never-confirmed'
}): Promise<AssessResultDto> {
  return request<AssessResultDto>('/api/hermes/proactivity/assess', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
