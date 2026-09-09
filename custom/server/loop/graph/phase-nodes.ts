// overlay/custom/server/loop/graph/phase-nodes.ts
// P1 Task 3 — 五阶段节点工厂：把 Loop 引擎的真实阶段函数绑定为 graph 节点
// discovery / handoff / validation / persistence + gate(R3) + stop-check + human 审批
//
// 设计约束（plan Task 3 + spec §7B.7 P1 微调，2026-09-10）：
// - dryRun=true 时对外副作用（worktree 创建/dispatch/kanban 写/store 台账写）只记日志不执行
//   （shadow 双跑护栏）；channel 状态仍推进，保证 shadow run 走完全流程
// - loop.* 兼容事件经 ctx.deps.emitEvent 桥接转发（装配层按 type 前缀分流到 loop 通道，前端无感）
// - gate 守卫三分法（Jira workflow）：validator=数据校验，失败停在 gate（第几条命令、exitCode、
//   stderr 摘要写进 repairQueue），post 副作用链不执行；post=成功路径上按声明顺序执行的副作用链，
//   单条失败仅 warn 不阻断主流程
// - 审批断链修复：validation 遇 verifier overall==='pending' 时返回 NodeResult.interrupt 且
//   自路由（goto 回本节点）——runtime interrupt 暂停时保存的 nextNodes 即本节点，resume 写入
//   __resume:<interruptId> 通道后节点重入消费裁决；无 goto 自路由则 resume 直达下游节点，裁决无人消费
// - human 节点审批 config 三元组（JSM 建模）：approvers（审批人来源）/policy（通过策略）/onReject（拒绝去向）

import { execFile } from 'child_process'
import { promisify } from 'util'
import type { NodeDef, NodeContext, StateValues, StateUpdate } from './types'
import type { PredicateExpr } from './predicate'
import { evaluatePredicate } from './predicate'
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent, LoopStage, ContractStatus,
} from '../types'
import type { LoopStateStore } from '../store/state-store'
import type { WorktreeManager } from '../engine/worktree-manager'
import type { SubagentDispatcher } from '../engine/subagent-dispatcher'
import type { Verifier } from '../engine/verifier'
import { BudgetGuard } from '../engine/budget-guard'

const execFileAsync = promisify(execFile)

/** I7 成本断链闭合：阶段节点完成即按 BudgetGuard.estimateTickCost 的档位计费
 *  （档位表单一事实源在 budget-guard，不在此复制）。runtime 的 recordCost 包装
 *  负责 run 维度累计（instance.totalCost）并把 cost.recorded 事件写进事件日志。
 *  dryRun（shadow 双跑）同样计费——成本序列同属双跑观测面，且不产生对外副作用。 */
const costEstimator = new BudgetGuard(() => {})

function recordPhaseCost(loop: LoopInstance, ctx: NodeContext): void {
  ctx.deps.recordCost?.(costEstimator.estimateTickCost(loop))
}

/** 编译器与节点共用的 channel 键约定。
 *  reducer 约定：contracts（appendContractsById）/ verifications / gateResults / repairQueue /
 *  approvalResult = append；stage / stopMet / repairNeeded / phaseProgress = overwrite
 *  （phaseProgress 由节点整表维护，handoff 重新交接时清除对应契约的标记）。 */
export const CH = {
  contracts: 'contracts',
  verifications: 'verifications',
  stage: 'stage',
  stopMet: 'stopMet',
  gateResults: 'gateResults',
  repairQueue: 'repairQueue',
  /** 布尔路由信号：PredicateExpr 无法表达数组非空，repair 回边条件以此路由 */
  repairNeeded: 'repairNeeded',
  /** 审批裁决流水（human 节点与 validation 人工门禁共用，append） */
  approvalResult: 'approvalResult',
  /** 节点内部簿记（overwrite）：验证轮次 / 已持久化标记——repair 循环重入的幂等去重 */
  phaseProgress: 'phaseProgress',
} as const

// ---------------------------------------------------------------------------
// 依赖接口
// ---------------------------------------------------------------------------

/** 连接器最小接口（github/local-git/webhook 三实现的结构公共超集） */
export interface Connector {
  discover(loop: LoopInstance): Promise<TaskContract[]>
}

