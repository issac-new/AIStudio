// overlay/custom/client/governance/api/changeGov.ts
// 变更治理数据面（/api/change-gov/*，调研落地轮 2026-09-29）。
// 类型与 server change-governance-store 契约对齐；请求走 @/api/client 的 request
// （与 governance api 同款）。设计文档：docs/2026-09-29-change-gov-three-accounts-research.md。
import { request } from '@/api/client'

export interface ChangeLevelDef {
  level: number
  key: 'L1' | 'L2' | 'L3' | 'L4'
  name: string
  slaHours: number
  authority: string
}

export type ImpactScores = Record<'schedule' | 'cost' | 'scope' | 'quality' | 'risk', number>

export interface ChangeBaselines {
  monthlyNewMax: number
  emergencyRatioMax: number
  overdueReviewRatioMax: number
  reworkHoursMax: number
  freezePenetrationMax: number
  firstPassRateMin: number
}

export interface ChangeGovMeta {
  ok: boolean
  levels: ChangeLevelDef[]
  dimensions: string[]
  baselines: ChangeBaselines
  freezeTiers: Array<{ tier: number; name: string }>
}

export interface ChangeRequest {
  id: string
  title: string
  description: string
  source: string
  board: string
  task_id: string
  level: number
  emergency: boolean
  impact: ImpactScores
  impact_total: number
  raci: { responsible?: string[]; approver?: string[]; consulted?: string[]; informed?: string[] }
  target_baseline: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'implemented' | 'withdrawn'
  freeze_window_id: string | null
  freeze_violation: boolean
  freeze_overridden: boolean
  resubmit_count: number
  submitted_at: number | null
  deadline_at: number | null
  decided_at: number | null
  decider: string
  decision_note: string
  rework_hours: number
  created_at: number
  updated_at: number
}

export interface MetricCell {
  key: string
  actual: number
  baseline: number
  verdict: 'ok' | 'warn' | 'over'
  detail: string
}

export interface ChangeMetrics {
  ok: boolean
  month: string
  submittedInMonth: number
  metrics: MetricCell[]
}

export interface FreezeWindow {
  id: string
  name: string
  tier: number
  starts_at: number
  ends_at: number
  scope: string
  active: boolean
  note: string
  created_at: number
}

export function fetchChangeGovMeta(): Promise<ChangeGovMeta> {
  return request<ChangeGovMeta>('/api/change-gov/meta')
}

export function fetchChangeRequests(filter: { status?: string; level?: number } = {}): Promise<{ ok: boolean; items: ChangeRequest[]; levels: ChangeLevelDef[] }> {
  const q = new URLSearchParams()
  if (filter.status) q.set('status', filter.status)
  if (filter.level) q.set('level', String(filter.level))
  const qs = q.toString()
  return request(`/api/change-gov/requests${qs ? `?${qs}` : ''}`)
}

export function createChangeRequest(input: Partial<ChangeRequest> & { title: string }): Promise<{ ok: boolean; item: ChangeRequest }> {
  return request('/api/change-gov/requests', { method: 'POST', body: JSON.stringify(input) })
}

export function updateChangeRequest(id: string, patch: Partial<ChangeRequest>): Promise<{ ok: boolean; item: ChangeRequest }> {
  return request(`/api/change-gov/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) })
}

export function submitChangeRequest(id: string): Promise<{ ok: boolean; item: ChangeRequest }> {
  return request(`/api/change-gov/requests/${encodeURIComponent(id)}/submit`, { method: 'POST' })
}

export function resubmitChangeRequest(id: string): Promise<{ ok: boolean; item: ChangeRequest }> {
  return request(`/api/change-gov/requests/${encodeURIComponent(id)}/resubmit`, { method: 'POST' })
}

export function decideChangeRequest(id: string, input: {
  decision: 'approve' | 'reject'; decider: string; note?: string; override_freeze?: boolean
}): Promise<{ ok: boolean; item: ChangeRequest }> {
  return request(`/api/change-gov/requests/${encodeURIComponent(id)}/decide`, { method: 'POST', body: JSON.stringify(input) })
}

export function implementChangeRequest(id: string, reworkHours: number): Promise<{ ok: boolean; item: ChangeRequest }> {
  return request(`/api/change-gov/requests/${encodeURIComponent(id)}/implement`, { method: 'POST', body: JSON.stringify({ rework_hours: reworkHours }) })
}

export function fetchChangeMetrics(month?: string): Promise<ChangeMetrics> {
  return request(`/api/change-gov/metrics${month ? `?month=${month}` : ''}`)
}

export function fetchFreezeWindows(): Promise<{ ok: boolean; items: FreezeWindow[] }> {
  return request('/api/change-gov/freeze-windows')
}

export function createFreezeWindow(input: {
  name: string; tier: number; starts_at: number; ends_at: number; scope?: string; note?: string
}): Promise<{ ok: boolean; item: FreezeWindow }> {
  return request('/api/change-gov/freeze-windows', { method: 'POST', body: JSON.stringify(input) })
}

export function setFreezeWindowActive(id: string, active: boolean): Promise<{ ok: boolean; item: FreezeWindow }> {
  return request(`/api/change-gov/freeze-windows/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ active }) })
}
