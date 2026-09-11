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
//   gate      R3 质量门禁（编辑器形态）：命令白名单校验，结构占位
//   agent     画布语义占位：登记 agentRequest（真实派发属 loop-engine 模板域）
//
// 起跑链路：CustomSpecRuntime.startRun = specStore.get → validateEditorSpec
// → hydrateGraphSpec（本注册表）→ graphService.registerGraph → startRun。

import type { NodeDef, NodeResult, StateUpdate, StateValues } from './types'
import { NodeRegistry } from './node-registry'
import { hydrateGraphSpec, type GraphSpec } from './graph-spec'
import { resumeChannel, createHumanApprovalNode } from './phase-nodes'
import type { GraphService } from './graph-service'
import type { GraphSpecStore } from './graph-rest'

const now = (): string => new Date().toISOString()

/** plan 节点状态通道（编辑器按此脚手架 channels） */
export const PLAN_CHANNELS = ['planResult', 'planDecision', 'planMode'] as const

// ---------------------------------------------------------------------------
// 节点工厂
// ---------------------------------------------------------------------------

export interface SpecRuntimeOpts {
  /** gate 节点命令白名单（spec.meta.gateCommands 或装配层注入）；未配置时 gate 有命令即拒 */
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
      // 画布语义占位：登记请求不派发（真实 agent 派发在 loop-engine 五阶段模板域）
      const channel = (config.channel ?? 'agentRequest') as string
      return { update: { [channel]: [{ node: config.id as string, ts: now() }] } as StateUpdate }
    },
    timeout: 60000,
  }))

  registry.register('gate', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (): Promise<NodeResult> => {
      const command = config.command as string | undefined
      if (command !== undefined) {
        const allowed = opts.gateCommands ?? []
        if (!allowed.includes(command)) {
          throw new Error(
            `gate node '${config.id}': command "${command}" not in whitelist [${allowed.join(', ')}]`,
          )
        }
      }
      return { update: { [`${config.id}.gatePassed`]: true } as StateUpdate }
    },
    timeout: 60000,
  }))

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

export class EditorSpecError extends Error {}

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
  registry?: NodeRegistry
  log?: (msg: string) => void
}

/** 自建 spec 起跑器：hydrate → registerGraph → startRun（幂等：每次重装配覆盖注册） */
export class CustomSpecRuntime {
  private readonly registry: NodeRegistry
  constructor(private readonly deps: CustomSpecRuntimeDeps) {
    this.registry = deps.registry ?? createSpecRuntimeRegistry()
  }

  async startRun(specId: string, initialState?: StateValues) {
    const spec = this.deps.specStore.get(specId)
    if (!spec) throw new EditorSpecError(`Spec not found: ${specId}`)
    validateEditorSpec(spec)
    const def = hydrateGraphSpec(spec, this.registry)
    this.deps.graphService.registerGraph(def)
    this.deps.log?.(`[spec-runtime] spec ${specId} hydrated (${spec.nodes.length} nodes) and run started`)
    return this.deps.graphService.startRun(spec.id, initialState)
  }
}