/** 持久化适配器：产物落 kanban/commit/PR（断链 2 的真实副作用出口） */
export interface PersistenceAdapter {
  persist(
    contract: TaskContract,
    verification: VerificationRecord,
    loop: LoopInstance,
    dryRun: boolean,
  ): Promise<string>
}

export interface PhaseNodeDeps {
  store: LoopStateStore
  connectors: Connector[]
  worktreeManager: WorktreeManager
  dispatcher: SubagentDispatcher
  verifier: Verifier
  persistence: PersistenceAdapter
  dryRun: boolean
  log?: (msg: string) => void
  /** R2：派发前向 worktree 注入 GRAPH-CONTEXT.md（装配层绑定 workspace-context.ts；
   *  失败不阻断派发——上下文是增强不是依赖） */
  injectWorkspaceContext?: (contract: TaskContract, worktreeId: string) => Promise<void>
  /** validation 人工门禁的审批三元组缺省：approvers 取自 contract.verificationIntent.human.approvers，
   *  此处只配 policy / onReject（缺省 all / { goto: 'handoff' }，即守卫回边） */
  approvals?: { policy?: ApprovalPolicy; onReject?: OnReject }
}

// ---------------------------------------------------------------------------
// 审批三元组（spec §7B.7：审批人来源 / 通过策略 / 拒绝去向）
// ---------------------------------------------------------------------------

export type ApproverSource = string[] | { from: 'channel' | 'assignee'; name?: string }
export type ApprovalPolicy = 'all' | 'majority' | 'any' | 'specified'
export type OnReject = { goto: string } | 'fail'

export interface ApprovalsConfig {
  approvers: ApproverSource
  policy: ApprovalPolicy
  onReject: OnReject
}

export interface ApprovalDecision {
  approver: string
  decision: 'approved' | 'rejected'
  comment?: string
}

export interface ApprovalOutcome {
  approved: boolean
  decisions: ApprovalDecision[]
  decidedBy: string[]
}

/** approvalResult 通道条目（append） */
export interface ApprovalDecisionRecord {
  nodeId: string
  contractId?: string
  approved: boolean
  decidedBy: string[]
  decisions: ApprovalDecision[]
  policy: ApprovalPolicy
  approvers?: string[]
  ts: string
}

/** resume 值归一化为裁决列表。接受：boolean / 'approved' 等字符串 / { approved } /
 *  { decision, approver?, comment? } / { decisions: [...] } / 数组。'changes-requested' 按拒绝计。 */
export function normalizeDecisions(value: unknown): ApprovalDecision[] {
  if (value == null) return []
  if (typeof value === 'boolean') {
    return [{ approver: 'resume', decision: value ? 'approved' : 'rejected' }]
  }
  if (typeof value === 'string') {
    return [{ approver: 'resume', decision: value === 'approved' ? 'approved' : 'rejected' }]
  }
  if (Array.isArray(value)) return value.flatMap(normalizeDecisions)
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    if (Array.isArray(o.decisions)) return (o.decisions as unknown[]).flatMap(normalizeDecisions)
    if (typeof o.approved === 'boolean') {
      return [{
        approver: o.approver != null ? String(o.approver) : 'resume',
        decision: o.approved ? 'approved' : 'rejected',
      }]
    }
    if (typeof o.decision === 'string') {
      return [{
        approver: o.approver != null ? String(o.approver) : 'resume',
        decision: o.decision === 'approved' ? 'approved' : 'rejected',
        comment: typeof o.comment === 'string' ? o.comment : undefined,
      }]
    }
  }
  return []
}

/** 审批人来源解析：名单 / 状态通道 / 契约 assignee */
export function resolveApprovers(source: ApproverSource, state: StateValues): string[] {
  if (Array.isArray(source)) return source
  if (source.from === 'channel') {
    const v = state[source.name ?? 'approvers']
    return Array.isArray(v) ? v.map(String) : []
  }
  const assignee = state['assignee']
  return assignee != null ? [String(assignee)] : ['assignee']
}

/** 通过策略判定（JSM 语义）：all=全体同意、majority=过半、any=任一、specified=指定 approvers 全体。
 *  specified 的 approvers 为动态来源（channel/assignee）时退化为 all 语义。 */
