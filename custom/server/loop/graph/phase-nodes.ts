// overlay/custom/server/loop/graph/phase-nodes.ts
// P1 Task 3 — 五阶段节点工厂：把 Loop 引擎的真实阶段函数绑定为 graph 节点
// discovery / handoff / validation / persistence + gate(R3) + stop-check
//
// 设计约束（plan Task 3 + spec §7B.7 P1 微调）：
// - dryRun=true 时 handoff/persistence 的对外副作用只记日志不执行（shadow 双跑护栏）
// - loop.* 兼容事件经 ctx.deps.emitEvent 桥接转发（装配层按 type 前缀分流到 loop 通道）
// - gate 命令区分 validator（失败进 repairQueue，触发守卫回边）/ post（失败仅 warn 不阻断）
// - 审批断链修复：validation 遇 overall==='pending' 时以 NodeResult.interrupt 暂停 run

import { execFile } from 'child_process'
import { promisify } from 'util'
import type { NodeDef, NodeContext, StateValues } from './types'
import type { PredicateExpr } from './predicate'
import { evaluatePredicate } from './predicate'
import type {
  LoopInstance, TaskContract, VerificationRecord, LoopEvent, LoopStage,
} from '../types'
import type { LoopStateStore } from '../store/state-store'
import type { WorktreeManager } from '../engine/worktree-manager'
import type { SubagentDispatcher } from '../engine/subagent-dispatcher'
import type { Verifier } from '../engine/verifier'

const execFileAsync = promisify(execFile)

/** 编译器与节点共用的 channel 键约定 */
export const CH = {
  contracts: 'contracts',
  verifications: 'verifications',
  stage: 'stage',
  stopMet: 'stopMet',
  gateResults: 'gateResults',
  repairQueue: 'repairQueue',
  /** 布尔路由信号：PredicateExpr 无法表达数组非空，repair 回边条件以此路由 */
  repairNeeded: 'repairNeeded',
  /** 已持久化契约 id（append）——repair 循环重入 persistence 时幂等去重 */
  persistedIds: 'persistedIds',
} as const

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
}

/** R3 质量门禁命令。kind=validator 失败阻断（repairQueue）；kind=post 失败仅 warn（§7B.7） */
export interface GateCommand {
  name: string
  cmd: string
  cwd?: string
  timeoutMs?: number
  kind?: 'validator' | 'post'
}

