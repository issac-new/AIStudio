// overlay/custom/client/governance/api/org-governance.ts
// 组织治理能力批（2026-11-05）数据面：/api/autonomygov + /api/premiselog + /api/metricpolicy。
// DTO 与 server 侧逐字段对齐（DTO 即契约，对齐 harness.ts / incident-suite.ts 先例）；
// 请求走 @/api/client 的 request。
import { request } from '@/api/client'

// ---- A. 自治刻度与责任边界（autonomygov 域） ----

export type AutonomyLevelDto = 0 | 1 | 2 | 3 | 4 | 5
export type TierDto = 'human' | 'collab' | 'auto'

export interface DodDto {
  criteria: string[]
  sample: string
  stopCondition: string
}

export interface RuleFindingDto {
  rule: 'al5-condition' | 'al4-sampling' | 'dod-complete'
  verdict: 'ok' | 'warn' | 'blocked'
  detail: string
}

export interface AssessmentDto {
  target: string
  al: AutonomyLevelDto
  tier: TierDto
  verdict: 'ok' | 'warn' | 'blocked'
  findings: RuleFindingDto[]
  fakeAi: boolean
}

export interface AutonomyScaleEntryDto {
  target: string
  al: AutonomyLevelDto
  dod: DodDto
  auditSampling: number
  humanScan: boolean
  reviewedAt: number
  updatedBy?: string
  note?: string
  assessment?: AssessmentDto
}

export interface DistributionReportDto {
  total: number
  counts: Record<TierDto, number>
  shares: Record<TierDto, number>
  verdicts: { ok: number; warn: number; blocked: number }
  reference: Record<TierDto, number>
  checks: { id: string; verdict: string; detail: string }[]
}

export interface DualSignResultDto {
  satisfied: boolean
  reason: string
  distinctSigners: number
  required: boolean
}

export interface RosterGapDto {
  id: string
  name: string
  kind: string
  status: 'complete' | 'blocked'
  gaps: { field: string; detail: string }[]
}

export interface StageRatiosDto {
  available: boolean
  designShare: number | null
  vetoRate: number | null
  distribution: Record<string, number>
  staged: number
  unstaged: number
  gap?: string
}

export function fetchAutonomyScale(): Promise<{ ok: boolean; entries: AutonomyScaleEntryDto[] }> {
  return request<{ ok: boolean; entries: AutonomyScaleEntryDto[] }>('/api/autonomygov/scale')
}

export function putAutonomyScale(target: string, body: {
  al: AutonomyLevelDto
  dod: DodDto
  auditSampling: number
  humanScan: boolean
  note?: string
}): Promise<{ ok: boolean; entry?: AutonomyScaleEntryDto; problems?: string[]; assessment?: AssessmentDto }> {
  return request<{ ok: boolean; entry?: AutonomyScaleEntryDto; problems?: string[]; assessment?: AssessmentDto }>(
    `/api/autonomygov/scale/${encodeURIComponent(target)}`,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  )
}

export function deleteAutonomyScale(target: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/autonomygov/scale/${encodeURIComponent(target)}`, { method: 'DELETE' })
}

export function fetchAutonomyDistribution(): Promise<{ ok: boolean; report: DistributionReportDto }> {
  return request<{ ok: boolean; report: DistributionReportDto }>('/api/autonomygov/distribution')
}

export function fetchAutonomyGaps(): Promise<{
  ok: boolean
  violations: AssessmentDto[]
  warnings: AssessmentDto[]
  fakeAi: AssessmentDto[]
  dualSign: { classes: { klass: string; title: string }[]; recentGaps: unknown[] }
}> {
  return request('/api/autonomygov/gaps')
}

export function checkDualSign(body: {
  changeId: string
  klass: string
  signatures: { by: string; at: number }[]
}): Promise<{ ok: boolean; result: DualSignResultDto }> {
  return request<{ ok: boolean; result: DualSignResultDto }>('/api/autonomygov/dual-sign/check', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

export function fetchRosterGaps(): Promise<{ ok: boolean; total: number; blocked: number; rows: RosterGapDto[] }> {
  return request('/api/autonomygov/roster-gaps')
}

export function fetchDecisionStageRatios(): Promise<{
  ok: boolean
  ratios: StageRatiosDto
  total: number
  kgAvailable: boolean
}> {
  return request('/api/autonomygov/decision-stage-ratios')
}

// ---- B. 假设登记簿（premiselog 域） ----

export type PremiseKindDto = 'market' | 'tech' | 'org' | 'cost' | 'compliance'
export type PremiseStatusDto = 'hold' | 'pending' | 'refuted' | 'expired'

export interface PremiseDto {
  id: string
  statement: string
  kind: PremiseKindDto
  scope: string[]
  reviewAt: number
  status: PremiseStatusDto
  confidence: 'high' | 'medium' | 'low'
  refutedBy?: { evidence: string; at: number; by: string }
  createdAt: number
  createdBy: string
  updatedAt: number
  history?: { statement: string; at: number; by: string }[]
}

export interface ReevalItemDto {
  id: string
  premiseId: string
  anchors: string[]
  reason: string
  queuedAt: number
  state: 'queued' | 'done' | 'dismissed'
  resolution?: { by: string; at: number; note: string }
}

export interface ImpactReportDto {
  premiseId: string
  anchors: { anchor: string; exists: boolean; shape: string }[]
  stale: number
}

export function fetchPremises(params: { status?: PremiseStatusDto; kind?: PremiseKindDto } = {}): Promise<{
  ok: boolean
  entries: PremiseDto[]
  kinds: { kind: string; title: string }[]
}> {
  const q = new URLSearchParams()
  if (params.status) q.set('status', params.status)
  if (params.kind) q.set('kind', params.kind)
  const suffix = q.toString() ? `?${q.toString()}` : ''
  return request(`/api/premiselog/premises${suffix}`)
}

export function createPremise(body: {
  statement: string
  kind: PremiseKindDto
  scope: string[]
  reviewAt: number
  confidence?: 'high' | 'medium' | 'low'
}): Promise<{ ok: boolean; entry?: PremiseDto; problems?: string[] }> {
  return request('/api/premiselog/premises', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

export function refutePremise(id: string, evidence: string): Promise<{
  ok: boolean
  entry?: PremiseDto
  reeval?: ReevalItemDto
  impact?: ImpactReportDto
  problems?: string[]
}> {
  return request(`/api/premiselog/premises/${encodeURIComponent(id)}/refute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidence }),
  })
}

