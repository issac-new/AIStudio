// overlay/custom/client/ia2/api/review-gov.ts
// 评审治理数据面（⑥治理·评审治理页签）：/api/review/gov/* 类型镜像 + fetch 封装
// + 纯视图函数（KPI 卡/档位表/案例行，守门测试锚点）。
// 服务端单一事实源：custom/server/reviewgov/*。
import { authFetch } from '../../ide/utils/auth-fetch'

export type RiskTier = 'low' | 'medium' | 'high'
export type CaseState = 'open' | 'ready' | 'merged' | 'abandoned'
export type CheckState = 'green' | 'red' | 'unknown'
export type FindingSeverity = 'important' | 'nit' | 'preexisting'
export type Resolution = 'fixed' | 'wrong' | 'intentional' | 'didnt_matter'

export interface ReviewPolicyView {
  version: number
  tiers: Record<RiskTier, number>
  trustedAuthors: string[]
  protectedPaths: string[]
  sensitivePaths: string[]
  docPaths: string[]
  internalPaths: string[]
  convergence: {
    maxRounds: number
    diffOnlyAfterRound: number
    nitBudgetPerRound: number
    deferPreexisting: boolean
  }
  circuitBreaker: {
    windowHours: number
    revertRateThreshold: number
    incidentCountThreshold: number
    escalateOneTier: boolean
  }
  largeDiffLines: number
  hugeDiffLines: number
}

export interface BreakerView {
  active: boolean
  windowHours: number
  reverts: number
  merges: number
  incidents: number
  revertRate: number | null
  reasons: string[]
  evaluatedAt: number
}

export interface RiskAssessmentView {
  tier: RiskTier
  requiredHumanApprovals: number
  reasons: string[]
  protectedHits: string[]
  sensitiveHits: string[]
  trustedAuthor: boolean
  breakerTightened: boolean
  classifiedAt: number
}

export interface FindingView {
  findingId: string
  file: string
  line: number
  body: string
  severity: FindingSeverity
  origin: 'new' | 'preexisting'
  bugClass?: string
  authorKind: string
  author?: string
  evidence?: string
  round: number
  dedupeKey: string
  state: string
  deferred: boolean
  deferredReason?: string
  duplicateCount: number
  verifications: Array<{ voter: string; actorKind: string; vote: 'confirm' | 'reject'; at: number }>
  resolution?: Resolution
  createdAt: number
  promotedEvalCaseId?: string
}

export interface RoundView {
  round: number
  headCommit?: string
  changedPaths: string[]
  startedAt: number
  diffOnly: boolean
  findingsAdded: number
  nitCount: number
  passed?: boolean
}

export interface ApprovalView {
  approvalId: string
  actor?: string
  actorKind: string
  decision: 'approve' | 'request_changes' | 'comment'
  commit?: string
  note?: string
  at: number
  invalidatedAt?: number
  invalidatedBy?: string
}

export interface ReviewCaseView {
  caseId: string
  title: string
  taskId?: string
  reviewId?: string
  pr?: { provider: 'github' | 'gitlab' | 'generic'; repo: string; number: number; url?: string }
  rollback?: { at: number; by?: string; note?: string }
  policyTightenedAt?: number
  author?: string
  authorKind: string
  baseCommit?: string
  headCommit?: string
  changedPaths: string[]
  diffLines: number
  behindFlag: boolean
  risk: RiskAssessmentView
  rounds: RoundView[]
  findings: FindingView[]
  approvals: ApprovalView[]
  checks: CheckState
  state: CaseState
  createdAt: number
  updatedAt: number
}

export interface MergeReadinessView {
  ready: boolean
  blockers: string[]
  humanApprovals: number
  requiredHumanApprovals: number
  agentApprovals: number
  openImportant: number
  blockingFindings: string[]
  checks: CheckState
  roundCapHit: boolean
}

export interface ReviewMetricsView {
  cases: number
  active: number
  merged: number
  firstRoundPassRate: number | null
  meanRounds: number | null
  p95Rounds: number | null
  fivePlusShare: number | null
  humanApprovalsMedian: number | null
  humanWaitMedianMs: number | null
  noiseRate: number | null
  preexistingShare: number | null
  deferredBacklog: number
  openImportant: number
  evalCases: number
  evalRecall: number | null
  evalPrecision: number | null
  breaker: BreakerView
}

