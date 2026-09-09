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
      : { [CH.contracts]: contracts },
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

  for (const c of contracts) {
    const record = await deps.verifier.verify(c, loop)
    if (record.overall === 'pending') {
      // 审批断链修复：pending 人工审批 → graph interrupt，run 进 awaiting-input
      return {
        update: { [CH.verifications]: records },
        interrupt: { id: `approval:${c.id}`, value: { contractId: c.id, loopId: loop.id } },
      }
    }
    if (!deps.dryRun) await deps.store.appendVerification(record)
    emitLoopEvent(ctx, {
      type: 'loop.verification-complete', contractId: c.id,
      passed: record.overall === 'passed', ts: now(),
    })
    records.push(record)
  }
  return { update: { [CH.verifications]: records } }
}

// ---------------------------------------------------------------------------
// persistence
// ---------------------------------------------------------------------------

async function runPersistence(
  loop: LoopInstance, deps: PhaseNodeDeps, ctx: NodeContext, state: StateValues,
) {
  const contracts = (state[CH.contracts] as TaskContract[] | undefined) ?? []
  const verifications = (state[CH.verifications] as VerificationRecord[] | undefined) ?? []
  const log = deps.log ?? (() => {})
  let completed = 0

  for (const v of verifications) {
    if (v.overall !== 'passed') continue
    const contract = contracts.find(c => c.id === v.contractId)
    if (!contract) continue
    if (deps.dryRun) {
      log(`[dry-run] persistence skipped: persist for ${contract.id}`)
      continue
    }
    const artifact = await deps.persistence.persist(contract, v, loop, false)
    completed++
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
  return { update: {} }
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
      return { update: { [CH.gateResults]: results, [CH.repairQueue]: repairQueue } }
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
      return { update: { [CH.stopMet]: stopMet } }
    },
  }
}
