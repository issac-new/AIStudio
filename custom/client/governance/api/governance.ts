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
  editable: boolean
  markdown: string
}

export function fetchGovernanceOverview(): Promise<GovernanceOverview> {
  return request<GovernanceOverview>('/api/governance/overview')
}

export function fetchGovernanceDoc(kind: string): Promise<GovernanceDoc> {
  return request<GovernanceDoc>(`/api/governance/doc?kind=${encodeURIComponent(kind)}`)
}

/** 通用工件编辑链（R13，吸收二期 #9）：保存即本地 git 提交；ref 分支证据件服务端 409 只读。 */
export function saveGovernanceDoc(kind: string, markdown: string, message: string, actor?: string): Promise<{ ok: boolean; commit: string; committedAt: string }> {
  return request('/api/governance/doc', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, markdown, message, actor }),
  })
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
    /** qgate v0.3.1 吸收轮：来源分布（核验/声明/降级/无信号，旧 run 不入桶）与 advisory run 数。 */
    sourceDistribution?: { verified: number; declared: number; degraded: number; none: number }
    advisoryRuns?: number
  }
}

// ── qgate 逐门最新判定（吸收轮：机器判定进交付网络/治理实况的数据面）──
export interface QgateVerdictRow {
  gateId: string
  domain: string
  verdict: string
  deliveryVerdict: 'pass' | 'conditional' | 'reject'
  runId?: string
  endedAt: number | null
  failureSummary?: string
  conditions?: string[]
  sourceBucket?: 'verified' | 'declared' | 'degraded' | 'none'
}