export interface NightlyGroupView {
  file: string
  bugClass: string
  count: number
  oldestAt: number
  findingIds: string[]
  caseIds: string[]
}

export interface NightlyReportView {
  reportId: string
  date: string
  generatedAt: number
  backlog: number
  groups: NightlyGroupView[]
  caseCount: number
}

export interface EvalRunView {
  runId: string
  at: number
  total: number
  matched: number
  recall: number | null
  precision: number | null
  missing: string[]
  falsePositives: Array<{ file: string; line?: number; title?: string }>
  createdBy?: string
}

export interface CaseDetail {
  case: ReviewCaseView
  readiness: MergeReadinessView
}

async function json<T>(res: Response, path: string): Promise<T> {
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    throw new Error(`${path} → HTTP ${res.status}（响应非 JSON）`)
  }
  const o = data as { ok?: boolean; detail?: string } | null
  if (!res.ok || o?.ok === false) throw new Error(o?.detail || `${path} → HTTP ${res.status}`)
  return data as T
}

export async function fetchPolicy(): Promise<{ policy: ReviewPolicyView; breaker: BreakerView }> {
  const path = '/api/review/gov/policy'
  return json(await authFetch(path), path)
}

export async function fetchCases(params: { state?: string; tier?: string; limit?: number } = {}): Promise<ReviewCaseView[]> {
  const qs = new URLSearchParams()
  if (params.state) qs.set('state', params.state)
  if (params.tier) qs.set('tier', params.tier)
  if (params.limit) qs.set('limit', String(params.limit))
  const path = `/api/review/gov/cases${qs.toString() ? `?${qs}` : ''}`
  const data = await json<{ cases: ReviewCaseView[] }>(await authFetch(path), path)
  return data.cases
}

export async function fetchCase(caseId: string): Promise<CaseDetail> {
  const path = `/api/review/gov/cases/${encodeURIComponent(caseId)}`
  return json(await authFetch(path), path)
}

export async function fetchMetrics(): Promise<ReviewMetricsView> {
  const path = '/api/review/gov/metrics'
  const data = await json<{ metrics: ReviewMetricsView }>(await authFetch(path), path)
  return data.metrics
}

export async function openCase(input: {
  caseId: string
  title: string
  taskId?: string
  reviewId?: string
  author?: string
  headCommit?: string
  changedPaths: string[]
  diffLines?: number
  behindFlag?: boolean
}): Promise<CaseDetail> {
  const path = '/api/review/gov/cases'
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify(input) }), path)
}

export async function addFinding(caseId: string, input: {
  file: string
  line: number
  body: string
  severity: FindingSeverity
  bugClass?: string
  evidence?: string
  authorKind?: string
}): Promise<CaseDetail & { finding: FindingView; deduped: boolean }> {
  const path = `/api/review/gov/cases/${encodeURIComponent(caseId)}/findings`
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify(input) }), path)
}

export async function answerFinding(caseId: string, findingId: string, resolution: Resolution): Promise<CaseDetail> {
  const path = `/api/review/gov/cases/${encodeURIComponent(caseId)}/findings/${encodeURIComponent(findingId)}/answer`
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify({ resolution }) }), path)
}

export async function verifyFinding(caseId: string, findingId: string, vote: 'confirm' | 'reject', voter: string): Promise<CaseDetail> {
  const path = `/api/review/gov/cases/${encodeURIComponent(caseId)}/findings/${encodeURIComponent(findingId)}/verify`
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify({ vote, voter, actorKind: 'agent' }) }), path)
}

export async function recordApproval(caseId: string, input: {
  actor?: string
  actorKind: 'human' | 'agent'
  decision: 'approve' | 'request_changes' | 'comment'
  commit?: string
  note?: string
  conflictResolved?: boolean
}): Promise<CaseDetail> {
  const path = `/api/review/gov/cases/${encodeURIComponent(caseId)}/approvals`
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify(input) }), path)
}

