// overlay/custom/client/governance/api/workbench.ts
// Harness² 改进实验台数据面（/api/harness/workbench/*）。
// DTO 与 custom/server/harness/workbench/types.ts 逐字段对齐；请求走 @/api/client。
import { request } from '@/api/client'

export type SurfaceKey =
  | 'system_prompt' | 'guardrails' | 'memory' | 'tool_guidance'
  | 'subagents' | 'skills' | 'scripts' | 'plugins'

export type ProposalStatus =
  | 'draft' | 'submitted' | 'approved' | 'rejected'
  | 'probing' | 'composed' | 'promoted' | 'rolled_back'

export interface SurfaceSourceDto {
  components: string[]
  context: 'always_on' | 'on_demand' | 'tool_loop'
  opencode: string
  codex: string
}

export interface SurfaceDto {
  key: SurfaceKey
  nameZh: string
  nameEn: string
  source: SurfaceSourceDto
  applyMode: 'managed' | 'advisory'
  risk: 'low' | 'medium' | 'high'
  editable: boolean
  available: boolean
  artifacts: { count: number; samples: string[] }
  revision: string | null
  writableRoots: string[] | null
  expected: string
  managedBy: string
  note: string
}

export interface VariantFileDto {
  path: string
  content: string
  digest: string
}

export interface VariantDto {
  id: string
  label: string
  content: string
  digest: string
  diffSummary: { added: number; removed: number; unchanged: number }
  files?: VariantFileDto[]
  deletions?: string[]
}

export interface RegressionDto {
  runId: string
  suiteName: string
  total: number
  failed: number
  failedTaskIds: string[]
}

export interface ProbeMetricsDto {
  evalRunId: string
  setId: string
  setRevision?: number
  k: number
  passAt1: number | null
  passAtK: number | null
  resultPassRate: number | null
  trajectoryPassRate: number | null
  unknownRatio: number | null
  riskVeto: boolean
  judgeOnline: boolean
  statisticallyInsufficient: boolean
  tokens: number | null
  costUsd: number | null
  steps: number | null
  latencyMs: number | null
  regression?: RegressionDto
}

export interface BehaviorContrastDto {
  quality: 'improved' | 'regressed' | 'neutral' | 'unknown'
  reasons: string[]
  passAt1Delta: number | null
  passAtKDelta: number | null
  resultPassRateDelta: number | null
  trajectoryPassRateDelta: number | null
  unknownRatioDelta: number | null
  tokenDeltaPct: number | null
  costDeltaPct: number | null
  stepDeltaPct: number | null
  latencyDeltaPct: number | null
  regressionFailed: number | null
}

export interface AutoRunStateDto {
  status: 'running' | 'done' | 'stopped' | 'failed'
  setId: string
  tasksTotal: number
  tasksDone: number
  costUsd: number
  estimatedTasks: number
  reason?: string
  error?: string
  startedAt: string
  finishedAt?: string
}

export interface ProbeDto {
  id: string
  variantId: string
  status: 'planned' | 'recorded' | 'failed'
  evalRunId?: string
  regressionRunId?: string
  evidence?: ProbeMetricsDto
  contrast?: BehaviorContrastDto
  note?: string
  recordedBy?: string
  createdAt: string
  recordedAt?: string
  autoRun?: AutoRunStateDto
}

export interface ApprovalDto {
  decision: 'approved' | 'rejected'
  actor: string
  note: string
  variantSetDigest: string
  at: string
  approvalLogId?: string
}

export interface PromotionDto {
  actor: string
  at: string
  digest: string
  applied: boolean
  targetPath?: string
  backupPath?: string
}

export interface CompositionDto {
  variantId?: string
  mergedContent?: string
  digest: string
  rationale: string
  actor: string
  at: string
}

export interface GateBlockerDto { code: string; message: string }

export interface ProposalDto {
  id: string
  title: string
  hypothesis: string
  surfaceKey: SurfaceKey
  targetPath: string | null
  treeRoot?: string | null
  risk: 'low' | 'medium' | 'high'
  mode: 'parallel' | 'sequential'
  status: ProposalStatus
  domain: string
  budgetCapUsd: number
  evidenceRefs: string[]
  experienceIds: string[]
  baselineRunId: string | null
  baseline: ProbeMetricsDto | null
  base: { content: string; digest: string; revision: string | null; exists: boolean } | null
  variants: VariantDto[]
  probes: ProbeDto[]
  approval: ApprovalDto | null
  composition: CompositionDto | null
  promotion: PromotionDto | null
  rollback: { actor: string; at: string; reason: string; restoredDigest: string | null; fileRestored: boolean } | null
  createdBy: string
  createdAt: string
  updatedAt: string
  derived: {
    gate: { ok: boolean; blockers: GateBlockerDto[]; warnings: GateBlockerDto[] }
    cost: { total: number; complete: boolean; missing: string[] }
    recordedProbes: number
    totalProbes: number
    selectedVariantId: string | null
    selectedContrast: BehaviorContrastDto | null
    diversity: { n: number; nDistinct: number; meanLineJaccard: number }
  }
}

export interface ExperienceDto {
  id: string
  surfaceKey: SurfaceKey | null
  domain?: string | null
  statement: string
  cue?: string
  lesson?: string
  evidenceText?: string
  evidenceRefs: string[]
  confidence: 'low' | 'medium' | 'high'
  status: 'candidate' | 'adopted' | 'retired'
  sourceProposalId?: string
  sourceCandidateId?: string
  snapshot?: { variantId: string; digest: string; targetPath: string | null; content: string }
  createdAt: string
  updatedAt: string
}

