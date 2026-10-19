// overlay/custom/server/reviewgov/types.ts
// 评审治理领域类型（2026-10-19 评审治理批，来源：Anthropic《How the Claude Code
// team does code review》2026-10-15）。设计正本：
// docs/superpowers/specs/2026-10-19-review-governance.md。
//
// 本域只做「一次变更集的评审治理」：风险分级 → 轮次/发现项 → 人工审批 → 合并就绪度。
// 行内评论仍归 /api/review；自动检查仍归 qgate。两侧通过 reviewId / checks 关联，
// 不重复存储、不双写。

export type RiskTier = 'low' | 'medium' | 'high'
export type ActorKind = 'human' | 'agent' | 'policy' | 'system'
export type FindingSeverity = 'important' | 'nit' | 'preexisting'
export type FindingOrigin = 'new' | 'preexisting'
export type FindingState = 'open' | 'answered' | 'resolved' | 'dismissed' | 'deferred'
export type Resolution = 'fixed' | 'wrong' | 'intentional' | 'didnt_matter'
export type CaseState = 'open' | 'ready' | 'merged' | 'abandoned'
export type CheckState = 'green' | 'red' | 'unknown'
export type SignalKind = 'revert' | 'incident' | 'merge'

export const RISK_TIERS: readonly RiskTier[] = ['low', 'medium', 'high']
export const ACTOR_KINDS: readonly ActorKind[] = ['human', 'agent', 'policy', 'system']
export const FINDING_SEVERITIES: readonly FindingSeverity[] = ['important', 'nit', 'preexisting']
export const RESOLUTIONS: readonly Resolution[] = ['fixed', 'wrong', 'intentional', 'didnt_matter']
export const SIGNAL_KINDS: readonly SignalKind[] = ['revert', 'incident', 'merge']

export interface ConvergenceConfig {
  /** 最多评审轮次；超过即封顶，提示重新审视方案（文章：3 轮）。 */
  maxRounds: number
  /** 第几轮之后只看新增 diff（文章：前几轮过后）。 */
  diffOnlyAfterRound: number
  /** 每轮 nit 预算；超出转延后，不阻塞合并。 */
  nitBudgetPerRound: number
  /** 存量问题是否在只读新增阶段延后到夜间扫描。 */
  deferPreexisting: boolean
}

export interface CircuitBreakerConfig {
  windowHours: number
  /** 回滚率阈值（reverts / merges）；null/0 表示只看事故数。 */
  revertRateThreshold: number
  incidentCountThreshold: number
  /** 熔断激活时是否升一档（low→medium、medium→high）。 */
  escalateOneTier: boolean
}

export interface ReviewPolicy {
  version: number
  /** 档位 → 需要的人工审批人数（low 档受信任作者可降为 0）。 */
  tiers: Record<RiskTier, number>
  /** 受信任作者：low 档可走零人工快速通道。 */
  trustedAuthors: string[]
  /** 永远至少 high 的路径（CI、发布、计费、自动更新、鉴权、依赖清单）。 */
  protectedPaths: string[]
  /** 至少 medium 的敏感路径（缓存、更新器、系统提示词、迁移）。 */
  sensitivePaths: string[]
  /** 纯文档/文案路径。 */
  docPaths: string[]
  /** 内部工具路径。 */
  internalPaths: string[]
  convergence: ConvergenceConfig
  circuitBreaker: CircuitBreakerConfig
  /** 超过该行数升一档。 */
  largeDiffLines: number
  /** 超过该行数直接 high。 */
  hugeDiffLines: number
}

export const DEFAULT_POLICY: ReviewPolicy = {
  version: 1,
  tiers: { low: 0, medium: 1, high: 2 },
  trustedAuthors: [],
  protectedPaths: [
    '.github/workflows/**',
    '.github/actions/**',
    '.gitlab-ci.yml',
    'ci/**',
    'scripts/release/**',
    'scripts/deploy/**',
    'packages/**/billing/**',
    'packages/**/auto-update/**',
    'packages/**/autoupdate/**',
    'packages/**/auth/**',
    'package.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'composer.json',
    'requirements.txt',
  ],
  sensitivePaths: [
    'packages/**/cache/**',
    'packages/**/updater/**',
    'packages/**/prompts/**',
    'packages/**/migrations/**',
    'packages/**/db/migrations/**',
  ],
  docPaths: ['docs/**', '*.md', '**/*.md'],
  internalPaths: ['internal/**', 'tools/dev/**', 'scripts/dev/**'],
  convergence: {
    maxRounds: 3,
    diffOnlyAfterRound: 2,
    nitBudgetPerRound: 5,
    deferPreexisting: true,
  },
  circuitBreaker: {
    windowHours: 24,
    revertRateThreshold: 0.02,
    incidentCountThreshold: 2,
    escalateOneTier: true,
  },
  largeDiffLines: 800,
  hugeDiffLines: 2000,
}