export function evaluateApprovalPolicy(
  cfg: { approvers: ApproverSource; policy: ApprovalPolicy },
  resumeValue: unknown,
): ApprovalOutcome {
  const decisions = normalizeDecisions(resumeValue)
  if (decisions.length === 0) return { approved: false, decisions, decidedBy: [] }
  const approvedCount = decisions.filter(d => d.decision === 'approved').length
  let approved: boolean
  switch (cfg.policy) {
    case 'any': approved = approvedCount >= 1; break
    case 'majority': approved = approvedCount * 2 > decisions.length; break
    case 'specified': {
      if (Array.isArray(cfg.approvers)) {
        approved = cfg.approvers.every(name =>
          decisions.some(d => d.approver === name && d.decision === 'approved'))
      } else {
        approved = approvedCount === decisions.length
      }
      break
    }
    case 'all':
    default: approved = approvedCount === decisions.length; break
  }
  return {
    approved,
    decisions,
    decidedBy: decisions.filter(d => d.decision === 'approved').map(d => d.approver),
  }
}

// ---------------------------------------------------------------------------
// interrupt / resume 握手约定
// ---------------------------------------------------------------------------

/** validation 人工门禁 interrupt id：契约 id + attempts 后缀——repair 循环重开审批时，
 *  上一轮残留的 __resume 通道不会被判作新裁决 */
export function approvalInterruptId(contractId: string, attempts: number): string {
  return `approval:${contractId}@${attempts}`
}

/** runtime resumeFromCheckpoint 把 resume 值写入 `__resume:<interruptId>` 通道 */
export function resumeChannel(interruptId: string): string {
  return `__resume:${interruptId}`
}

// ---------------------------------------------------------------------------
// 节点簿记与 repair 条目
// ---------------------------------------------------------------------------

export type PhaseProgressEntry =
  | { kind: 'verified'; contractId: string; attempts: number; ts: string }
  | { kind: 'persisted'; contractId: string; ts: string }

export interface RepairEntry {
  source: 'validation' | 'gate'
  contractId?: string
  name?: string
  message: string
  ts: string
}

function progressOf(state: StateValues): PhaseProgressEntry[] {
  const v = state[CH.phaseProgress]
  return Array.isArray(v) ? [...v as PhaseProgressEntry[]] : []
}

const now = () => new Date().toISOString()

/** loop.* 事件经 GraphDeps.emitEvent 桥接：装配层实现按 type 前缀 'loop.' 分流 */
function emitLoopEvent(ctx: NodeContext, event: LoopEvent): void {
  void ctx.deps.emitEvent(event as unknown as Parameters<NodeContext['deps']['emitEvent']>[0])
}

async function transition(
  loop: LoopInstance, deps: PhaseNodeDeps, ctx: NodeContext,
  from: LoopStage, to: LoopStage, reason: string,
): Promise<void> {
  emitLoopEvent(ctx, { type: 'loop.stage-transition', loopId: loop.id, from, to, reason, ts: now() })
  if (!deps.dryRun) await deps.store.updateLoop(loop.id, { stage: to })
}

/** contracts 通道的 dedup-by-id append reducer（同一契约多轮更新只留最新） */
export function appendContractsById(old: TaskContract[] | undefined, next: TaskContract[]): TaskContract[] {
  const merged = new Map((old ?? []).map(c => [c.id, c]))
  for (const c of next) merged.set(c.id, c)
  return [...merged.values()]
}

/** 旧引擎 determineFailType 语义对齐 */
function failTypeOf(record: VerificationRecord): string {
  if (record.results.programmatic.some(p => !p.passed)) return 'programmatic'
  if (record.results.judge && !record.results.judge.passed) return 'judge'
  if (record.results.human && record.results.human.decision !== 'approved') return 'human'
  return 'unknown'
}

function approvalTriple(deps: PhaseNodeDeps, contract: TaskContract): ApprovalsConfig {
  return {
    approvers: contract.verificationIntent.human?.approvers ?? ['assignee'],
    policy: deps.approvals?.policy ?? 'all',
    onReject: deps.approvals?.onReject ?? { goto: 'handoff' },
  }
}

// ---------------------------------------------------------------------------
// 五阶段节点工厂
// ---------------------------------------------------------------------------

/**
 * 五阶段节点工厂。execute 读 channel 状态、调真实模块、返回 update（含 contracts /
 * verifications / stage 等 channel 键）。
 */