export interface GateResult {
  name: string
  kind: 'validator' | 'post'
  passed: boolean
  exitCode: number
  durationMs: number
  stderr: string
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

function stageFrom(phase: 'discovery' | 'handoff' | 'validation' | 'persistence'): LoopStage {
  return phase
}

/**
 * 五阶段节点工厂。execute 读 channel 状态、调真实模块、返回 update（含 contracts /
 * verifications / stage 等 channel 键）。
 */
export function createPhaseNode(
  phase: 'discovery' | 'handoff' | 'validation' | 'persistence',
  loop: LoopInstance,
  deps: PhaseNodeDeps,
): NodeDef {
  const log = deps.log ?? (() => {})
  const to = stageFrom(phase)
  const from: LoopStage = phase === 'discovery' ? loop.stage : (
    { handoff: 'discovery', validation: 'handoff', persistence: 'validation' } as const
  )[phase as 'handoff' | 'validation' | 'persistence']

  const execute = async (state: StateValues, ctx: NodeContext) => {
    await transition(loop, deps, ctx, from, to, `${phase} node start`)

    if (phase === 'discovery') return runDiscovery(loop, deps, ctx)
    if (phase === 'handoff') return runHandoff(loop, deps, ctx, state)
    if (phase === 'validation') return runValidation(loop, deps, ctx, state)
    return runPersistence(loop, deps, ctx, state)
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
  const updated: TaskContract[] = []
  const log = deps.log ?? (() => {})

  for (const c of contracts) {
    if (deps.dryRun) {
      log(`[dry-run] handoff skipped: worktree+dispatch for ${c.id}`)
      updated.push(c)
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
  return { update: { [CH.contracts]: updated } }
}

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

async function runValidation(
  loop: LoopInstance, deps: PhaseNodeDeps, ctx: NodeContext, state: StateValues,
) {
  const contracts = (state[CH.contracts] as TaskContract[] | undefined) ?? []
  const records: VerificationRecord[] = []
  const updated: TaskContract[] = []
  const repairQueue: string[] = []
  let escalatedCount = 0

  for (const c of contracts) {
    let record: VerificationRecord
    // resume 消费：人工已裁决（approved/rejected/changes-requested）的契约不再走
    // verifier 人工路径——剥离 human gate 重验程序化项，裁决合成进记录
    const resumed = state[`__resume:approval:${c.id}`]
    if (resumed === 'approved' || resumed === 'rejected' || resumed === 'changes-requested') {
      const stripped = { ...c, verificationIntent: { ...c.verificationIntent, human: null } }
      const base = await deps.verifier.verify(stripped, loop)
      record = {
        ...base,
        overall: resumed === 'approved' && base.overall === 'passed' ? 'passed' : 'failed',
        results: {
          ...base.results,
          human: { approver: 'resume', decision: resumed, comment: '', timestamp: now() },
        },
      }
    } else {
      record = await deps.verifier.verify(c, loop)
      if (record.overall === 'pending') {
        // 审批断链修复：pending 人工审批 → graph interrupt，run 进 awaiting-input。
        // goto 指回 validation：resume 从 nextNodes 续跑（被打断节点不自动重跑），
        // __resume:<interruptId> 注入 state 后由本节点消费裁决（见上方 resumed 分支）
        return {
          update: { [CH.verifications]: records, [CH.contracts]: updated },
          interrupt: { id: `approval:${c.id}`, value: { contractId: c.id, loopId: loop.id } },
          goto: ['validation'],
        }
      }
    }

    if (!deps.dryRun) await deps.store.appendVerification(record)
    emitLoopEvent(ctx, {
      type: 'loop.verification-complete', contractId: c.id,
      passed: record.overall === 'passed', ts: now(),
    })
    records.push(record)

    if (record.overall === 'failed') {
      // repair 路由（对齐旧引擎 routeRepair）：attempts+1，封顶则升级不再回边
      const attempts = c.attempts + 1
      const escalated = attempts >= c.maxAttempts
      if (!deps.dryRun) {
        await deps.store.updateContract(c.id, {
          attempts, status: escalated ? 'escalated' : 'queued',
        })
      }
      if (escalated) escalatedCount++
      else repairQueue.push(c.id)
      updated.push({ ...c, attempts, status: escalated ? 'escalated' as const : 'queued' as const })
    } else {
      updated.push(c)
    }
  }

  if (!deps.dryRun && escalatedCount > 0) {
    await deps.store.updateLoop(loop.id, {
      stats: { ...loop.stats, tasksBlocked: loop.stats.tasksBlocked + escalatedCount },
    })
  }
  return {
    update: {
      [CH.verifications]: records,
      [CH.contracts]: updated,
      [CH.repairQueue]: repairQueue,
      [CH.repairNeeded]: repairQueue.length > 0,
    },
  }
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

async function runPersistence(
  loop: LoopInstance, deps: PhaseNodeDeps, ctx: NodeContext, state: StateValues,
) {
  const contracts = (state[CH.contracts] as TaskContract[] | undefined) ?? []
  const verifications = (state[CH.verifications] as VerificationRecord[] | undefined) ?? []
  const persistedIds = new Set((state[CH.persistedIds] as string[] | undefined) ?? [])
  const log = deps.log ?? (() => {})
  const newlyPersisted: string[] = []
  let completed = 0

  for (const v of verifications) {
    if (v.overall !== 'passed') continue
    const contract = contracts.find(c => c.id === v.contractId)
    if (!contract) continue
    if (persistedIds.has(contract.id)) continue // repair 循环重入：已持久化契约幂等跳过
    if (deps.dryRun) {
      log(`[dry-run] persistence skipped: persist for ${contract.id}`)
      continue
    }
    const artifact = await deps.persistence.persist(contract, v, loop, false)
    completed++
    newlyPersisted.push(contract.id)
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
  return { update: newlyPersisted.length > 0 ? { [CH.persistedIds]: newlyPersisted } : {} }
}

// ---------------------------------------------------------------------------
// gate（R3 质量门禁）与 stop-check
// ---------------------------------------------------------------------------

async function runGateCommand(cmd: GateCommand): Promise<GateResult> {
  const kind = cmd.kind ?? 'validator'
  const started = Date.now()
  const parts = cmd.cmd.split(/\s+/).filter(Boolean)
  let exitCode = 0
  let stderr = ''
  try {
    await execFileAsync(parts[0], parts.slice(1), {
      cwd: cmd.cwd ?? process.cwd(),
      timeout: cmd.timeoutMs ?? 60_000,
      maxBuffer: 1024 * 1024,
    })
  } catch (err: unknown) {
    const e = err as { code?: number | string; stderr?: string; message?: string; killed?: boolean }
    exitCode = typeof e.code === 'number' ? e.code : (e.killed ? 124 : 1)
    stderr = String(e.stderr ?? e.message ?? '').slice(-512)
  }
  return {
    name: cmd.name, kind,
    passed: exitCode === 0, exitCode,
    durationMs: Date.now() - started, stderr,
  }
}

/** R3 质量门禁节点：validator 失败 → repairQueue（守卫回边回 handoff）；post 失败仅 warn */
export function createGateNode(
  loop: LoopInstance,
  deps: { commands: GateCommand[]; log?: (msg: string) => void },
): NodeDef {
  const log = deps.log ?? (() => {})
  return {
    id: 'gate',
    type: 'function',
    label: `${loop.name}:gate`,
    execute: async () => {
      const results: GateResult[] = []
      for (const command of deps.commands) {
        const result = await runGateCommand(command)
        if (!result.passed && result.kind === 'post') {
          log(`gate post-function '${result.name}' failed (exit ${result.exitCode}, non-blocking): ${result.stderr}`)
        }
        results.push(result)
      }
      const repairQueue = results.filter(r => !r.passed && r.kind === 'validator').map(r => r.name)
      return {
        update: {
          [CH.gateResults]: results,
          [CH.repairQueue]: repairQueue,
          [CH.repairNeeded]: repairQueue.length > 0,
        },
      }
    },
  }
}

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
      emitLoopEvent(ctx, {
        type: 'loop.stage-transition', loopId: loop.id,
        from: 'persistence', to: 'scheduling', reason: `stop-check: ${stopMet}`, ts: now(),
      })
      // 一个 run = 一个 tick：stop-check 即终点，重入由 RunSpawner 发起新 run
      return { update: { [CH.stopMet]: stopMet }, end: true }
    },
  }
}