export interface RiskAssessment {
  tier: RiskTier
  requiredHumanApprovals: number
  reasons: string[]
  protectedHits: string[]
  sensitiveHits: string[]
  trustedAuthor: boolean
  breakerTightened: boolean
  classifiedAt: number
}

export interface FindingVerification {
  voter: string
  actorKind: ActorKind
  vote: 'confirm' | 'reject'
  at: number
}

export interface ReviewFinding {
  findingId: string
  file: string
  line: number
  body: string
  severity: FindingSeverity
  origin: FindingOrigin
  bugClass?: string
  authorKind: ActorKind
  author?: string
  /** 证据引用（终端输出/截图/命令返回的路径或摘要）；important 必填。 */
  evidence?: string
  round: number
  /** file + bugClass（或归一化正文）的稳定键，用于去重。 */
  dedupeKey: string
  state: FindingState
  /** true=不阻塞合并（存量/超预算/不在本轮 diff）。 */
  deferred: boolean
  deferredReason?: string
  /** 同 key 重复提交次数（不重复入库）。 */
  duplicateCount: number
  verifications: FindingVerification[]
  resolution?: Resolution
  createdAt: number
  answeredAt?: number
  answeredBy?: string
  promotedEvalCaseId?: string
}

export interface ReviewRound {
  round: number
  headCommit?: string
  changedPaths: string[]
  startedAt: number
  endedAt?: number
  /** 本轮是否只允许看新增 diff。 */
  diffOnly: boolean
  findingsAdded: number
  nitCount: number
  passed?: boolean
}

export interface ReviewApproval {
  approvalId: string
  actor?: string
  actorKind: ActorKind
  decision: 'approve' | 'request_changes' | 'comment'
  /** 审批针对的提交；只有与当前 headCommit 相同的 approve 才计数。 */
  commit?: string
  note?: string
  at: number
  invalidatedAt?: number
  invalidatedBy?: 'new_commit' | 'conflict_resolution'
}

export interface ReviewCase {
  caseId: string
  title: string
  taskId?: string
  /** 关联既有 /api/review 评审（不双写评论）。 */
  reviewId?: string
  author?: string
  authorKind: ActorKind
  baseCommit?: string
  headCommit?: string
  changedPaths: string[]
  diffLines: number
  behindFlag: boolean
  risk: RiskAssessment
  rounds: ReviewRound[]
  findings: ReviewFinding[]
  approvals: ReviewApproval[]
  checks: CheckState
  state: CaseState
  createdAt: number
  updatedAt: number
}

export interface MergeReadiness {
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

export interface ReviewSignal {
  signalId: string
  kind: SignalKind
  at: number
  caseId?: string
  note?: string
}

export interface BreakerState {
  active: boolean
  windowHours: number
  from: number
  to: number
  reverts: number
  merges: number
  incidents: number
  revertRate: number | null
  reasons: string[]
  evaluatedAt: number
}

export interface ReviewMetrics {
  cases: number
  active: number
  merged: number
  firstRoundPassRate: number | null
  meanRounds: number | null
  p95Rounds: number | null
  fivePlusShare: number | null
  humanApprovalsMedian: number | null
  noiseRate: number | null
  preexistingShare: number | null
  deferredBacklog: number
  openImportant: number
  evalCases: number
  breaker: BreakerState
}

export interface ReviewEvalCase {
  evalCaseId: string
  caseId: string
  findingId?: string
  source: 'incident' | 'revert' | 'manual'
  title: string
  expected: string
  file?: string
  line?: number
  createdAt: number
  createdBy?: string
}