export async function setChecks(caseId: string, checks: CheckState): Promise<CaseDetail> {
  const path = `/api/review/gov/cases/${encodeURIComponent(caseId)}/checks`
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify({ checks }) }), path)
}

export async function recordSignal(kind: 'revert' | 'incident', note?: string): Promise<{ breaker: BreakerView }> {
  const path = '/api/review/gov/signals'
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify({ kind, note }) }), path)
}

export async function mergeCase(caseId: string): Promise<CaseDetail> {
  const path = `/api/review/gov/cases/${encodeURIComponent(caseId)}/state`
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify({ state: 'merged' }) }), path)
}

/** 回滚登记（不自动改代码）：案例转 abandoned + 写回滚信号 + 收紧存量案例。 */
export async function rollbackCase(caseId: string, note?: string): Promise<CaseDetail & { tightenedCases: number }> {
  const path = `/api/review/gov/cases/${encodeURIComponent(caseId)}/rollback`
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify({ note }) }), path)
}

export async function importPr(input: {
  provider: 'github' | 'gitlab' | 'generic'
  repo: string
  number: number
  title?: string
  author?: string
  baseCommit?: string
  headCommit?: string
  changedPaths: string[]
  diffLines?: number
  behindFlag?: boolean
  url?: string
}): Promise<CaseDetail & { created: boolean }> {
  const path = '/api/review/gov/cases/from-pr'
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify(input) }), path)
}

export async function fetchNightly(): Promise<NightlyReportView | null> {
  const path = '/api/review/gov/nightly/latest'
  const data = await json<{ report: NightlyReportView | null }>(await authFetch(path), path)
  return data.report
}

export async function runNightly(): Promise<{ report: NightlyReportView; breaker: BreakerView }> {
  const path = '/api/review/gov/nightly/run'
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify({}) }), path)
}

export async function fetchEvalScore(): Promise<{ latest: EvalRunView | null; runs: EvalRunView[] }> {
  const path = '/api/review/gov/eval/score'
  return json(await authFetch(path), path)
}

export async function runEval(predictions: Array<{ file: string; line?: number; title?: string }>): Promise<{ run: EvalRunView; score: EvalRunView }> {
  const path = '/api/review/gov/eval/run'
  return json(await authFetch(path, { method: 'POST', body: JSON.stringify({ predictions }) }), path)
}

// ── 纯视图函数（守门测试锚点）──

export interface KpiCard {
  key: string
  label: string
  value: string
  detail: string
  state: 'ok' | 'warn' | 'muted'
}

