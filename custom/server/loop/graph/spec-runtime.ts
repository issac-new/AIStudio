// overlay/custom/server/loop/graph/spec-runtime.ts
// P4 T2/T3 — 自建 GraphSpec 的可运行装配：编辑器节点类型注册表 + 起跑链路。
//
// 编辑器 spec 是纯 JSON（不可携带函数闭包），因此这里注册的节点工厂全部
// 「自执行」——语义只来自可序列化的 config：
//   function  config.set 通道字面量写入（seed/work/done 等通用节点）
//   human     审批 interrupt（复用 phase-nodes 的 createHumanApprovalNode，config 三元组）
//   plan      P4 一等节点：可编辑计划 + 三出口审批（approve-auto/approve-stepwise/reject）
//   fanout    Best-of-N 分叉：纯直通（并行由多条无条件出边 + BSP 同步天然承载，
//             此类型仅是画布语义锚点 + 结构校验）
//   bo-n-variant  变体节点：向 collectChannel 追加 {variant, payload, score}
//   converge  Best-of-N 收敛：joinMode 'all' 屏障后收集候选，human 中选 / score 自动选优
//   gate      R3 质量门禁（编辑器形态）：只执行受信目录中的真实沙箱命令
//   agent     本批不可执行：起跑预检拒绝，节点工厂亦失败关闭
//
// 起跑链路：CustomSpecRuntime.startRun = specStore.get → 深副本 → validateEditorSpec
// → 能力预检 → hydrateGraphSpec（本注册表）→ registerGraph → GraphService 快照起跑。

import type { NodeResult, StateUpdate, StateValues, GraphDef } from './types'
import { NodeRegistry } from './node-registry'
import { hydrateGraphSpec, type GraphSpec } from './graph-spec'
import { resumeChannel, createHumanApprovalNode } from './phase-nodes'
import type { GraphDefinitionContext, GraphService } from './graph-service'
import type { GraphSpecStore } from './graph-rest'
import {
  executeGraphGate, graphGateNodeTimeoutMs,
  type GateCommandEntry, type GateExecutorDeps,
} from './gate-executor'
import { graphSpecContentHash, type GraphRuntimeKind } from './run-spec-snapshot'
import {
  EditorSpecError, preflightSpecCapabilities, type SpecExecutionCapabilities,
} from './spec-capabilities'

export { EditorSpecError } from './spec-capabilities'
export type { SpecExecutionCapabilities } from './spec-capabilities'

const now = (): string => new Date().toISOString()

/** plan 节点状态通道（编辑器按此脚手架 channels） */
export const PLAN_CHANNELS = ['planResult', 'planDecision', 'planMode'] as const

// ---------------------------------------------------------------------------
// 节点工厂
// ---------------------------------------------------------------------------

export interface SpecRuntimeOpts {
  /** 唯一受信 gate 目录；编辑器 spec.meta.gateCommands 永不并入。 */
  gateCatalog?: readonly GateCommandEntry[]
  /** 测试只替换 OS 进程/lease 边界；生产缺省为 Task 3 真实沙箱执行器。 */
  gateExecutor?: Omit<GateExecutorDeps, 'catalog'>
  /** @deprecated 旧装配签名兼容；字符串白名单不能映射为真实 argv，故不参与执行。 */
  gateCommands?: string[]
}