export interface ChampionDto {
  id: string
  surfaceKey: SurfaceKey
  proposalId: string
  variantId: string
  digest: string
  label: string
  previousDigest: string | null
  previousProposalId: string | null
  targetPath: string | null
  applied: boolean
  promotedAt: string
  promotedBy: string
  rolledBack?: boolean
}

export interface WorkbenchOverviewDto {
  ok: boolean
  surfaces: SurfaceDto[]
  counts: Record<string, number>
  budget: { observedUsd: number; capUsd: number; proposalsWithBudget: number }
  proposals: ProposalDto[]
  champions: ChampionDto[]
  experiences: ExperienceDto[]
  meta: { note: string; source: string; boundary: string }
}

export function fetchWorkbenchOverview(): Promise<WorkbenchOverviewDto> {
  return request<WorkbenchOverviewDto>('/api/harness/workbench/overview')
}

export interface CreateProposalInput {
  title: string
  hypothesis: string
  surfaceKey: SurfaceKey
  targetPath?: string
  mode: 'parallel' | 'sequential'
  domain?: string
  budgetCapUsd: number
  evidenceRefs: string[]
  experienceIds?: string[]
  treeRoot?: string
  variants: Array<{ label?: string; content?: string; files?: Array<{ path: string; content: string }>; deletions?: string[] }>
}

export function createWorkbenchProposal(input: CreateProposalInput): Promise<{ ok: boolean; proposal: ProposalDto }> {
  return request('/api/harness/workbench/proposals', { method: 'POST', body: JSON.stringify(input) })
}

export function attachWorkbenchBaseline(id: string, evalRunId: string): Promise<{ ok: boolean; proposal: ProposalDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/baseline`, {
    method: 'POST', body: JSON.stringify({ evalRunId }),
  })
}

export function submitWorkbenchProposal(id: string): Promise<{ ok: boolean; proposal: ProposalDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/submit`, { method: 'POST', body: '{}' })
}

export function decideWorkbenchProposal(
  id: string, decision: 'approve' | 'reject', actor: string, note = '',
): Promise<{ ok: boolean; proposal: ProposalDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/decide`, {
    method: 'POST', body: JSON.stringify({ decision, actor, note }),
  })
}

export function createWorkbenchProbes(id: string): Promise<{ ok: boolean; proposal: ProposalDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/probes`, { method: 'POST', body: '{}' })
}

export interface AutoProbeJobDto {
  proposalId: string
  status: 'running' | 'done' | 'failed'
  variantsTotal: number
  variantsDone: number
  costUsd: number
  estimatedTasks: number
  error?: string
}

export function startAutoProbe(
  id: string,
  input: { setId: string; regressionSetId?: string; maxTasks?: number; estimatedCostPerTaskUsd?: number },
): Promise<{ ok: boolean; job: AutoProbeJobDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/probes/auto-run`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function fetchAutoProbeStatus(id: string): Promise<{ ok: boolean; running: boolean }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/probes/auto-status`)
}

export function recordWorkbenchProbe(
  id: string, probeId: string, input: { evalRunId: string; regressionRunId?: string; note?: string; actor?: string },
): Promise<{ ok: boolean; proposal: ProposalDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/probes/${encodeURIComponent(probeId)}/record`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export function composeWorkbenchProposal(
  id: string, input: { variantId?: string; mergedContent?: string; rationale: string },
): Promise<{ ok: boolean; proposal: ProposalDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/compose`, {
    method: 'POST', body: JSON.stringify(input),
  })
}

export interface ReflectionInputDto {
  cue?: string
  lesson?: string
  evidence?: string
  confidence?: 'low' | 'medium' | 'high'
}

export function promoteWorkbenchProposal(
  id: string, apply: boolean, reflection?: ReflectionInputDto,
): Promise<{ ok: boolean; proposal: ProposalDto; applied: boolean; gate: { ok: boolean; blockers: GateBlockerDto[] }; experience?: ExperienceDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/promote`, {
    method: 'POST', body: JSON.stringify({ apply, ...(reflection ? { reflection } : {}) }),
  })
}

export function rollbackWorkbenchProposal(
  id: string, reason: string,
): Promise<{ ok: boolean; proposal: ProposalDto }> {
  return request(`/api/harness/workbench/proposals/${encodeURIComponent(id)}/rollback`, {
    method: 'POST', body: JSON.stringify({ reason }),
  })
}

export function fetchWorkbenchExperiences(): Promise<{ ok: boolean; experiences: ExperienceDto[] }> {
  return request('/api/harness/workbench/experiences')
}

export function addWorkbenchExperience(input: {
  surfaceKey?: SurfaceKey | null; domain?: string | null; statement: string;
  cue?: string; lesson?: string; evidenceText?: string;
  evidenceRefs: string[]; confidence?: 'low' | 'medium' | 'high'
}): Promise<{ ok: boolean; experience: ExperienceDto }> {
  return request('/api/harness/workbench/experiences', { method: 'POST', body: JSON.stringify(input) })
}

export function importWorkbenchExperiences(): Promise<{ ok: boolean; imported: number; skipped: number }> {
  return request('/api/harness/workbench/experiences/import', { method: 'POST', body: '{}' })
}

export function setWorkbenchExperienceStatus(
  id: string, status: 'candidate' | 'adopted' | 'retired',
): Promise<{ ok: boolean; experience: ExperienceDto }> {
  return request(`/api/harness/workbench/experiences/${encodeURIComponent(id)}/status`, {
    method: 'POST', body: JSON.stringify({ status }),
  })
}
