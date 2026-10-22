// overlay/custom/client/ia2/api/trust.ts
// 长程任务可信执行层数据面（/api/harness/trust/*）。
// DTO 与服务端 custom/server/trust/types.ts 逐字段对齐；请求走 @/api/client。
import { request } from '@/api/client'

export type ClaimVerdictDto = 'verified' | 'unverified' | 'refuted'
export type IntegrityStateDto = 'clean' | 'violated' | 'unknown'
export type TrustStateDto = 'open' | 'admitted' | 'untrusted'

export interface TrustOverviewDto {
  ok: boolean
  cases: number
  open: number
  admitted: number
  untrusted: number
  forgeAttempts: number
  integrityViolations: number
  ledgerIntact: boolean
  ledgerEntries: number
  surfaceValid: boolean
}

export interface RoleSurfaceDto {
  role: 'manager' | 'auditor' | 'executor'
  tools: string[]
  allowWrite: boolean
}

export interface TrustSurfacesDto {
  ok: boolean
  valid: boolean
  sizes: Record<'manager' | 'auditor' | 'executor', number>
  violations: string[]
  surfaces: RoleSurfaceDto[]
}

export interface TrustCaseSummaryDto {
  id: string
  title: string
  runId?: string
  state: TrustStateDto
  forgeAttempts: number
  claimCount: number
  verifiedCount: number
  refutedCount: number
  integrityState: IntegrityStateDto
  updatedAt: number
  blockedReason?: string
}

export interface TrustClaimDto {
  id: string
  statement: string
  evidenceRefs: string[]
  claimedBy: string
  claimedAt: number
}

export interface TrustAuditDto {
  id: string
  claimId: string
  auditor: string
  verdict: ClaimVerdictDto
  observations: string[]
  counterEvidence?: string
  at: number
}

export interface IntegrityChangeDto {
  path: string
  kind: 'added' | 'modified' | 'removed'
}

export interface IntegrityReportDto {
  state: IntegrityStateDto
  baselineManifestId: string | null
  baselineDigest: string | null
  currentManifestId: string | null
  currentDigest: string | null
  changes: IntegrityChangeDto[]
  changeTotal: number
  checkedAt: number
  truncated: boolean
  selfReported?: IntegrityStateDto
  overridden: boolean
}

export interface TrustDecisionDto {
  id: string
  at: number
  actor: string
  result: 'admitted' | 'untrusted'
  proposal: string[]
  blockers: Array<{ code: string; detail: string; claimId?: string }>
  warnings: string[]
  claimStates: Array<{ claimId: string; verdict: ClaimVerdictDto | null }>
  integrity: IntegrityReportDto
  surfaceValid: boolean
}

export interface TrustCheckpointDto {
  id: string
  caseId: string
  round: number
  at: number
  actor: string
  caseDigest: string
  workspaceManifestId: string
  workspaceDigest: string
  workspaceRoot: string
}

export interface TrustCaseDto {
  id: string
  title: string
  runId?: string
  workspaceRoot: string
  createdAt: number
  updatedAt: number
  state: TrustStateDto
  forgeAttempts: number
  claims: TrustClaimDto[]
  audits: TrustAuditDto[]
  decisions: TrustDecisionDto[]
  baseline: { manifestId: string; digest: string; at: number; auto: boolean } | null
  integrity: IntegrityReportDto | null
  checkpoints: TrustCheckpointDto[]
  blockedReason?: string
}

export interface CheckpointVerificationDto {
  ok: boolean
  status: 'consistent' | 'diverged' | 'workspace_missing' | 'no_checkpoint'
  checkpoint: TrustCheckpointDto | null
  currentDigest: string | null
  changes: IntegrityChangeDto[]
  caseChanged: boolean
  checkedAt: number
}

export interface TrustLedgerVerifyDto {
  ok: boolean
  total: number
  chained: number
  unchained: number
  intact: boolean
  firstBroken: number | null
  checks: Array<{ index: number; status: string; note?: string }>
}

export interface ClaimInput {
  id?: string
  statement: string
  evidenceRefs: string[]
  claimedBy?: string
}

export interface AuditInput {
  claimId: string
  verdict: ClaimVerdictDto
  auditor?: string
  observations: string[]
  counterEvidence?: string
}

export function fetchTrustOverview(): Promise<TrustOverviewDto> {
  return request<TrustOverviewDto>('/api/harness/trust/overview')
}

export function fetchTrustSurfaces(): Promise<TrustSurfacesDto> {
  return request<TrustSurfacesDto>('/api/harness/trust/surfaces')
}

export function fetchTrustCases(): Promise<{ ok: boolean; cases: TrustCaseSummaryDto[] }> {
  return request('/api/harness/trust/cases')
}

export function fetchTrustCase(id: string): Promise<{ ok: boolean; case: TrustCaseDto }> {
  return request(`/api/harness/trust/cases/${encodeURIComponent(id)}`)
}

export function createTrustCase(input: {
  title: string
  workspaceRoot: string
  actor: string
  runId?: string
  claims?: ClaimInput[]
}): Promise<{ ok: boolean; case: TrustCaseDto }> {
  return request('/api/harness/trust/cases', { method: 'POST', body: JSON.stringify(input) })
}

export function addTrustClaims(
  id: string, claims: ClaimInput[], actor: string,
): Promise<{ ok: boolean; added: TrustClaimDto[] }> {
  return request(`/api/harness/trust/cases/${encodeURIComponent(id)}/claims`, {
    method: 'POST', body: JSON.stringify({ claims, actor }),
  })
}

export function beginTrustAudit(id: string, actor: string): Promise<{ ok: boolean }> {
  return request(`/api/harness/trust/cases/${encodeURIComponent(id)}/begin-audit`, {
    method: 'POST', body: JSON.stringify({ actor }),
  })
}

export function recordTrustAudits(
  id: string, audits: AuditInput[], actor: string,
): Promise<{ ok: boolean; audits: TrustAuditDto[] }> {
  return request(`/api/harness/trust/cases/${encodeURIComponent(id)}/audits`, {
    method: 'POST', body: JSON.stringify({ audits, actor }),
  })
}

export function admitTrustCase(
  id: string, input: { actor: string; auditorReportedIntegrity?: IntegrityStateDto; proposal?: string[] },
): Promise<{ ok: boolean; decision: TrustDecisionDto; summary: TrustCaseSummaryDto; forgeAttempts: number }> {
  return request(`/api/harness/trust/cases/${encodeURIComponent(id)}/admit`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function writeTrustCheckpoint(
  id: string, input: { actor: string; round?: number },
): Promise<{ ok: boolean; checkpoint: TrustCheckpointDto }> {
  return request(`/api/harness/trust/cases/${encodeURIComponent(id)}/checkpoint`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function verifyTrustCheckpoint(id: string, checkpointId = 'latest'): Promise<CheckpointVerificationDto> {
  return request(`/api/harness/trust/cases/${encodeURIComponent(id)}/checkpoints/${encodeURIComponent(checkpointId)}/verify`)
}

export function verifyTrustLedger(): Promise<TrustLedgerVerifyDto> {
  return request<TrustLedgerVerifyDto>('/api/harness/trust/ledger/verify')
}
