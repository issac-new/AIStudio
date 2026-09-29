// overlay/custom/client/governance/api/governance.ts
// 治理中心数据面（/api/governance/*，补功能主清单 2026-09-28）。
// 类型与 server governance-controller 的 GOVERNANCE_DOCS 契约对齐；
// 请求走 @/api/client 的 request（带鉴权与 baseUrl 解析，与 kanban api 同款）。
import { request } from '@/api/client'

export interface GovernanceDocMeta {
  kind: string
  path: string
  title: string
  gate: string
  /** 分组：gate 六闸工件 / admin 管理档案 / analysis 分析档案 / evidence 测试证据 */
  group: string
  /** 非主干工件所在 git ref（如 origin/feat/DEV-*） */
  ref?: string
  exists: boolean
  commit: string | null
  committedAt: string | null
  lines: number
}

export interface GovernanceDevBranch {
  ref: string
  commit: string
  updatedAt: string
}

export interface GovernanceOverview {
  ok: boolean
  repo: string
  repoReady: boolean
  docs: GovernanceDocMeta[]
  devBranches: GovernanceDevBranch[]
  pendingReviews: number
}

export interface GovernanceDoc {
  ok: boolean
  kind: string
  title: string
  gate: string
  commit: string
  committedAt: string
  markdown: string
}

export function fetchGovernanceOverview(): Promise<GovernanceOverview> {
  return request<GovernanceOverview>('/api/governance/overview')
}

export function fetchGovernanceDoc(kind: string): Promise<GovernanceDoc> {
  return request<GovernanceDoc>(`/api/governance/doc?kind=${encodeURIComponent(kind)}`)
}

// ── 六域体检（长期台账：多轮累积的基础数据）──
export interface DomainCheckResult {
  run: string
  domain: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  verdict: 'pass' | 'warn' | 'fail'
  evidence: string[]
  checkedAt: string
}

export interface DomainAuditSummary {
  ok: boolean
  total: number
  runs: string[]
  latest: Record<string, DomainCheckResult>
  ledger: DomainCheckResult[]
}

export function runDomainAudit(run?: string): Promise<{ ok: boolean; run: string; results: DomainCheckResult[] }> {
  const q = run ? `?run=${encodeURIComponent(run)}` : ''
  return request(`/api/governance/domains/run${q}`, { method: 'POST' })
}

export function fetchDomainAudit(): Promise<DomainAuditSummary> {
  return request('/api/governance/domains')
}

// ── 4A 治理层（能力台账 + 语义指标层；spec 2026-09-29 §3.4）──
export interface LedgerUnit {
  id: string
  capability: string
  primary: boolean
  kind: string
  owner: string
  lifecycle: string
  sloTier: string
  skills: string[]
  refs?: { file?: string; note?: string }
  reviewedAt: string
}
export interface LedgerCapability {
  id: string
  domain: string
  name: string
  object: string
  action: string
  importance: string
  maturity: string
}
export interface LedgerDoc {
  version: number
  reviewedAt: string
  domains: Array<{ id: string; name: string; owner: string }>
  capabilities: LedgerCapability[]
  units: LedgerUnit[]
}
export interface LedgerStats {
  counts: { domains: number; capabilities: number; units: number }
  byKind: Record<string, number>
  byLifecycle: Record<string, number>
  bySloTier: Record<string, number>
  stale: Array<{ id: string; reviewedAt: string; days: number }>
  primaryGaps: string[]
}
export interface GovernanceLedger {
  ok: boolean
  exists: boolean
  path: string | null
  problems: string[]
  doc: LedgerDoc | null
  stats: LedgerStats | null
}
export interface MetricsDefsDoc {
  version: number
  reviewedAt: string
  verdicts: Array<{ id: string; label: string; semantics: string }>
  metrics: Array<{ id: string; name: string; formula: string; dimensions: string[]; permission: string; authority: string; status: string }>
}
export interface GovernanceMetricsDefs {
  ok: boolean
  exists: boolean
  path: string | null
  problems: string[]
  doc: MetricsDefsDoc | null
}

export function fetchGovernanceLedger(): Promise<GovernanceLedger> {
  return request<GovernanceLedger>('/api/governance/ledger')
}

export function fetchMetricsDefs(): Promise<GovernanceMetricsDefs> {
  return request<GovernanceMetricsDefs>('/api/governance/metrics-defs')
}

// ── 4A 治理层运行态（第二期 ②③④⑥）──
export interface UnitUsage {
  unitId: string
  kind: string
  mapped: boolean
  source: 'kanban-assignee' | 'squad-ledger' | 'untracked'
  lastUsedAt: number | null
  daysSinceUse: number | null
  note?: string
}
export interface UsageReport {
  ok: boolean
  perUnit: UnitUsage[]
  unmappedAssignees: Array<{ assignee: string; total: number; lastActiveAt: number | null }>
  zeroUseCandidates: UnitUsage[]
  /** 第三期：引擎派发统计（dispatch.successRate 本地实况）与门禁通过率（gate.passRate）。 */
  dispatchStats?: {
    dispatched: number
    delivered: number
    deferred: number
    failed: number
    deliveredRate: number | null
    byUnit: Array<{ key: string; dispatched: number; delivered: number; rate: number | null }>
  }
  gateStats?: {
    runs: number
    byVerdict: Record<string, number>
    passRate: number | null
    lastAt: number | null
    roots: string[]
  }
}
export interface SloTierReport {
  tier: string
  target: { successRate: number; windowDays: number; minSamples: number; budgetAction: string } | null
  closed: number
  done: number
  successRate: number | null
  p95DurationS: number | null
  exhausted: boolean
  note?: string
}
export interface SloReport {
  ok: boolean
  budgetMode: string
  windowDays: number
  tiers: SloTierReport[]
  unmapped: { closed: number; done: number; successRate: number | null; assignees: string[] }
  dataAvailable: boolean
}
export interface CostBucket {
  key: string
  calls: number
  inputTokens: number
  outputTokens: number
  costIdle: number
  costPeak: number
  unpricedRows: number
}
export interface CostSummary {
  ok: boolean
  days: number
  rows: number
  currency: string
  byProvider: CostBucket[]
  byProfile: CostBucket[]
  byCapability?: CostBucket[]
  total: { calls: number; inputTokens: number; outputTokens: number; costIdle: number; costPeak: number; unpricedRows: number }
  pricingMissing: string[]
  dbFound: boolean
}
export interface AuditEvent {
  ts: number
  source: 'approvals' | 'domain' | 'provider' | 'kanban'
  actor: string
  action: string
  target: string
  result: string
  ref?: string
}
export interface AuditLogResult {
  ok: boolean
  sources: Array<{ id: string; available: boolean; note?: string }>
  total: number
  events: AuditEvent[]
}

export function fetchUsage(): Promise<UsageReport> {
  return request<UsageReport>('/api/governance/usage')
}
export function fetchSlo(): Promise<SloReport> {
  return request<SloReport>('/api/governance/slo')
}
export function fetchCostSummary(days = 30): Promise<CostSummary> {
  return request<CostSummary>(`/api/governance/cost-summary?days=${days}`)
}
export function fetchAuditLog(opts?: { sources?: string[]; q?: string; limit?: number }): Promise<AuditLogResult> {
  const params = new URLSearchParams()
  if (opts?.sources?.length) params.set('sources', opts.sources.join(','))
  if (opts?.q) params.set('q', opts.q)
  if (opts?.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  return request<AuditLogResult>(`/api/governance/audit-log${qs ? `?${qs}` : ''}`)
}