const pct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(v * 100 >= 10 ? 0 : 1)}%`)
const num = (v: number | null, digits = 2): string => (v === null ? '—' : v.toFixed(digits))
const duration = (v: number | null): string => {
  if (v === null) return '—'
  if (v < 60_000) return `${Math.round(v / 1000)}s`
  if (v < 3_600_000) return `${(v / 60_000).toFixed(1)}m`
  return `${(v / 3_600_000).toFixed(1)}h`
}

export function kpiCards(m: ReviewMetricsView): KpiCard[] {
  const fr = m.firstRoundPassRate
  const five = m.fivePlusShare
  const noise = m.noiseRate
  const wait = m.humanWaitMedianMs
  const recall = m.evalRecall
  return [
    {
      key: 'firstRound',
      label: '一轮通过率',
      value: pct(fr),
      detail: '一轮内达到可合并的案例占比（文章基线 65% → 78%）',
      state: fr === null ? 'muted' : fr >= 0.7 ? 'ok' : 'warn',
    },
    {
      key: 'meanRounds',
      label: '平均评审轮次',
      value: num(m.meanRounds),
      detail: '所有案例的评审轮次均值（文章基线 2.08 → 1.32）',
      state: m.meanRounds === null ? 'muted' : m.meanRounds <= 2 ? 'ok' : 'warn',
    },
    {
      key: 'fivePlus',
      label: '5 轮以上占比',
      value: pct(five),
      detail: '硬骨头案例占比（文章基线 8.9% → 1.5%）',
      state: five === null ? 'muted' : five <= 0.05 ? 'ok' : 'warn',
    },
    {
      key: 'humanApprovals',
      label: '人工审批中位数',
      value: num(m.humanApprovalsMedian, 1),
      detail: '每个案例的有效人类审批数（Agent 审批不计入）',
      state: 'muted',
    },
    {
      key: 'humanWait',
      label: '人工等待中位',
      value: duration(wait),
      detail: '案例创建到首个有效人工审批的等待时间',
      state: wait === null ? 'muted' : wait <= 24 * 3600_000 ? 'ok' : 'warn',
    },
    {
      key: 'noise',
      label: '评审噪声率',
      value: pct(noise),
      detail: '作者判定误报/有意为之/无关的比例',
      state: noise === null ? 'muted' : noise <= 0.3 ? 'ok' : 'warn',
    },
    {
      key: 'evalRecall',
      label: '评测集召回',
      value: pct(recall),
      detail: `评测集 ${m.evalCases} 条；最近一次精确率 ${pct(m.evalPrecision)}`,
      state: recall === null ? 'muted' : recall >= 0.8 ? 'ok' : 'warn',
    },
    {
      key: 'breaker',
      label: '回滚熔断',
      value: m.breaker.active ? '已收紧' : '正常',
      detail: `窗口 ${m.breaker.windowHours}h：回滚 ${m.breaker.reverts} / 合并 ${m.breaker.merges}，事故 ${m.breaker.incidents}`,
      state: m.breaker.active ? 'warn' : 'ok',
    },
  ]
}

export interface TierRow {
  tier: RiskTier
  label: string
  approvals: string
  examples: string
}

export function tierRows(policy: ReviewPolicyView): TierRow[] {
  return [
    {
      tier: 'low',
      label: '低风险',
      approvals: `${policy.tiers.low} 人（仅受信任作者）/ 1 人`,
      examples: '文档、文案、内部工具、藏在特性开关后的新增',
    },
    {
      tier: 'medium',
      label: '中风险',
      approvals: `${policy.tiers.medium} 人`,
      examples: '常规产品逻辑、缓存、自动更新器、系统提示词',
    },
    {
      tier: 'high',
      label: '高风险',
      approvals: `${policy.tiers.high} 人`,
      examples: '核心高危代码、计费、CI 配置、发布脚本',
    },
  ]
}

export interface CaseRow {
  caseId: string
  title: string
  tier: RiskTier
  tierLabel: string
  roundText: string
  findingsText: string
  approvalText: string
  stateLabel: string
  state: CaseState
}

const TIER_LABEL: Record<RiskTier, string> = { low: '低', medium: '中', high: '高' }
const STATE_LABEL: Record<CaseState, string> = {
  open: '评审中', ready: '可合并', merged: '已合并', abandoned: '已放弃',
}

export function caseRow(c: ReviewCaseView, maxRounds = 3): CaseRow {
  const open = c.findings.filter((f) => (f.state === 'open' || f.state === 'answered') && !f.deferred)
  const important = open.filter((f) => f.severity === 'important').length
  const nits = open.filter((f) => f.severity === 'nit').length
  const human = c.approvals.filter((a) => a.actorKind === 'human' && a.decision === 'approve' && !a.invalidatedAt && a.commit === c.headCommit).length
  return {
    caseId: c.caseId,
    title: c.title,
    tier: c.risk.tier,
    tierLabel: TIER_LABEL[c.risk.tier],
    roundText: `${c.rounds.length}/${maxRounds}`,
    findingsText: `重要 ${important} · nit ${nits}`,
    approvalText: `${human}/${c.risk.requiredHumanApprovals}`,
    stateLabel: STATE_LABEL[c.state],
    state: c.state,
  }
}

export function openFindings(c: ReviewCaseView): FindingView[] {
  return c.findings
    .filter((f) => (f.state === 'open' || f.state === 'answered') && !f.deferred)
    .sort((a, b) => {
      const rank = (s: FindingSeverity) => (s === 'important' ? 0 : s === 'nit' ? 1 : 2)
      return rank(a.severity) - rank(b.severity) || a.file.localeCompare(b.file) || a.line - b.line
    })
}

export function deferredFindings(c: ReviewCaseView): FindingView[] {
  return c.findings.filter((f) => f.deferred)
}
