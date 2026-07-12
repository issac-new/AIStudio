// overlay/custom/client/loop/types.ts

export type LoopStage = 'discovery' | 'handoff' | 'validation' | 'persistence' | 'scheduling'
export type LoopStatus = 'idle' | 'running' | 'paused' | 'blocked' | 'awaiting-review' | 'completed' | 'failed'
export type AutonomyLevel = 'L1' | 'L2' | 'L3'
export type LoopPattern =
  | 'daily-triage' | 'pr-babysitter' | 'ci-sweeper' | 'dep-sweeper'
  | 'changelog-drafter' | 'post-merge-cleanup' | 'issue-triage'
export type ContractStatus = 'queued' | 'in-progress' | 'submitted' | 'verifying'
  | 'passed' | 'failed' | 'escalated' | 'archived'

export interface LoopStats {
  totalIterations: number
  tasksDiscovered: number
  tasksCompleted: number
  tasksBlocked: number
  totalCost: number
  currentIteration: number
}

export interface BudgetConfig {
  maxCostPerTick: number
  maxCostTotal: number
  killMode: 'throw' | 'notify' | 'kill'
  warningThreshold: number
}

export interface ScheduleConfig {
  mode: 'cron' | 'webhook' | 'manual'
  cron?: string
  webhookEvents?: WebhookEvent[]
  timezone: string
}

export interface WebhookEvent {
  source: string
  eventType: string
  filter?: string
}

export interface LoopInstance {
  id: string
  name: string
  goal: string
  stopCondition: string
  pattern: LoopPattern
  schedule: ScheduleConfig
  stage: LoopStage
  status: LoopStatus
  autonomyLevel: AutonomyLevel
  stateAdapter: 'local' | 'matrix' | 'saas'
  createdAt: string
  updatedAt: string
  lastTickAt: string | null
  nextTickAt: string | null
  budget: BudgetConfig
  stats: LoopStats
}

export interface PatternTemplate {
  pattern: LoopPattern
  defaultCron: string
  defaultLevel: AutonomyLevel
  costEstimate: 'low' | 'medium' | 'high' | 'very-high'
  goalTemplate: string
  stopConditionTemplate: string
}

export interface TaskSource {
  type: 'github-issue' | 'github-ci' | 'git-commit' | 'local-test' | 'webhook'
  ref: string
  summary: string
  rawPayload: unknown
}

export interface ReadPlan {
  requiredReads: string[]
  mcpResources?: string[]
  repoMap?: string
}

export interface ProgrammaticCheck {
  command: string
  expectedExitCode: number
  timeout: number
}

export interface JudgeCheck {
  model: string
  rubric: string
  minScore: number
}

export interface HumanCheck {
  gate: 'always' | 'on-fail'
  approvers: string[]
}

export interface VerificationSpec {
  programmatic: ProgrammaticCheck[]
  judge: JudgeCheck | null
  human: HumanCheck | null
}

export interface ResultTemplate {
  artifactType: 'patch' | 'pr' | 'commit' | 'report'
  requiredFiles: string[]
  schema?: unknown
}

export interface TaskContract {
  id: string
  loopId: string
  source: TaskSource
  readPlan: ReadPlan
  writeBoundary: string[]
  verificationIntent: VerificationSpec
  resultTemplate: ResultTemplate
  worktreeId: string | null
  assignee: 'maker' | 'checker'
  status: ContractStatus
  attempts: number
  maxAttempts: number
}

export interface VerificationRecord {
  contractId: string
  results: {
    programmatic: Array<{ command: string; exitCode: number; stdout: string; passed: boolean }>
    judge: { model: string; score: number; reasoning: string; passed: boolean } | null
    human: { approver: string; decision: 'approved' | 'rejected' | 'changes-requested'; comment: string; timestamp: string } | null
  }
  overall: 'passed' | 'failed' | 'pending'
  finalResponseGuard: boolean
}

export type LoopEvent =
  | { type: 'loop.created'; loop: LoopInstance; ts: string }
  | { type: 'loop.stage-transition'; loopId: string; from: LoopStage; to: LoopStage; reason: string; ts: string }
  | { type: 'loop.task-discovered'; loopId: string; contract: TaskContract; ts: string }
  | { type: 'loop.task-handed-off'; loopId: string; contractId: string; worktreeId: string; ts: string }
  | { type: 'loop.verification-progress'; contractId: string; record: Partial<VerificationRecord>; ts: string }
  | { type: 'loop.verification-complete'; contractId: string; passed: boolean; ts: string }
  | { type: 'loop.persisted'; loopId: string; contractId: string; artifact: string; ts: string }
  | { type: 'loop.tick-complete'; loopId: string; iteration: number; stats: LoopStats; ts: string }
  | { type: 'loop.budget-warning'; loopId: string; spent: number; limit: number; ts: string }
  | { type: 'loop.stuck'; loopId: string; reason: string; ts: string }
  | { type: 'loop.completed'; loopId: string; finalStats: LoopStats; ts: string }

export interface DriftReport {
  hasDrift: boolean
  details: string
}

export interface LoopFilter {
  status?: LoopStatus[]
  stage?: LoopStage[]
}

export interface ContractFilter {
  status?: ContractStatus[]
}

export const PATTERN_TEMPLATES: Record<LoopPattern, PatternTemplate> = {
  'daily-triage': {
    pattern: 'daily-triage', defaultCron: '0 9 * * *', defaultLevel: 'L1', costEstimate: 'low',
    goalTemplate: 'Scan issues and CI failures, report actionable items',
    stopConditionTemplate: 'All issues triaged and no CI failures',
  },
  'pr-babysitter': {
    pattern: 'pr-babysitter', defaultCron: '*/15 * * * *', defaultLevel: 'L1', costEstimate: 'high',
    goalTemplate: 'Monitor open PRs for CI status',
    stopConditionTemplate: 'All tracked PRs are merged or closed',
  },
  'ci-sweeper': {
    pattern: 'ci-sweeper', defaultCron: '*/10 * * * *', defaultLevel: 'L2', costEstimate: 'very-high',
    goalTemplate: 'Automatically fix CI failures',
    stopConditionTemplate: 'CI is green for all branches',
  },
  'dep-sweeper': {
    pattern: 'dep-sweeper', defaultCron: '0 */6 * * *', defaultLevel: 'L2', costEstimate: 'medium',
    goalTemplate: 'Scan and update dependencies',
    stopConditionTemplate: 'All dependencies are up to date',
  },
  'changelog-drafter': {
    pattern: 'changelog-drafter', defaultCron: '0 0 * * 1', defaultLevel: 'L1', costEstimate: 'low',
    goalTemplate: 'Draft changelog from recent commits',
    stopConditionTemplate: 'Changelog covers all commits since last release',
  },
  'post-merge-cleanup': {
    pattern: 'post-merge-cleanup', defaultCron: '0 18 * * *', defaultLevel: 'L1', costEstimate: 'low',
    goalTemplate: 'Clean up after merges (branches, worktrees, stale refs)',
    stopConditionTemplate: 'No stale branches or orphaned worktrees',
  },
  'issue-triage': {
    pattern: 'issue-triage', defaultCron: '0 */2 * * *', defaultLevel: 'L1', costEstimate: 'low',
    goalTemplate: 'Classify and label new issues',
    stopConditionTemplate: 'All issues have labels and assignees',
  },
}