export function createSpecRuntimeRegistry(opts: SpecRuntimeOpts = {}): NodeRegistry {
  const registry = new NodeRegistry()

  registry.register('function', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (): Promise<NodeResult> => {
      const set = (config.set ?? {}) as Record<string, unknown>
      return { update: { ...set } as StateUpdate }
    },
    timeout: 60000,
  }))

  registry.register('agent', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (): Promise<NodeResult> => {
      throw new EditorSpecError(
        'agent_execution_unavailable',
        `Agent node '${config.id}' has no execution capability in this runtime`,
      )
    },
    timeout: 60000,
  }))

  registry.register('gate', (config) => {
    const catalog = opts.gateCatalog ?? []
    const command = config.command as string | undefined
    const entry = catalog.find(candidate => candidate.command === command)
    return {
      id: config.id as string,
      type: 'function' as const,
      label: (config.label as string) ?? (config.id as string),
      execute: async (_state, ctx): Promise<NodeResult> => executeGraphGate(
        config as { id: string; command?: string },
        ctx,
        { ...opts.gateExecutor, catalog },
      ),
      timeout: entry ? graphGateNodeTimeoutMs(entry) : 60000,
    }
  })

  registry.register('fanout', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    // 直通：并行分支 = 本节点的多条无条件出边（BSP 同 super-step 真并行），
    // 结构合法性（≥2 条无条件出边）由 validateEditorSpec 校验
    execute: async (): Promise<NodeResult> => ({ update: {} }),
    timeout: 60000,
  }))

  registry.register('bo-n-variant', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (): Promise<NodeResult> => {
      const channel = (config.collectChannel ?? 'boN.candidates') as string
      return {
        update: {
          [channel]: [{
            variant: (config.variant ?? config.id) as string,
            payload: config.payload ?? null,
            score: typeof config.score === 'number' ? config.score : 0,
            ts: now(),
          }],
        } as StateUpdate,
      }
    },
    timeout: 60000,
  }))

  registry.register('converge', (config) => {
    const nodeId = config.id as string
    const expect = (config.expect ?? 2) as number
    const collectChannel = (config.collectChannel ?? 'boN.candidates') as string
    const winnerChannel = (config.winnerChannel ?? 'boN.winner') as string
    const pick = (config.pick ?? 'human') as 'human' | 'score'
    const scorePath = (config.scorePath ?? 'score') as string
    const roundOf = (state: StateValues): number => {
      const winners = state[winnerChannel] as Array<{ nodeId?: string }> | undefined
      return (Array.isArray(winners) ? winners : []).filter(e => e?.nodeId === nodeId).length
    }
    return {
      id: nodeId,
      type: 'function' as const,
      label: (config.label as string) ?? nodeId,
      timeout: 86_400_000,
      execute: async (state: StateValues): Promise<NodeResult> => {
        const candidates = (state[collectChannel] ?? []) as Array<Record<string, unknown>>
        if (!Array.isArray(candidates) || candidates.length < expect) {
          throw new Error(
            `converge node '${nodeId}': expected ${expect} candidates in channel "${collectChannel}", got ${candidates.length}`,
          )
        }
        if (pick === 'score') {
          let best = 0
          for (let i = 1; i < candidates.length; i++) {
            const cur = candidates[i][scorePath]
            const bestV = candidates[best][scorePath]
            if (typeof cur === 'number' && (typeof bestV !== 'number' || cur > bestV)) best = i
          }
          return {
            update: {
              [winnerChannel]: [{ nodeId, pick: 'score', winner: candidates[best], index: best, candidates, ts: now() }],
            } as StateUpdate,
          }
        }
        // human 中选：interrupt 列变体，resume {pick: index}
        const interruptId = `bo-n:${nodeId}@${roundOf(state)}`
        const resumeValue = state[resumeChannel(interruptId)]
        if (resumeValue !== undefined) {
          const chosen = (resumeValue as { pick?: unknown }).pick
          if (typeof chosen !== 'number' || chosen < 0 || chosen >= candidates.length) {
            throw new Error(`converge node '${nodeId}': resume.pick must be index 0..${candidates.length - 1}`)
          }
          return {
            update: {
              [winnerChannel]: [{ nodeId, pick: 'human', winner: candidates[chosen], index: chosen, candidates, ts: now() }],
            } as StateUpdate,
          }
        }
        return {
          interrupt: {
            id: interruptId,
            value: { kind: 'best-of-n', nodeId, candidates, expect },
          },
          goto: [nodeId],
        }
      },
    }
  })

  registry.register('plan', (config) => {
    const nodeId = config.id as string
    const onReject = (config.onReject ?? 'fail') as string
    const roundOf = (state: StateValues): number => {
      const rounds = state.planResult as Array<{ nodeId?: string }> | undefined
      return (Array.isArray(rounds) ? rounds : []).filter(e => e?.nodeId === nodeId).length
    }
    return {
      id: nodeId,
      type: 'human' as const,
      label: (config.label as string) ?? nodeId,
      timeout: 86_400_000,
      execute: async (state: StateValues): Promise<NodeResult> => {
        const interruptId = `plan:${nodeId}@${roundOf(state)}`
        const resumeValue = state[resumeChannel(interruptId)]
        if (resumeValue !== undefined) {
          const rv = (resumeValue ?? {}) as {
            decision?: unknown; mode?: unknown; planText?: unknown; todo?: unknown
          }
          if (rv.decision !== 'approve' && rv.decision !== 'reject') {
            throw new Error(
              `plan node '${nodeId}': resume.decision must be 'approve' | 'reject' (got ${String(rv.decision)})`,
            )
          }
          const decision = rv.decision
          const mode = rv.decision === 'approve' && rv.mode !== 'stepwise' ? 'auto' : 'stepwise'
          const entry = {
            nodeId,
            decision,
            mode,
            // 批准路径允许改计划（spec §7B.1 "计划是数据：可编辑"）
            planText: typeof rv.planText === 'string' ? rv.planText : (config.planText as string | undefined) ?? '',
            todo: Array.isArray(rv.todo) ? rv.todo : (config.todo as string[] | undefined) ?? [],
            ts: now(),
          }
          const update: StateUpdate = {
            planResult: [entry],
            planDecision: decision,
            planMode: mode,
          }
          if (decision === 'reject') {
            if (onReject === 'fail') {
              throw new Error(`Plan rejected at node '${nodeId}' (onReject=fail)`)
            }
            return { update, goto: [onReject] }
          }
          return { update }
        }
        return {
          interrupt: {
            id: interruptId,
            value: {
              kind: 'plan',
              nodeId,
              planText: (config.planText as string | undefined) ?? '',
              todo: (config.todo as string[] | undefined) ?? [],
              // 三出口：批准即档位（auto 自动执行 / stepwise 逐项确认）、reject 打回
              exits: ['approve-auto', 'approve-stepwise', 'reject'],
              onReject,
            },
          },
          goto: [nodeId],
        }
      },
    }
  })

  // human：复用 phase-nodes 审批节点（config: prompt/approvals 三元组）
  // phase-nodes 不 import 本文件，无环。
  return registerHuman(registry)
}

