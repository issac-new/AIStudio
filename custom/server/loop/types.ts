// overlay/custom/server/loop/types.ts
// Loop 共享类型的唯一事实源（client/server 同源）。
//
// 为什么事实源放在 server 侧：server 代码经 inject 符号链接
// （packages/server/src/custom → overlay/custom/server）被上游 tsc 编译，
// TypeScript 6 起 moduleResolution 默认 Bundler——按符号链接路径解析相对 import、
// 不再对包含文件取 realpath，于是"server 再跨根 re-export client 类型"的旧写法
// （../../client/loop/types）在链接视角下指向 packages/server/src/client/… 而断裂。
// 把定义本体放在 custom/server 子树内，链接视角与现实视角（overlay/custom/server）
// 的相对解析结果一致，两种上下文都能解析；client 侧反向 re-export（见
// custom/client/loop/types.ts）由 vite/vitest 按物理真实路径解析，不受影响。

// 模板 meta 形状单一事实源在 graph-spec（type-only import，运行时零依赖）
import type { GraphSpecMeta } from './graph/graph-spec'

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

/** 模板实例化溯源（T5 模板语义随实例化，2026-09-11）：创建 loop 时经 body.template
 *  指定 GraphSpec 的 specId，其 meta 随 loop 持久化，编译时透传回编译产物 spec.meta
 *  ——修复"模板卡所见与实例化后所得分叉"。字段消费情况：
 *  - goal：创建时缺省并入 loop.goal（createLoop 控制器）
 *  - gateCommands：装配层并入编译 deps（graph-assembly compile 闭包 → gate 节点白名单）
 *  - permissionLevel / sensitivePaths / worktreePolicy：服务端暂无执行面消费点，
 *    持久化于此并经编译产物 spec.meta 投影给前端（存而未消费，诚实记账）。
 *  注：SaaSStore 列式落表不持久化本字段（与 tenant/maxAttempts 同现状，见其 INSERT）。 */
export interface LoopTemplateRef {
  specId: string
  meta: GraphSpecMeta
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
  /** 租户标识（可选，P2 Task 4 随修 2）：创建请求显式携带（POST /api/loop/loops 的
   *  body.tenant）。六段格式 `<群聊名称>:<话题摘要>:<user_id>:<room_id>:<session_id>:matrix`
   *  ——persistence 的 KanbanPersistenceAdapter 据此解析目标 kanban board（缺省/旧格式
   *  解析不出 → persist 跳过并告警）。 */
  tenant?: string | null
  /** 契约模板重试上限（可选，P3 台账 guard/maxAttempts 对齐）：图编译器据此取
   *  repair 回边 guard.maxIterations = max(该值, 3)，消除"契约配 ≥5 时回边先耗尽"边界。
   *  缺省时编译器回退 3 并 warn 一次。 */
  maxAttempts?: number
  /** 模板实例化溯源（可选，T5）：body.template（specId）携带的模板 meta 持久化，
   *  编译产物透传（见 LoopTemplateRef 注释） */
  template?: LoopTemplateRef
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

/** judge 结果项状态（P2 台账③前置，为 P3 真实 LLM judge 预留）。
 *  旧持久化数据无 status 字段 → 读取方按 'skipped' 兜底（见 isJudgeFailed）。 */
export type JudgeStatus = 'passed' | 'failed' | 'pending' | 'skipped'

/** judge 依赖的返回联合：真实打分，或暂无法裁决（如模型不可用）时显式 pending。
 *  pending 由 verifier 记录为 status='pending'，语义与无 judge 相同（不阻断 overall）。 */
export type JudgeVerdict = { score: number; reasoning: string } | { status: 'pending'; reason: string }

/** 读取兼容判定：新记录只认 status==='failed'；旧记录（无 status）回退 legacy passed 布尔。
 *  pending / skipped 不算失败——pending 项跳过，overall 由其余项决定。 */
export function isJudgeFailed(judge: { status?: JudgeStatus; passed?: boolean } | null | undefined): boolean {
  if (!judge) return false
  if (judge.status !== undefined) return judge.status === 'failed'
  return judge.passed === false
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
  /** P3 Task 7 显式关联：persistence 成功落库的 kanban 任务 id（runPersistence 写入；
   *  追溯矩阵与任务详情反查的台账锚点，替代按 title 正则反查。旧契约无此字段） */
  persistedTaskId?: string | null
}

export interface VerificationRecord {
  contractId: string
  results: {
    programmatic: Array<{ command: string; exitCode: number; stdout: string; passed: boolean }>
    /** P2 台账③前置：judge 项扩展 status（passed/failed/pending/skipped）。
     *  score/reasoning/passed 为 legacy 字段——真实打分时继续写出；pending 时只有 reason。
     *  旧数据无 status，读取方按 'skipped' 兜底（isJudgeFailed）。 */
    judge: {
      model: string
      status?: JudgeStatus
      score?: number
      reasoning?: string
      passed?: boolean
      reason?: string
    } | null
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
  | { type: 'loop.persisted'; loopId: string; contractId: string; artifact: string;
      /** P3 Task 7 显式关联：产物 kanban 任务 id（KanbanPersistenceAdapter createTask 返回 id
       *  透传；旧数据/legacy 引擎无此字段，读取方按缺失处理，不回退标题正则） */
      taskId?: string;
      /** 产出本事件的图 run id（runId 即 threadId，graph-service 不变量）；legacy 引擎无 */
      runId?: string; ts: string }
  | { type: 'loop.persist-failed'; loopId: string; contractId: string; error: string; ts: string }
  | { type: 'loop.tick-complete'; loopId: string; iteration: number; stats: LoopStats; ts: string }
  | { type: 'loop.budget-warning'; loopId: string; spent: number; limit: number; ts: string }
  | { type: 'loop.stuck'; loopId: string; reason: string; ts: string }
  | { type: 'loop.escalated'; loopId: string; runId?: string; interruptId?: string; nodeId?: string; reason: string; ts: string }
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
