// custom/client/governance/api/org-workbench.ts
// 组织工作台 REST 客户端（批三 T6）：决策议程 / 团队面 / 贡献回顾三端点群。
// DTO 自持（不 import custom/server——客户端不依赖服务端模块；kanban/api/outcome 同款纪律）。
// 服务端正身：orgworkbench/org-workbench-controller.ts＋outcome/outcome-controller.ts
// （GET /:id team 面、GET /:id/contribution、POST /:id/contribution-reviews、PUT /:id/team）。
//
// 契约要点：
// - 功能门：OUTCOME_WORKBENCH≠1 → 404 {code:'outcome_workbench_disabled'}，本模块抛
//   OrgWorkbenchDisabledError，组件据此整段不渲染（不报错）——kanban outcome.ts 同款。
// - 写面幂等键（reviewId）由本模块生成；服务端同键重放返回原记录不重复落账。
// - 客户端不传身份面（signedBy/updatedBy）——服务端一律取登录态，白名单外键被静默丢弃。
// - ApiError 携带 code/problems：409 version_conflict（团队乐观并发）据此提示刷新重试。
import { authFetch } from '@/custom/shared/http'

// ── 决策议程（GET /api/hermes/org-workbench/agenda）──

export type AgendaItemKind =
  | 'approval_pending' | 'dual_sign_pending' | 'outcome_overdue'
  | 'premise_due' | 'premise_refuted' | 'review_disagreement'
  | 'escalation_pending' | 'learning_candidate' | 'team_pending'

/** 读源 kind（服务端 agenda.ts 七源 key 枚举——按底层账本拆分，逐源独立 available）。 */
export type AgendaSourceKind =
  | 'approvals' | 'outcome_contracts' | 'premises'
  | 'review_cases' | 'escalations' | 'exp_candidates' | 'outcome_teams'

export type AgendaRiskTier = 'low' | 'medium' | 'high'
export type AgendaReversibility = 'reversible' | 'costly' | 'one-way' | 'unknown'

export interface AgendaItem {
  agendaId: string
  outcomeId?: string
  kind: AgendaItemKind
  question: string
  owner?: string
  evidenceRefs: string[]
  riskTier?: AgendaRiskTier
  reversibility?: AgendaReversibility
  age: number
  sourceRef: string
}

export interface AgendaSourceStatus {
  available: boolean
  itemCount: number
  items?: AgendaItem[]
  error?: string
}

export interface AgendaResult {
  generatedAt: number
  sources: Record<AgendaSourceKind, AgendaSourceStatus>
}

// ── 团队面（GET /api/hermes/outcomes/:id 扩展面＋PUT /:id/team）──

export type TeamSubjectKind = 'person' | 'agent'
export type OutcomeTeamStatus = 'draft' | 'active' | 'closed'

export interface OutcomeTeamMember {
  subjectKind: TeamSubjectKind
  subjectId: string
  role: string
  responsibility: string
}

export interface OutcomeTeam {
  outcomeId: string
  version: number
  members: OutcomeTeamMember[]
  status: OutcomeTeamStatus
  changeReason: string
  updatedBy: string
  updatedAt: number
}

/** GET /:id 响应里组件消费的合同最小面（多余字段透传不裁剪）。 */
export interface OutcomeContractFace {
  outcomeId: string
  rootTaskId: string
  version: number
  title: string
  ownerPersonId: string
  verificationOwnerId: string
  riskTier: AgendaRiskTier
  status: string
}

export interface OutcomeTeamFace {
  contract: OutcomeContractFace
  team: OutcomeTeam | null
  readScope: 'full' | 'metadata'
}

export interface ConfirmTeamInput {
  /** 当前团队版本；无团队首次确认为 0（服务端非负整数守卫）。 */
  expectedVersion: number
  members: OutcomeTeamMember[]
  status: OutcomeTeamStatus
  changeReason: string
}

// ── 贡献回顾（GET /:id/contribution＋POST /:id/contribution-reviews）──

export type ContributionSubjectKind = 'person' | 'agent' | 'team'
export type ContributionAssessment = 'effective' | 'mixed' | 'ineffective' | 'unknown'

/** 逐面失败态：available:false 时 reason 必在——失败≠零数据（fail-soft 不猜数）。 */
export interface FaceFail {
  available: false
  reason: string
}

export interface ContributionReviewRow {
  id: string
  outcomeId: string
  subject: { subjectKind: ContributionSubjectKind; subjectId: string }
  assessment: ContributionAssessment
  /** metadata 读面脱敏时缺席（服务端 reviewMetadata）。 */
  rationale?: string
  evidenceRefs?: string[]
  signedBy: string
  signedAt: number
  source: string
}

export interface ContributionMeasurementRow {
  measurementId: string
  measureId: string
  contractVersion: number
  actual: number | null
  availability: 'available' | 'pending' | 'unavailable'
  observedAt: number
  recordedBy: string
}

export interface LearningCandidateRow {
  id: string
  type: string
  status: string
  outcomeId?: string
}

export interface InjectionLogRow {
  ids: string[]
  [k: string]: unknown
}