export function fetchPremiseDue(): Promise<{
  ok: boolean
  now: number
  rows: { premise: PremiseDto; overdueDays: number }[]
}> {
  return request('/api/premiselog/due')
}

export function fetchPremiseImpact(id: string): Promise<{
  ok: boolean
  report: ImpactReportDto
  probe: { root: string | null; recognized: boolean; detail?: string }
}> {
  return request(`/api/premiselog/premises/${encodeURIComponent(id)}/impact`)
}

export function fetchReeval(includeResolved = false): Promise<{ ok: boolean; items: ReevalItemDto[] }> {
  return request(`/api/premiselog/reeval${includeResolved ? '?all=1' : ''}`)
}

export function resolveReeval(id: string, state: 'done' | 'dismissed', note: string): Promise<{
  ok: boolean
  item?: ReevalItemDto
  problems?: string[]
}> {
  return request(`/api/premiselog/reeval/${encodeURIComponent(id)}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, note }),
  })
}

// ---- C. 度量纪律（metricpolicy 域） ----

export type MetricNamespaceDto = 'measure' | 'settle'

export interface MetricDefDto {
  key: string
  namespace: MetricNamespaceDto
  title: string
  definition: string
  sources: string[]
  consumers: { decisionRef: string; changedAt: number; note?: string }[]
  derivedFrom?: string[]
  version: number
  builtin?: boolean
}

export interface MetricIssueDto {
  severity: 'error' | 'warn'
  code: string
  detail: string
}

export interface DerivedReadingDto {
  key: string
  title: string
  value: number | null
  unit: string
  sample: number
  available: boolean
  gap?: string
  definition: string
  sources: string[]
}

export function fetchMetrics(namespace?: MetricNamespaceDto): Promise<{ ok: boolean; entries: MetricDefDto[] }> {
  return request(`/api/metricpolicy/metrics${namespace ? `?namespace=${namespace}` : ''}`)
}

export function fetchMetricAudit(): Promise<{
  ok: boolean
  rows: { key: string; decorative: boolean; issues: MetricIssueDto[] }[]
  errorCount: number
  decorativeCount: number
  namespaces: { measure: number; settle: number }
}> {
  return request('/api/metricpolicy/audit')
}

export function fetchCoreMetrics(): Promise<{
  ok: boolean
  readings: DerivedReadingDto[]
  skillUsage: {
    available: boolean
    coverage: number | null
    declared: number
    total: number
    top: { skill: string; tasks: number }[]
    /** 技能类工具调用频次（审计面真数据；按技能名不可得） */
    invocations: {
      available: boolean
      calls: number
      failed: number
      failureRate: number | null
      byTool: { tool: string; calls: number; failed: number }[]
      perSkill: null
      perSkillGap: string
    }
    gap?: string
  }
}> {
  return request('/api/metricpolicy/core')
}

export function fetchDecorativeMetrics(): Promise<{
  ok: boolean
  entries: { key: string; title: string; definition: string; namespace: string; judgement: string }[]
}> {
  return request('/api/metricpolicy/decorative')
}

export function putMetric(key: string, body: {
  namespace: MetricNamespaceDto
  title: string
  definition: string
  sources: string[]
  consumers?: { decisionRef: string; changedAt?: number; note?: string }[]
  derivedFrom?: string[]
}): Promise<{ ok: boolean; entry?: MetricDefDto; issues?: MetricIssueDto[]; problems?: string[] }> {
  return request(`/api/metricpolicy/metrics/${encodeURIComponent(key)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
