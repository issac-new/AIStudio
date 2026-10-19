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
  | { boards: string[]; tasksDone: number | null; avgSeconds: number | null; medianSeconds: number | null; p95Seconds: number | null; p95SecondsWithinDay?: number | null; overDayCount?: number | null }
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

// ---- B5 四层评估读模型（2026-10-04 九源调研落地项②）----
export type EvalLayerKey = 'result' | 'execution' | 'resource' | 'governance'

export interface EvalMetricDto {
  key: string
  status: 'instrumented' | 'gap'
  value: number | null
  unit: string
  source: string
  definition?: string
  note?: string
}

export interface EvalLayerDto {
  key: EvalLayerKey
  metrics: EvalMetricDto[]
}

export interface EvalLayersDto {
  ok: boolean
  days: number
  layers: EvalLayerDto[]
  counts: { instrumented: number; gap: number }
  meta: { note: string; source: string; gapNote: string }
}

export function fetchEvalLayers(days = 7): Promise<EvalLayersDto> {
  return request<EvalLayersDto>(`/api/harness/eval-layers?days=${encodeURIComponent(String(days))}`)
}

// ---- B7 九层运行体检（2026-10-18 Harness 可靠性轮）----
export type NineLayerKeyDto =
  | 'tools' | 'loop' | 'memory' | 'context' | 'sandbox'
  | 'verification' | 'permissions' | 'observability' | 'evals'

export type NineLayerStatusDto = 'covered' | 'partial' | 'missing'
export type NineCheckStatusDto = 'yes' | 'partial' | 'no'

export interface NineLayerCheckDto {
  key: string
  label?: string
  status: NineCheckStatusDto
  evidence: string
  critical?: boolean
}

export interface NineLayerDto {
  key: NineLayerKeyDto
  status: NineLayerStatusDto
  score: number
  checks: NineLayerCheckDto[]
  gaps: string[]
  actions: string[]
}

export interface NineLayersDto {
  ok: boolean
  days: number
  layers: NineLayerDto[]
  counts: { covered: number; partial: number; missing: number }
  meta: { source: string; note: string; layersOrder: NineLayerKeyDto[] }
  cachedAt?: number
}

export function fetchNineLayers(days = 7): Promise<NineLayersDto> {
  return request<NineLayersDto>(`/api/harness/nine-layers?days=${encodeURIComponent(String(days))}`)
}

// ---- B8 运行运维面（2026-10-18 残余项）：过程质量 / 执法决策 / 运行清单 / 预算 / 恢复判定 ----
export interface ProcessQualityDto {
  ok: boolean
  days: number
  metrics: {
    runs: number
    toolCalls: number
    failedCalls: number
    duplicateCallRate: number | null
    toolFailureRate: number | null
    longChainRate: number | null
    firstPassSuccessRate: number | null
    specComplianceRate: number | null
  }
  steps: { p50: number | null; p95: number | null; max: number | null }
  qgate: { total: number; pass: number; fail: number; conditional: number; other: number }
  notes: string[]
}

export function fetchProcessQuality(days = 7): Promise<ProcessQualityDto> {
  return request<ProcessQualityDto>(`/api/harness/process-quality?days=${days}`)
}

export interface PolicyDecisionDto {
  ts: number
  tool: string
  userId?: string
  profileId?: string
  sessionId?: string
  runId?: string
  enforcing: boolean
  allow: boolean
  rule: string
  risk?: string
  reason?: string
}

export interface PolicyDecisionsDto {
  ok: boolean
  total: number
  entries: PolicyDecisionDto[]
  byRule: Array<{ rule: string; count: number; denied: number }>
  byOutcome: { allow: number; deny: number }
  windowDays: number
}

export function fetchPolicyDecisions(days = 7): Promise<PolicyDecisionsDto> {
  return request<PolicyDecisionsDto>(`/api/harness/policy-decisions?days=${days}&limit=50`)
}

export interface RunManifestCostDto {
  priced: boolean
  inputTokens: number
  outputTokens: number
  costIdleUsd: number | null
  costPeakUsd: number | null
  traceFound: boolean
}

export interface RunManifestDto {
  runId: string
  sessionId: string
  userId?: string
  profileId: string
  model: string
  provider: string
  apiMode?: string
  reasoningEffort?: string
  promptHash?: string
  permissionMode?: string
  toolContractVersion: string
  startedAt: number
  cost?: RunManifestCostDto
}