export function fetchQgateVerdicts(): Promise<{ ok: boolean; verdicts: QgateVerdictRow[] }> {
  return request<{ ok: boolean; verdicts: QgateVerdictRow[] }>('/api/governance/qgate-verdicts')
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

/** 跨账号板状态分布（G3 2026-10-10）：全部板的分状态计数与 WIP，逐板 fail-soft */
export interface BoardStatusEntry {
  slug: string
  name: string
  available: boolean
  total: number
  statuses: Record<string, number>
  wip: number
  updatedAt?: number
}
export interface BoardStatusResult {
  ok: boolean
  boards: BoardStatusEntry[]
  fetchedAt: number
}
export function fetchBoardStatus(): Promise<BoardStatusResult> {
  return request<BoardStatusResult>('/api/governance/board-status')
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

// ── 4A 治理层第五期②展示面（状态-事件本体）──
export interface StateModelTransitionDto {
  id: string
  from: string
  to: string
  trigger: string
  rules: string[]
  actions: string[]
  evidence: string
}
export interface StateModelResp {
  ok: boolean
  exists: boolean
  path: string | null
  problems: string[]
  doc: {
    object: string
    authority: string
    states: Array<{ id: string; semantics: string }>
    freeMoveStates?: string[]
    runOutcomeTerminal: Record<string, string>
    transitions: StateModelTransitionDto[]
    eventSources: Array<{ id: string; authority: string; kind: string }>
  } | null
}
export function fetchStateModel(): Promise<StateModelResp> {
  return request<StateModelResp>('/api/governance/state-model')
}

// ---- 五流断点诊断（甲1，2026-09-30 调研落地） ----
export interface OrgSignalDto {
  id: string
  severity: 'ok' | 'warn' | 'alert' | 'unknown'
  value: string
  detail: string
  evidence: string
}
export interface FlowDiagnosisDto {
  flow: 'information' | 'decision' | 'responsibility' | 'resource' | 'feedback'
  title: string
  essence: string
  signals: OrgSignalDto[]
}
export interface ImprovementCandidateDto {
  tool: string
  incidents: number
  unattributed: number
  gaps: string[]
  direction: string
  lastAt: number
}
export interface OrgDiagnosisResp {
  ok: boolean
  generatedAt: number
  flows: FlowDiagnosisDto[]
  manualIntervention: { last7d: number; last30d: number; totalDecided: number }
  unattributed: Array<{ escalationId: string; fromAgent: string; tool: string; decidedAt: number; verdict: string }>
  improvementCandidates: ImprovementCandidateDto[]
  sources: Record<string, number>
}
export function fetchOrgDiagnosis(): Promise<OrgDiagnosisResp> {
  return request<OrgDiagnosisResp>('/api/governance/org-diagnosis')
}

/** 机制归因（甲2）：已裁决升级结案补断点五选一。 */
export function attributeEscalation(id: string, gap: string, note?: string): Promise<{ ok: boolean; request?: unknown; detail?: string }> {
  return request<{ ok: boolean; request?: unknown; detail?: string }>(`/api/escalation/${encodeURIComponent(id)}/attribution`, {
    method: 'POST',
    body: { gap, note, by: 'studio' },
  })
}

// ---- 板级共享知识图谱（丙7/丙8，2026-09-30 调研落地） ----
export interface BoardSyncResultDto {
  board: string
  scanned: number
  ingested: number
  relations: number
  conflicts: Array<{ entityId: string; field: string; existing: unknown; incoming: unknown }>
  kgAvailable: boolean
  /** KG 演化治理（A3，2026-10-02）：合并分级统计。 */
  governed?: { auto: number; manual: number; breaker: boolean; reason?: string }
  /** KG 演化治理（A2）：三档去重统计。 */
  dedup?: { autoAlias: number; review: number }
  /** A5 质量门禁（2026-10-03）：passed=false 即已自动回滚。 */
  qualityGate?: { passed: boolean; rolledBack?: boolean; reason?: string; before?: { coverage: number; aliasRatio: number; orphanRate: number }; after?: { coverage: number; aliasRatio: number; orphanRate: number } }
}
export interface KgSummaryDto {
  ok: boolean
  board: string
  nodes: number
  edges: number
  byType: Record<string, number>
  recent: Array<{ id: string; type: string }> | null
}
export interface ConflictInboxDto {
  inboxId: string
  ts: number
  board: string
  entityId: string
  field: string
  existing: unknown
  incoming: unknown
  resolved: false | { action: 'keep-existing' | 'take-incoming'; at: number }
  /** additive（KG 演化治理）：field-conflict=属性矛盾；merge-review=去重/治理扣留待裁决。 */
  kind?: 'field-conflict' | 'merge-review'
  /** additive：merge-review 去重档的名称相似度。 */
  similarity?: number
}
export function syncKnowledgeGraph(board?: string): Promise<{ ok: boolean; results: BoardSyncResultDto[] }> {
  const q = board ? `?board=${encodeURIComponent(board)}` : ''
  return request<{ ok: boolean; results: BoardSyncResultDto[] }>(`/api/governance/knowledge-graph/sync${q}`, { method: 'POST' })
}
export function fetchKgSummary(board = 'main'): Promise<KgSummaryDto> {
  return request<KgSummaryDto>(`/api/governance/knowledge-graph/summary?board=${encodeURIComponent(board)}`)
}
export function fetchConflictInbox(): Promise<{ ok: boolean; inbox: ConflictInboxDto[] }> {
  return request<{ ok: boolean; inbox: ConflictInboxDto[] }>('/api/governance/knowledge-graph/conflicts')
}
export function resolveConflict(inboxId: string, action: 'keep-existing' | 'take-incoming'): Promise<{ ok: boolean; entry?: ConflictInboxDto; detail?: string }> {
  return request<{ ok: boolean; entry?: ConflictInboxDto; detail?: string }>('/api/governance/knowledge-graph/conflicts/resolve', {
    method: 'POST',
    body: { inboxId, action },
  })
}

// ---- KG 演化治理（A1/A4，2026-10-02 动态本体三部曲调研落地；/api/kg-evolution/*） ----
export interface KgEvolutionStatusDto {
  ok: boolean
  envEnabled: boolean
  armed: boolean
  running: boolean
  intervalMs: number
  batchSize: number
  batchWindowMs: number
  minSyncIntervalMs: number
  pendingCount: number
  pending: Array<{ slug: string; mtimeMs: number; firstSeenAt: number; count: number; ageMs: number }>
  lastSuccessAt: number
  /** 节流余量（ms）：距下次允许自动同步的剩余等待；0=已可触发。 */
  throttleRemainMs: number
}
export interface KgVersionDto {
  ts: number
  file: string
  bytes: number
  nodes: number
  /** 快照类型（A5 2026-10-03）：auto-pre=门禁前基线 / auto-post=通过后正式版（旧档缺省 auto）。 */
  label?: string
}
export function kgEvolutionStatus(): Promise<KgEvolutionStatusDto> {
  return request<KgEvolutionStatusDto>('/api/kg-evolution/status')
}
/** 手动兜底：立即推进一轮自动同步（force，绕节流/攒批等待）。 */
export function tickKg(): Promise<{ ok: boolean; tick: { synced: boolean; reason: string; pendingCount: number } }> {
  return request<{ ok: boolean; tick: { synced: boolean; reason: string; pendingCount: number } }>('/api/kg-evolution/tick', { method: 'POST' })
}
export function armKg(): Promise<{ ok: boolean; armed: boolean; envEnabled: boolean }> {
  return request<{ ok: boolean; armed: boolean; envEnabled: boolean }>('/api/kg-evolution/arm', { method: 'POST' })
}
export function disarmKg(): Promise<{ ok: boolean; armed: boolean; envEnabled: boolean }> {
  return request<{ ok: boolean; armed: boolean; envEnabled: boolean }>('/api/kg-evolution/disarm', { method: 'POST' })
}
export function fetchKgVersions(board: string): Promise<{ ok: boolean; board: string; versions: KgVersionDto[] }> {
  return request<{ ok: boolean; board: string; versions: KgVersionDto[] }>(`/api/kg-evolution/versions?board=${encodeURIComponent(board)}`)
}
export function rollbackKg(board: string, ts: number): Promise<{ ok: boolean; board: string; ts: number; preRollback: string; detail?: string }> {
  return request<{ ok: boolean; board: string; ts: number; preRollback: string; detail?: string }>('/api/kg-evolution/rollback', {
    method: 'POST',
    body: { board, ts },
  })
}

// ---- 决策图谱/规则闸/回放 UI 化（2026-10-01 用户裁定） ----
export interface DecisionGraphStatus {
  ok: boolean
  available: boolean
  python: boolean
  kgPath: string
  exists: boolean
  nodes: number
  decisions: number
}
export interface DecisionItem {
  id: string
  category: string | null
  scenario: string | null
  outcome: string | null
  confidence: number | null
  decidedBy?: string | null
}
export interface ChainItem extends DecisionItem { }
export interface ReplayResp {
  ok: boolean
  at: number
  snapshotTs: number | null
  lagMs: number | null
  decisions: DecisionItem[]
}
export interface SnapshotsResp {
  ok: boolean
  stats: { count: number; totalBytes: number }
  snapshots: Array<{ file: string; ts: number }>
}
export function fetchDgStatus(): Promise<DecisionGraphStatus> {
  return request<DecisionGraphStatus>('/api/governance/decision-graph/status')
}
export function fetchDgDecisions(limit = 30): Promise<{ ok: boolean; decisions: DecisionItem[]; total: number }> {
  return request<{ ok: boolean; decisions: DecisionItem[]; total: number }>(`/api/governance/decision-graph/decisions?limit=${limit}`)
}
export function fetchDgChain(id: string): Promise<{ ok: boolean; chain: ChainItem[] }> {
  return request<{ ok: boolean; chain: ChainItem[] }>(`/api/governance/decision-graph/chain?id=${encodeURIComponent(id)}`)
}
export function syncDgGates(): Promise<{ ok: boolean; ingested: number; totalSeen: number }> {
  return request<{ ok: boolean; ingested: number; totalSeen: number }>('/api/governance/decision-graph/sync-gates', { method: 'POST' })
}
export function fetchDgReplay(at: number): Promise<ReplayResp> {
  return request<ReplayResp>(`/api/governance/decision-graph/replay?at=${at}`)
}
export function fetchDgSnapshots(): Promise<SnapshotsResp> {
  return request<SnapshotsResp>('/api/governance/decision-graph/snapshots')
}
export interface DecisionRulesResp {
  ok: boolean
  exists: boolean
  doc?: {
    version: number
    mode: string
    rules: Array<{ id: string; description?: string; when: Record<string, string>; then: string; message: string }>
  } | null
  problems?: string[]
  error?: string
}
export function fetchDecisionRules(): Promise<DecisionRulesResp> {
  return request<DecisionRulesResp>('/api/governance/decision-rules')
}
/** PROV-O 导出（下载 JSON-LD 文件——audit 四源证据链标准格式）。 */
export async function downloadProvO(limit = 200): Promise<void> {
  const res = await request<Record<string, unknown>>(`/api/governance/audit-log/prov-o?limit=${limit}`)
  const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/ld+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prov-o-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonld`
  a.click()
  URL.revokeObjectURL(url)
}