export function createPhaseNode(
  phase: 'discovery' | 'handoff' | 'validation' | 'persistence',
  loop: LoopInstance,
  deps: PhaseNodeDeps,
): NodeDef {
  const to: LoopStage = phase
  const from: LoopStage = phase === 'discovery' ? loop.stage : (
    { handoff: 'discovery', validation: 'handoff', persistence: 'validation' } as const
  )[phase as 'handoff' | 'validation' | 'persistence']

  const execute = async (state: StateValues, ctx: NodeContext) => {
    await transition(loop, deps, ctx, from, to, `${phase} node start`)

    // 阶段工作完成即计费（含 validation 的审批 interrupt 早退——程序化验证已真实执行）
    const result = phase === 'discovery'
      ? await runDiscovery(loop, deps, ctx)
      : phase === 'handoff'
        ? await runHandoff(loop, deps, ctx, state)
        : phase === 'validation'
          ? await runValidation(loop, deps, ctx, state)
          : await runPersistence(loop, deps, ctx, state)
    recordPhaseCost(loop, ctx)
    return result
  }

  return {
    id: phase,
    type: 'function',
    label: `${loop.name}:${phase}`,
    execute,
  }
}

// ---------------------------------------------------------------------------
// discovery
// ---------------------------------------------------------------------------

async function runDiscovery(
  loop: LoopInstance, deps: PhaseNodeDeps, ctx: NodeContext,
) {
  const contracts: TaskContract[] = []
  for (const connector of deps.connectors) {
    contracts.push(...await connector.discover(loop))
  }
  for (const c of contracts) {
    if (!deps.dryRun) await deps.store.appendContract(c)
    emitLoopEvent(ctx, { type: 'loop.task-discovered', loopId: loop.id, contract: c, ts: now() })
  }
  return {
    update: contracts.length === 0
      ? { [CH.contracts]: [], [CH.stage]: 'scheduling' as LoopStage }
      // stage 是 discovery 出边的路由信号：有契约 → handoff，无契约 → scheduling 短路
      : { [CH.contracts]: contracts, [CH.stage]: 'handoff' as LoopStage },
  }
}

// ---------------------------------------------------------------------------
// handoff
// ---------------------------------------------------------------------------

