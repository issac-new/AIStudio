// overlay/custom/client/governance/api/harness.ts
// 驾驭工程治理面数据面（/api/harness/*，信通院《驾驭工程》报告产品化）。
// 类型与 server harness-controller 四子路由回包逐字段对齐（DTO 即契约）；
// 请求走 @/api/client 的 request（与 governance/changeGov api 同款）。
// 不改 governance.ts（并行会话在改）——本文件独立成面。
import { request } from '@/api/client'

// ---- B1 统一能力目录 ----
export type CapabilitySourceId = 'mcpcatalog' | 'extmarket' | 'registry-admin'
export type FactorKey = 'registered' | 'permission' | 'version' | 'audit'

export interface CapabilityEntryDto {
  source: CapabilitySourceId
  kind: string
  id: string
  name: string
  version?: string | null
  registeredAt?: number | null
  auditTrail?: string | null
  permissionBound?: boolean | null
  note?: string
  factors: Record<FactorKey, boolean>
  gaps: FactorKey[]
}

export interface SourceGapStatDto {
  source: CapabilitySourceId
  total: number
  byFactor: Record<FactorKey, number>
  gapRate: number
  entriesWithAnyGap: number
}

export interface CapabilityCatalogDto {
  ok: boolean
  source: CapabilitySourceId | 'all'
  entries: CapabilityEntryDto[]
  gapSummary: {
    totalEntries: number
    bySource: Record<CapabilitySourceId, SourceGapStatDto>
    overall: { factorSlots: number; gapFactorCount: number; gapRate: number; entriesWithAnyGap: number }
  }
  sources: Array<{ id: CapabilitySourceId; available: boolean; note?: string; count: number }>
  meta: { scope: string; notDoing: string }
}

export function fetchCapabilityCatalog(source?: CapabilitySourceId): Promise<CapabilityCatalogDto> {
  const q = source ? `?source=${encodeURIComponent(source)}` : ''
  return request<CapabilityCatalogDto>(`/api/harness/capability-catalog${q}`)
}

// ---- B2 六类成本账 ----
export type AccountKey = 'token' | 'humanIntervention' | 'toolExecution' | 'waitLatency' | 'rework' | 'securityGovernance'

export interface AccountSourceStatusDto { id: string; available: boolean; note?: string }

export type AccountDataDto =
  | {
      dbPath: string | null; sessionsCount: number | null
      inputTokens: number | null; outputTokens: number | null
      cacheReadTokens: number | null; cacheWriteTokens: number | null; reasoningTokens: number | null
      totalTokens: number | null; windowed: boolean
    }
  | { sampleCap: number; events: number | null; byAction: Array<{ action: string; count: number }> }
  | { auditToolActions: number | null; traceDir: string | null; traceFiles: number | null; traceSpanCount: number | null }
  | { boards: string[]; tasksDone: number | null; avgSeconds: number | null; medianSeconds: number | null; p95Seconds: number | null }
  | { requests: number | null; reworkHours: number | null }
  | { severityBuckets: { high: number; medium: number; low: number }; freezeWindows: { total: number | null; active: number | null } }

export interface CostAccountDto {
  key: AccountKey
  available: boolean
  note?: string
  sources: AccountSourceStatusDto[]
  data: AccountDataDto
}

export interface CostAccountsDto {
  ok: boolean
  days: number
  accounts: CostAccountDto[]
  _defs: Record<AccountKey, { title: string; definition: string; sources: string[] }>
}

export function fetchCostAccounts(days = 7): Promise<CostAccountsDto> {
  return request<CostAccountsDto>(`/api/harness/cost-accounts?days=${encodeURIComponent(String(days))}`)
}

// ---- B3 L1-L5 成熟度自检 ----
export interface MaturityMetricDto {
  key: string
  value: number | null
  unit: string
  source: string
  note?: string
}

export interface MaturityItemDto {
  title: string
  passed: boolean | null
  evidence: string
  metric?: string
}

export interface MaturityLevelDto {
  level: number
  key: 'L1' | 'L2' | 'L3' | 'L4' | 'L5'
  name: string
  achieved: boolean | null
  items: MaturityItemDto[]
}

export interface MaturityDto {
  ok: boolean
  days: number
  levels: MaturityLevelDto[]
  metrics: MaturityMetricDto[]
  meta: { note: string; levelsNote: string }
}

export function fetchMaturity(days = 7): Promise<MaturityDto> {
  return request<MaturityDto>(`/api/harness/maturity?days=${encodeURIComponent(String(days))}`)
}

// ---- B4 八工程原语对账 ----
export type CoverageStatus = '有' | '部分' | '缺'
export type CoverageAttribute = 'identity' | 'version' | 'lifecycle' | 'audit'

export interface PrimitiveRowDto {
  key: string
  name: string
  enName: string
  idPattern: string
  storage: string
  versionSource: string
  lifecycle: string[]
  auditHook: string
  anchors: string[]
  coverage: Record<CoverageAttribute, CoverageStatus>
  coverageNotes: Partial<Record<CoverageAttribute, string>>
  liveCount: number | null
  liveCountNote?: string
}

export interface PrimitivesDto {
  ok: boolean
  primitives: PrimitiveRowDto[]
  matrix: {
    totalPrimitives: number
    byAttribute: Record<CoverageAttribute, Record<CoverageStatus, number>>
    fullyCovered: number
  }
}

export function fetchPrimitives(): Promise<PrimitivesDto> {
  return request<PrimitivesDto>('/api/harness/primitives')
}