function registerHuman(registry: NodeRegistry): NodeRegistry {
  registry.register('human', (config) => {
    const approvalsCfg = (config.approvals ?? {}) as {
      policy?: 'all' | 'any' | 'majority' | 'specified'
      onReject?: { goto: string } | 'fail'
      approvers?: string[]
    }
    return createHumanApprovalNode({
      id: config.id as string,
      prompt: config.prompt as string | undefined,
      approvals: {
        policy: approvalsCfg.policy ?? 'any',
        approvers: approvalsCfg.approvers ?? ['assignee'],
        onReject: approvalsCfg.onReject ?? { goto: (config.rejectTarget as string) ?? 'fail' },
      },
    })
  })
  return registry
}

// ---------------------------------------------------------------------------
// 结构校验（编辑器 spec 专属——hydrate 前给出一针见血的错误）
// ---------------------------------------------------------------------------

export function validateEditorSpec(spec: GraphSpec): void {
  const channels = new Set(Object.keys(spec.channels))
  const unconditionalOut = new Map<string, number>()
  for (const e of spec.edges) {
    if (!e.condition && !e.guard) {
      unconditionalOut.set(e.from, (unconditionalOut.get(e.from) ?? 0) + 1)
    }
  }
  for (const n of spec.nodes) {
    switch (n.type) {
      case 'plan': {
        const missing = PLAN_CHANNELS.filter(c => !channels.has(c))
        if (missing.length > 0) {
          throw new EditorSpecError(
            `plan node '${n.id}' requires channels: ${missing.join(', ')} (append planResult + overwrite planDecision/planMode)`,
          )
        }
        if (n.config.onReject !== undefined && n.config.onReject !== 'fail' &&
            !spec.nodes.some(m => m.id === n.config.onReject)) {
          throw new EditorSpecError(`plan node '${n.id}': onReject target "${String(n.config.onReject)}" not found`)
        }
        break
      }
      case 'fanout': {
        const outs = unconditionalOut.get(n.id) ?? 0
        if (outs < 2) {
          throw new EditorSpecError(
            `fanout node '${n.id}' needs >= 2 unconditional out-edges (Best-of-N 分叉)，got ${outs}`,
          )
        }
        break
      }
      case 'bo-n-variant': {
        const ch = (n.config.collectChannel ?? 'boN.candidates') as string
        if (!channels.has(ch)) {
          throw new EditorSpecError(`bo-n-variant node '${n.id}': channel "${ch}" not declared (append reducer)`)
        }
        break
      }
      case 'converge': {
        const collect = (n.config.collectChannel ?? 'boN.candidates') as string
        const winner = (n.config.winnerChannel ?? 'boN.winner') as string
        const missing = [collect, winner].filter(c => !channels.has(c))
        if (missing.length > 0) {
          throw new EditorSpecError(`converge node '${n.id}' requires channels: ${missing.join(', ')}`)
        }
        break
      }
      default:
        break
    }
  }
}