async function runHandoff(
  loop: LoopInstance, deps: PhaseNodeDeps, ctx: NodeContext, state: StateValues,
) {
  const contracts = (state[CH.contracts] as TaskContract[] | undefined) ?? []
  const progress = progressOf(state)
  const updated: TaskContract[] = []
  const log = deps.log ?? (() => {})
  const handedOff = new Set<string>()

  for (const c of contracts) {
    if (c.status !== 'queued') continue // 只交接排队中的契约；修复回流的由 validation 重新置队
    handedOff.add(c.id)
    if (deps.dryRun) {
      // 双跑护栏：不建 worktree、不派发 agent、不写 store；通道内以 dryrun: 前缀标记推进流程
      const worktreeId = `dryrun:${c.id}`
      log(`[dry-run] handoff side effects skipped (worktree+dispatch) for ${c.id}`)
      emitLoopEvent(ctx, {
        type: 'loop.task-handed-off', loopId: loop.id,
        contractId: c.id, worktreeId, ts: now(),
      })
      updated.push({ ...c, status: 'in-progress', worktreeId })
      continue
    }
    const worktreeId = await deps.worktreeManager.create(c)
    const withWorktree = { ...c, worktreeId, status: 'in-progress' as const }
    if (deps.injectWorkspaceContext) {
      try {
        await deps.injectWorkspaceContext(c, worktreeId)
      } catch (err) {
        log(`workspace context injection failed for ${c.id} (non-blocking): ${err instanceof Error ? err.message : err}`)
      }
    }
    await deps.dispatcher.dispatch(withWorktree, 'maker')
    await deps.store.updateContract(c.id, { status: 'in-progress', worktreeId })
    emitLoopEvent(ctx, {
      type: 'loop.task-handed-off', loopId: loop.id,
      contractId: c.id, worktreeId, ts: now(),
    })
    updated.push(withWorktree)
  }

  // 修复环：重新交接的契约清除轮次/持久化标记 → validation 重新验证、persistence 允许重新落库
  const cleared = progress.filter(e => !handedOff.has(e.contractId))
  const update: StateUpdate = { [CH.contracts]: updated, [CH.stage]: 'handoff' as LoopStage }
  if (cleared.length !== progress.length) update[CH.phaseProgress] = cleared
  return { update }
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

const VERIFY_TARGET_STATUSES: ContractStatus[] = ['in-progress', 'submitted', 'verifying']

async function runValidation(
  loop: LoopInstance, deps: PhaseNodeDeps, ctx: NodeContext, state: StateValues,
) {
  const contracts = (state[CH.contracts] as TaskContract[] | undefined) ?? []
  const progress = progressOf(state)
  const records: VerificationRecord[] = []
  const updated: TaskContract[] = []
  const repairQueue: RepairEntry[] = []
  const approvalRecords: ApprovalDecisionRecord[] = []
  let escalatedCount = 0

  const buildUpdate = (): StateUpdate => {
    const update: StateUpdate = {
      [CH.verifications]: records,
      [CH.contracts]: updated,
      [CH.repairQueue]: repairQueue,
      [CH.repairNeeded]: repairQueue.length > 0,
      [CH.phaseProgress]: progress,
      [CH.stage]: 'validation' as LoopStage,
    }
    if (approvalRecords.length > 0) update[CH.approvalResult] = approvalRecords
    return update
  }

  for (const c of contracts.filter(c => VERIFY_TARGET_STATUSES.includes(c.status))) {
    let record: VerificationRecord
    let resumed: { outcome: ApprovalOutcome; triple: ApprovalsConfig } | null = null

    // resume 消费：本契约的人工裁决已写入 __resume 通道（interrupt goto 自路由回本节点后重入）。
    // interrupt id 带 attempts 后缀：repair 循环重开审批时，上一轮残留通道不会被判作新裁决。
    const resumeValue = state[resumeChannel(approvalInterruptId(c.id, c.attempts))]
    if (resumeValue !== undefined) {
      const triple = approvalTriple(deps, c)
      const outcome = evaluateApprovalPolicy(triple, resumeValue)
      resumed = { outcome, triple }
      approvalRecords.push({
        nodeId: 'validation', contractId: c.id, approved: outcome.approved,
        decidedBy: outcome.decidedBy, decisions: outcome.decisions,
        policy: triple.policy, approvers: resolveApprovers(triple.approvers, state), ts: now(),
      })
      // 裁决合成：剥离 human gate 重验程序化/judge 项——审批期间状态可能已变化，失败仍走 repair
      const stripped = { ...c, verificationIntent: { ...c.verificationIntent, human: null } }
      const base = await deps.verifier.verify(stripped, loop)
      record = {
        ...base,
        overall: outcome.approved && base.overall === 'passed' ? 'passed' : 'failed',
        results: {
          ...base.results,
          human: {
            approver: outcome.decisions[0]?.approver ?? 'resume',
            decision: outcome.approved ? 'approved' : 'rejected',
            comment: outcome.decisions.find(d => d.comment)?.comment ?? '',
            timestamp: now(),
          },
        },
      }
      progress.push({ kind: 'verified', contractId: c.id, attempts: c.attempts, ts: now() })
    } else {
      // 本轮已验证（resume 重入 / 同 run 重复激活）→ 跳过，不重跑 verifier
      if (progress.some(e => e.kind === 'verified' && e.contractId === c.id && e.attempts >= c.attempts)) continue
      record = await deps.verifier.verify(c, loop)
      if (record.overall === 'pending') {
        // 审批断链修复：pending 人工审批 → graph interrupt，run 进 awaiting-input。
        // goto 指回 validation：resume 从 nextNodes 续跑（被打断节点不自动重跑），
        // __resume:<interruptId> 注入 state 后由本节点按三元组 policy 判定（见上方 resumed 分支）
        const triple = approvalTriple(deps, c)
        const interruptId = approvalInterruptId(c.id, c.attempts)
        return {
          update: {
            [CH.verifications]: records,
            [CH.contracts]: updated,
            [CH.phaseProgress]: progress,
            [CH.stage]: 'validation' as LoopStage,
          },
          interrupt: {
            id: interruptId,
            value: {
              kind: 'approval',
              contractId: c.id,
              loopId: loop.id,
              prompt: `Approval required for contract ${c.id} (${c.source.summary}) in loop ${loop.id}: ${loop.goal}`,
              contractSummary: {
                id: c.id, source: c.source.type, ref: c.source.ref, summary: c.source.summary,
                artifactType: c.resultTemplate.artifactType, attempts: c.attempts,
              },
              policy: triple,
            },
          },
          goto: ['validation'],
        }
      }
      progress.push({ kind: 'verified', contractId: c.id, attempts: c.attempts, ts: now() })
    }

    if (!deps.dryRun) await deps.store.appendVerification(record)
    emitLoopEvent(ctx, {
      type: 'loop.verification-complete', contractId: c.id,
      passed: record.overall === 'passed', ts: now(),
    })
    records.push(record)

    if (record.overall === 'failed') {
      // repair 路由（对齐旧引擎 routeRepair）：attempts+1，封顶则升级不再回边；
      // 回边由编译器的 repairNeeded 条件边承担，节点不自行 goto
      const attempts = c.attempts + 1
      const escalated = attempts >= c.maxAttempts
      if (!deps.dryRun) {
        await deps.store.updateContract(c.id, {
          attempts, status: escalated ? 'escalated' : 'queued',
        })
      }
      if (escalated) escalatedCount++
      else repairQueue.push({ source: 'validation', contractId: c.id, message: failTypeOf(record), ts: now() })
      updated.push({ ...c, attempts, status: escalated ? 'escalated' as const : 'queued' as const })

      // 人工裁决被拒：按审批三元组 onReject 路由（§7B.7）
      if (resumed) {
        if (resumed.triple.onReject === 'fail') {
          // 台账（验证记录/事件/契约状态）已落库，再判 run failed——失败消息说清契约与策略
          throw new Error(
            `Approval rejected for contract ${c.id} (policy ${resumed.triple.policy}, onReject=fail): ${failTypeOf(record)}`,
          )
        }
        const target = resumed.triple.onReject.goto
        if (target !== 'handoff') {
          // 非默认去向：显式路由（默认 handoff 交给 repairNeeded 守卫回边）
          return { update: buildUpdate(), goto: [target] }
        }
      }
    } else {
      updated.push(c)
    }
  }

  if (!deps.dryRun && escalatedCount > 0) {
    await deps.store.updateLoop(loop.id, {
      stats: { ...loop.stats, tasksBlocked: loop.stats.tasksBlocked + escalatedCount },
    })
  }
  return { update: buildUpdate() }
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

async function runPersistence(
  loop: LoopInstance, deps: PhaseNodeDeps, ctx: NodeContext, state: StateValues,
) {
  const contracts = (state[CH.contracts] as TaskContract[] | undefined) ?? []
  const verifications = (state[CH.verifications] as VerificationRecord[] | undefined) ?? []
  const progress = progressOf(state)
  const log = deps.log ?? (() => {})
  let completed = 0

  for (const v of verifications) {
    if (v.overall !== 'passed') continue
    if (progress.some(e => e.kind === 'persisted' && e.contractId === v.contractId)) continue
    const contract = contracts.find(c => c.id === v.contractId)
    if (!contract) continue
    if (deps.dryRun) {
      // shadow 对齐：discovery/handoff 同样在 dryRun 下发标记事件（dryrun: 前缀），
      // persistence 缺席会破坏双跑序列对比——事件只进 shadow 日志，非真实副作用
      log(`[dry-run] persistence skipped: persist for ${contract.id}`)
      emitLoopEvent(ctx, {
        type: 'loop.persisted', loopId: loop.id,
        contractId: contract.id, artifact: `dryrun:${contract.id}`, ts: now(),
      })
      continue
    }
    const artifact = await deps.persistence.persist(contract, v, loop, deps.dryRun)
    completed++
    progress.push({ kind: 'persisted', contractId: contract.id, ts: now() })
    emitLoopEvent(ctx, {
      type: 'loop.persisted', loopId: loop.id,
      contractId: contract.id, artifact, ts: now(),
    })
  }
  if (!deps.dryRun && completed > 0) {
    await deps.store.updateLoop(loop.id, {
      stats: { ...loop.stats, tasksCompleted: loop.stats.tasksCompleted + completed },
    })
  }
  return {
    update: completed > 0
      ? { [CH.phaseProgress]: progress, [CH.stage]: 'persistence' as LoopStage }
      : { [CH.stage]: 'persistence' as LoopStage },
  }
}

// ---------------------------------------------------------------------------
// gate（R3 质量门禁）—— validator / post-function 两类语义（§7B.7 守卫三分法）
// ---------------------------------------------------------------------------

export interface GateCommand {
  name: string
  /** validator=数据校验，失败停在 gate（post 副作用链不执行）；post=成功路径上的副作用链 */
  kind: 'validator' | 'post'
  cmd: string
  cwd?: string
  timeoutMs?: number
}

export interface GateResult {
  name: string
  kind: 'validator' | 'post'
  passed: boolean
  exitCode: number
  durationMs: number
  stderr: string
  /** 失败原因：卡在第几条命令、差什么（exitCode + stderr 摘要） */
  message?: string
}

/** 可注入的命令执行器（测试 mock 用，不跑真实进程；缺省 execFile 真实执行） */
export type GateExec = (cmd: string, opts: { cwd?: string; timeoutMs?: number }) => Promise<{
  stdout: string
  stderr: string
  exitCode: number
}>

const defaultGateExec: GateExec = async (cmd, opts) => {
  const parts = cmd.split(/\s+/).filter(Boolean)
  try {
    await execFileAsync(parts[0], parts.slice(1), {
      cwd: opts.cwd ?? process.cwd(),
      timeout: opts.timeoutMs ?? 60_000,
      maxBuffer: 1024 * 1024,
    })
    return { stdout: '', stderr: '', exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { code?: number | string; stderr?: string; stdout?: string; message?: string; killed?: boolean }
    return {
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? e.message ?? '').slice(-512),
      exitCode: typeof e.code === 'number' ? e.code : (e.killed ? 124 : 1),
    }
  }
}

/** R3 质量门禁节点：validator 按声明序 fail-fast——失败停在 gate（repairQueue 记录"卡在第几条
 *  命令、exitCode、stderr 摘要"，触发守卫回边回 handoff），post 副作用链不执行；全部通过后
 *  post 按声明序执行副作用链，单条失败仅 warn 不阻断主流程。 */
export function createGateNode(
  loop: LoopInstance,
  deps: { commands: GateCommand[]; exec?: GateExec; log?: (msg: string) => void },
): NodeDef {
  const log = deps.log ?? (() => {})
  const exec = deps.exec ?? defaultGateExec

  const run = async (command: GateCommand, index: number, total: number): Promise<GateResult> => {
    const started = Date.now()
    const r = await exec(command.cmd, { cwd: command.cwd, timeoutMs: command.timeoutMs })
    const passed = r.exitCode === 0
    const stderrTail = r.stderr ? `，stderr: ${r.stderr.slice(-256)}` : ''
    return {
      name: command.name,
      kind: command.kind,
      passed,
      exitCode: r.exitCode,
      durationMs: Date.now() - started,
      stderr: r.stderr.slice(-512),
      message: passed ? undefined : command.kind === 'validator'
        ? `卡在 gate：第 ${index + 1}/${total} 条 validator "${command.name}"（${command.cmd}）失败 — exit code ${r.exitCode}${stderrTail}`
        : `post-function "${command.name}"（${command.cmd}）失败 — exit code ${r.exitCode}${stderrTail}`,
    }
  }

  return {
    id: 'gate',
    type: 'function',
    label: `${loop.name}:gate`,
    execute: async () => {
      const results: GateResult[] = []
      const validators = deps.commands.filter(c => c.kind === 'validator')
      const posts = deps.commands.filter(c => c.kind === 'post')

      // validators：声明序 fail-fast——失败停在 gate，post 副作用链不执行
      for (let i = 0; i < validators.length; i++) {
        const result = await run(validators[i], i, validators.length)
        results.push(result)
        if (!result.passed) {
          const repairQueue: RepairEntry[] = [{
            source: 'gate', name: result.name, message: result.message ?? result.name, ts: now(),
          }]
          return {
            update: {
              [CH.gateResults]: results,
              [CH.repairQueue]: repairQueue,
              [CH.repairNeeded]: true,
            },
          }
        }
      }

      // posts：成功路径上按声明顺序执行；单条失败仅 warn，不阻断主流程
      for (let i = 0; i < posts.length; i++) {
        const result = await run(posts[i], i, posts.length)
        if (!result.passed) {
          log(`gate post-function '${result.name}' failed (exit ${result.exitCode}, non-blocking): ${result.stderr}`)
        }
        results.push(result)
      }
      return { update: { [CH.gateResults]: results, [CH.repairNeeded]: false } }
    },
  }
}

// ---------------------------------------------------------------------------
// stop-check
// ---------------------------------------------------------------------------

/** 默认停止判定：stopCondition 是合法 JSON 谓词则求值，否则回落契约状态启发式 */
export async function defaultEvaluateStop(stopCondition: string, state: StateValues): Promise<boolean> {
  try {
    return evaluatePredicate(JSON.parse(stopCondition) as PredicateExpr, state)
  } catch {
    // 启发式兜底：无待办契约，或全部契约均有 passed 验证记录
    const contracts = (state[CH.contracts] as TaskContract[] | undefined) ?? []
    const verifications = (state[CH.verifications] as VerificationRecord[] | undefined) ?? []
    if (contracts.length === 0) return true
    return contracts.every(c => verifications.some(v => v.contractId === c.id && v.overall === 'passed'))
  }
}

/** stop-check 节点：真实评估 loop.stopCondition，产出 stopMet channel */
export function createStopConditionNode(
  loop: LoopInstance,
  deps: { evaluateStop?: (stopCondition: string, state: StateValues) => Promise<boolean> },
): NodeDef {
  return {
    id: 'stop-check',
    type: 'function',
    label: `${loop.name}:stop-check`,
    execute: async (state: StateValues, ctx: NodeContext) => {
      const evaluate = deps.evaluateStop ?? defaultEvaluateStop
      const stopMet = await evaluate(loop.stopCondition, state)
      // from 取状态通道里的真实当前阶段：discovery 无契约短路直入本节点时
      // stage='scheduling'，正常路径 persistence 节点已把 stage 写为 'persistence'
      const from = (state[CH.stage] as LoopStage | undefined) ?? 'persistence'
      emitLoopEvent(ctx, {
        type: 'loop.stage-transition', loopId: loop.id,
        from, to: 'scheduling', reason: `stop-check: ${stopMet}`, ts: now(),
      })
      // 一个 run = 一个 tick：stop-check 即终点，重入由 RunSpawner 发起新 run
      return { update: { [CH.stopMet]: stopMet }, end: true }
    },
  }
}

// ---------------------------------------------------------------------------
// human 审批节点（§7B.7 config 三元组）
// ---------------------------------------------------------------------------

export interface HumanApprovalNodeDeps {
  id?: string
  prompt?: string
  approvals: ApprovalsConfig
}

/** human/审批节点：execute 先发 interrupt（自路由回本节点）；被 resume 后按 resume 值与
 *  三元组 policy 判定 approve/reject，产出 approvalResult channel；拒绝按 onReject 路由
 *  （守卫回边 goto / 'fail' 判 run failed）。interrupt id 内嵌轮次（approvalResult 流水长度），
 *  同节点多轮审批的 __resume 通道互不串扰。 */
export function createHumanApprovalNode(deps: HumanApprovalNodeDeps): NodeDef {
  const nodeId = deps.id ?? 'approval'
  const roundOf = (state: StateValues): number => {
    const history = state[CH.approvalResult] as Array<{ nodeId?: string }> | undefined
    return (Array.isArray(history) ? history : []).filter(e => e?.nodeId === nodeId).length
  }
  return {
    id: nodeId,
    type: 'human',
    label: nodeId,
    timeout: 86_400_000,
    execute: async (state: StateValues) => {
      const interruptId = `approval:${nodeId}@${roundOf(state)}`
      const resumeValue = state[resumeChannel(interruptId)]
      if (resumeValue !== undefined) {
        const outcome = evaluateApprovalPolicy(deps.approvals, resumeValue)
        const entry: ApprovalDecisionRecord = {
          nodeId,
          approved: outcome.approved,
          decidedBy: outcome.decidedBy,
          decisions: outcome.decisions,
          policy: deps.approvals.policy,
          approvers: resolveApprovers(deps.approvals.approvers, state),
          ts: now(),
        }
        const update: StateUpdate = { [CH.approvalResult]: [entry] }
        if (!outcome.approved) {
          if (deps.approvals.onReject === 'fail') {
            throw new Error(`Approval rejected at node '${nodeId}' (policy ${deps.approvals.policy}, onReject=fail)`)
          }
          return { update, goto: [deps.approvals.onReject.goto] }
        }
        return { update }
      }
      return {
        interrupt: {
          id: interruptId,
          value: {
            kind: 'approval',
            nodeId,
            prompt: deps.prompt ?? 'Approval required',
            approvers: resolveApprovers(deps.approvals.approvers, state),
            policy: deps.approvals.policy,
            onReject: deps.approvals.onReject,
          },
        },
        goto: [nodeId],
      }
    },
  }
}