export interface TimelineRow {
  eventId: string
  type: string
  at: number
  actor: string
  contractVersion: number
}

/** GET /:id/contribution 响应（六面：五面 fail-soft＋第六面评审结论 v1 恒 unavailable）。 */
export interface ContributionRead {
  outcomeId: string
  readScope: 'full' | 'metadata'
  measurements: FaceFail | { available: true; items: ContributionMeasurementRow[] }
  team: FaceFail | { available: true; item: OutcomeTeam | null }
  reviews: FaceFail | { available: true; items: ContributionReviewRow[] }
  learning: FaceFail | { available: true; candidates: LearningCandidateRow[]; injections: InjectionLogRow[] }
  events: FaceFail | { available: true; timeline: TimelineRow[] }
  reviewConclusions: FaceFail
}

export interface ContributionReviewInput {
  subjectKind: ContributionSubjectKind
  subjectId: string
  assessment: ContributionAssessment
  rationale: string
  evidenceRefs: string[]
}

// ── 错误与请求底座 ──

/** 功能门关闭专用错误：组件按 instanceof 整段隐藏本区（不显示报错）。 */
export class OrgWorkbenchDisabledError extends Error {
  readonly code = 'outcome_workbench_disabled'
  constructor() {
    super('结果工作台未启用（需 OUTCOME_WORKBENCH=1）')
    this.name = 'OrgWorkbenchDisabledError'
  }
}

/** 非 2xx 统一错误：status/code/problems 透传（409 version_conflict 据此分支）。 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly problems: string[]
  constructor(message: string, status: number, code: string | null = null, problems: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.problems = problems
  }
}

async function parseBody(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

/** 统一请求：门关 404 抛 OrgWorkbenchDisabledError；其余失败抛 ApiError（拼 problems）。 */
async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const res = await authFetch(path, init)
  const j = await parseBody(res)
  if (res.status === 404 && j?.code === 'outcome_workbench_disabled') {
    throw new OrgWorkbenchDisabledError()
  }
  if (!res.ok || j?.ok === false) {
    const problems = Array.isArray(j?.problems) ? (j.problems as string[]) : []
    const base = typeof j?.error === 'string' ? j.error : `请求失败（HTTP ${res.status}）`
    throw new ApiError(problems.length ? `${base}：${problems.join('；')}` : base, res.status,
      typeof j?.code === 'string' ? j.code : null, problems)
  }
  return j ?? {}
}

/** 幂等键生成（服务端控制器同风格）。 */
function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── 决策议程 ──

export async function fetchAgenda(): Promise<AgendaResult> {
  const j = await request('/api/hermes/org-workbench/agenda')
  const sources = (j.sources ?? {}) as Record<AgendaSourceKind, AgendaSourceStatus>
  return { generatedAt: Number(j.generatedAt ?? 0), sources }
}

// ── 结果定位（outcomeId 直取；rootTaskId 经列表端点解析）──

/**
 * 输入 outcomeId 或根任务 id → GET /:id team 面。
 * 404 not_found 时按根任务重查（?rootTaskId= 列表首条）；两路皆空返回 null（确认无合同）。
 */
export async function resolveOutcomeFace(input: string): Promise<OutcomeTeamFace | null> {
  const trimmed = input.trim()
  if (!trimmed) return null
  let id = trimmed
  const first = await request(`/api/hermes/outcomes/${encodeURIComponent(id)}`)
    .catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404 && err.code === 'not_found') return null
      throw err
    })
  if (first) return first as unknown as OutcomeTeamFace
  // 按根任务解析：列表端点命中即取首条（rootTaskId 唯一由服务端 409 保证）
  const list = await request(`/api/hermes/outcomes?rootTaskId=${encodeURIComponent(trimmed)}`)
  const items = Array.isArray(list.items) ? (list.items as { outcomeId?: unknown }[]) : []
  const hit = items.find((c) => typeof c?.outcomeId === 'string')
  if (!hit) return null
  id = hit.outcomeId as string
  const j = await request(`/api/hermes/outcomes/${encodeURIComponent(id)}`)
  return j as unknown as OutcomeTeamFace
}

// ── 团队确认 ──

export async function confirmOutcomeTeam(outcomeId: string, input: ConfirmTeamInput): Promise<OutcomeTeam> {
  const j = await request(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/team`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return j.team as OutcomeTeam
}

// ── 贡献回顾 ──

export async function fetchContribution(outcomeId: string): Promise<ContributionRead> {
  const j = await request(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/contribution`)
  return j as unknown as ContributionRead
}

export async function submitContributionReview(
  outcomeId: string,
  input: ContributionReviewInput,
): Promise<ContributionReviewRow> {
  const j = await request(`/api/hermes/outcomes/${encodeURIComponent(outcomeId)}/contribution-reviews`, {
    method: 'POST',
    body: JSON.stringify({
      reviewId: genId('cr'),
      subject: { subjectKind: input.subjectKind, subjectId: input.subjectId },
      assessment: input.assessment,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs,
    }),
  })
  return j.review as ContributionReviewRow
}