export interface RunManifestsDto {
  ok: boolean
  total: number
  entries: RunManifestDto[]
  windowDays: number
}

export function fetchRunManifests(days = 7): Promise<RunManifestsDto> {
  return request<RunManifestsDto>(`/api/harness/run-manifests?days=${days}&limit=20&withCost=1`)
}

export interface BudgetStatusDto {
  ok: boolean
  status: {
    userId?: string
    profileId?: string
    day: string
    spentUsd: number
    limitUsd: number | null
    ratio: number | null
    action: 'allow' | 'warn' | 'downgrade' | 'block'
    runs: number
    missingPricedRuns: number
    enforce: boolean
    note: string
  }
}

export function fetchBudgetStatus(userId?: string, profileId?: string): Promise<BudgetStatusDto> {
  const q = new URLSearchParams()
  if (userId) q.set('userId', userId)
  if (profileId) q.set('profileId', profileId)
  return request<BudgetStatusDto>(`/api/harness/budget-status?${q.toString()}`)
}

export type ResumeDecisionDto = 'auto_resume' | 'manual_gate' | 'new_session'

export interface ResumePlanDto {
  ok: boolean
  plan: {
    runId?: string
    sessionId?: string
    decision: ResumeDecisionDto
    reasons: string[]
    next?: string
    facts: {
      graph: { found: boolean; superStep?: number; pendingInterrupts?: number; ageMs?: number | null; note?: string }
      handoff: { found: boolean; path?: string; next?: string; corrupt?: boolean }
      progress: { found: boolean; path?: string; next?: string }
    }
  }
}

export function fetchResumePlan(input: { runId?: string; sessionId?: string }): Promise<ResumePlanDto> {
  const q = new URLSearchParams()
  if (input.runId) q.set('runId', input.runId)
  if (input.sessionId) q.set('sessionId', input.sessionId)
  return request<ResumePlanDto>(`/api/harness/resume-plan?${q.toString()}`)
}

// ---- 观测信号聚合（2026-10-19 观测层轮）----
export interface TokenSplitDto {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
}

export interface ObsDayAggDto {
  day: string
  sessions: number
  llmCalls: number
  llmErrors: number
  rateLimit429: number
  toolCalls: number
  toolFailures: number
  tokens: TokenSplitDto
  ttftMs: { p50: number | null; p95: number | null; samples: number }
  llmDurationMs: { p50: number | null; p95: number | null }
}

export interface ObsSignalsDto {
  ok: boolean
  days: number
  available: boolean
  byDay: ObsDayAggDto[]
  totals: Omit<ObsDayAggDto, 'day'> & {
    llmErrorRate: number | null
    toolFailureRate: number | null
    rateLimit429Rate: number | null
    cacheHitRate: number | null
  }
  byModel: Array<{ model: string; llmCalls: number; tokens: TokenSplitDto }>
  notes: string[]
  sources: { traceFiles: number; traceRows: number }
}

export function fetchObsSignals(days = 7): Promise<ObsSignalsDto> {
  return request<ObsSignalsDto>(`/api/harness/obs-signals?days=${encodeURIComponent(String(days))}`)
}

// ---- 基线漂移告警（2026-10-19 观测层轮）----
export type ObsAlertKindDto = 'cost-spike' | 'latency-spike' | 'error-rate' | 'quality-drift'

export interface ObsAlertDto {
  kind: ObsAlertKindDto
  severity: 'warn' | 'critical'
  current: number | null
  baseline: number | null
  ratio?: number | null
  deltaPp?: number | null
  threshold: number
  evidence: string
}

export interface ObsAlertsDto {
  ok: boolean
  baselineDays: number
  windowDays: number
  alerts: ObsAlertDto[]
  skipped: Array<{ kind: ObsAlertKindDto; reason: 'no_baseline' | 'no_data'; detail: string }>
  thresholds: {
    costSpikeRatio: number
    latencySpikeRatio: number
    errorRateDeltaPp: number
    qualityDropPp: number
    minBaselineSamples: number
  }
  sources: { traceRows: number; traceFiles: number; evalRunsCurrent: number; evalRunsBaseline: number }
  notes: string[]
}

export function fetchObsAlerts(days = 7): Promise<ObsAlertsDto> {
  return request<ObsAlertsDto>(`/api/harness/obs-alerts?days=${encodeURIComponent(String(days))}`)
}