// ---------------------------------------------------------------------------
// 起跑链路
// ---------------------------------------------------------------------------

export interface CustomSpecRuntimeDeps {
  specStore: Pick<GraphSpecStore, 'get'>
  graphService: Pick<GraphService, 'registerGraph' | 'startRun'>
  runtimeKind: GraphRuntimeKind
  capabilities: SpecExecutionCapabilities
  registry?: NodeRegistry
  gateExecutor?: Omit<GateExecutorDeps, 'catalog'>
  log?: (msg: string) => void
}

/** 旧装配尚未声明能力时保持 editor + production + 空目录的失败关闭缺省。 */
export type CustomSpecRuntimeOptions = Omit<CustomSpecRuntimeDeps, 'runtimeKind' | 'capabilities'> & {
  runtimeKind?: GraphRuntimeKind
  capabilities?: SpecExecutionCapabilities
}

/** 自建 spec 起跑器：读副本 → 校验 → 能力预检 → hydrate → 快照起跑。 */
export class CustomSpecRuntime {
  private readonly registry: NodeRegistry
  private readonly deps: CustomSpecRuntimeDeps

  constructor(options: CustomSpecRuntimeOptions) {
    const capabilities = options.capabilities ?? {
      gateCatalog: [], hasRealKanbanBridge: false, executionMode: 'production',
    }
    this.deps = {
      ...options,
      runtimeKind: options.runtimeKind ?? 'editor',
      capabilities,
    }
    this.registry = options.registry ?? createSpecRuntimeRegistry({
      gateCatalog: capabilities.gateCatalog,
      gateExecutor: options.gateExecutor,
    })
  }

  /** Task 6 快照 loader 与 start 共用本实例的注册表。 */
  hydrate(spec: GraphSpec): GraphDef {
    return hydrateGraphSpec(spec, this.registry)
  }

  async startRun(
    specId: string,
    initialState?: StateValues,
    context?: GraphDefinitionContext,
  ) {
    const stored = this.deps.specStore.get(specId)
    if (!stored) throw new EditorSpecError('spec_not_found', `Spec not found: ${specId}`)
    const spec = structuredClone(stored)
    validateEditorSpec(spec)
    preflightSpecCapabilities(spec, this.deps.capabilities)
    const def = this.hydrate(spec)
    this.deps.graphService.registerGraph(def)
    const started = await this.deps.graphService.startRun(spec.id, initialState, undefined, {
      snapshot: {
        spec,
        meta: {
          specId: spec.id,
          revision: null,
          draftVersion: spec.version,
          runtimeKind: this.deps.runtimeKind,
          executionMode: this.deps.capabilities.executionMode,
          contentHash: graphSpecContentHash(spec),
          createdAt: now(),
          ...(context?.actor !== undefined ? { createdBy: context.actor } : {}),
        },
      },
      definitionContext: context,
    })
    this.deps.log?.(`[spec-runtime] spec ${specId} hydrated (${spec.nodes.length} nodes) and run started`)
    return started
  }
}
