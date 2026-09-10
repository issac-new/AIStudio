// overlay/custom/server/loop/graph/graph-compiler.ts
// P1 Task 4 — 编译器：LoopInstance → GraphSpec
//
// 产物拓扑（节点 id 固定，供事件桥接与 UI 锚定）：
//
//   discovery →(有契约)→ handoff → validation → persistence → gate ─┐
//      │无契约                                                        │gate 通过
//      ▼                                                              ▼
//    stop-check ◀─────────────────────────────────────────────── stop-check
//   （repair 回边：validation 失败 / persistence 失败 / gate validator 失败 → handoff，
//     guard.maxIterations = repairMaxAttempts，默认 3。persistence 与 validation 对称
//     双条件边——BSP 先 apply 更新再求值出边，若 persistence→gate 无条件，persistence 置的
//     repairNeeded 会在下一 super-step 被 gate 的成功覆写（repairNeeded:false）吃掉，
//     守卫回边恒 false → 失败契约零重试、交付物静默丢失（P2 Task 4 审查 Critical））
//
// 设计约束：
// - routing 条件必须是 PredicateExpr（可序列化）：数组非空无法直接表达，
//   故节点写 stage / repairNeeded 布尔信号，编译器在其上生成 cmp/truthy 谓词
// - 一个 run = 一个 tick：stop-check 返回 end 终止 run，重入由 RunSpawner 发起新 run
// - contracts 通道用 appendById 领域 reducer（自定义 reducer 经 hydrate 第三参注入）

import type { LoopInstance } from '../types'
import type { GraphSpec, EdgeSpec, NodeSpec, CustomReducers } from './graph-spec'
import { hydrateGraphSpec } from './graph-spec'
import { NodeRegistry } from './node-registry'
import type { StateValues } from './types'
import {
  createPhaseNode, createGateNode, createStopConditionNode, CH,
  type PhaseNodeDeps, type GateCommand,
} from './phase-nodes'

/** §7B.7 P1：human/审批节点 config 三元组（不引入独立审批节点类型） */
export interface ApprovalConfig {
  /** 审批人来源：固定名单或 'contract-approvers'（取契约 verificationIntent.human.approvers） */
  approverSource: string[] | 'contract-approvers'
  /** 通过策略：全体 / 多数 / 指定人 */
  passPolicy: 'all' | 'majority' | 'specified'
  /** 拒绝去向：节点 id（默认回 handoff repair） */
  rejectGoto?: string
}

export interface CompileDeps extends PhaseNodeDeps {
  gateCommands?: GateCommand[]
  evaluateStop?: (stopCondition: string, state: StateValues) => Promise<boolean>
  /** repair 回边 guard.maxIterations；默认 3（对齐 TaskContract.maxAttempts 默认值） */
  repairMaxAttempts?: number
  approvalConfig?: ApprovalConfig
}

/** 编译产物的节点 type 字符串（NodeRegistry 注册键） */
export const LOOP_NODE_TYPES = {
  discovery: 'phase-discovery',
  handoff: 'phase-handoff',
  validation: 'phase-validation',
  persistence: 'phase-persistence',
  gate: 'loop-gate',
  stop: 'stop-check',
} as const

/** 拓扑编译所需的最小 deps：compileLoopToSpec 只读 repairMaxAttempts / approvalConfig，
 *  不触碰执行期依赖（store/dispatcher/…）——只读投影（loop-to-graph.ts）与迁移器据此零依赖复用 */
export type CompileTopologyDeps = Pick<CompileDeps, 'repairMaxAttempts' | 'approvalConfig'>

/** LoopInstance → GraphSpec（纯拓扑 + 谓词，不含函数；执行函数经 makeLoopNodeRegistry 注入） */
export function compileLoopToSpec(loop: LoopInstance, deps: CompileTopologyDeps): GraphSpec {
  const maxAttempts = deps.repairMaxAttempts ?? 3
  const stageIsScheduling = { op: 'cmp', path: CH.stage, cmp: 'eq', value: 'scheduling' } as const
  const repairNeeded = { op: 'truthy', path: CH.repairNeeded } as const
  const notRepairNeeded = { op: 'not', expr: repairNeeded } as const

  const edges: EdgeSpec[] = [
    { from: 'discovery', to: 'handoff', label: 'has-contracts', condition: { op: 'not', expr: stageIsScheduling } },
    { from: 'discovery', to: 'stop-check', label: 'no-contracts', condition: stageIsScheduling },
    { from: 'handoff', to: 'validation', label: 'dispatched' },
    { from: 'validation', to: 'persistence', label: 'passed', condition: notRepairNeeded },
    { from: 'validation', to: 'handoff', label: 'repair', condition: repairNeeded, guard: { maxIterations: maxAttempts } },
    // 与 validation 对称的双条件边（P2 Task 4 审查 Critical）：persistence 置 repairNeeded=true
    // 时本 super-step 直接回 handoff，不经过 gate——gate 成功路径的 repairNeeded:false 覆写
    // 只对 gate 自身的 validator 失败语义负责
    { from: 'persistence', to: 'gate', label: 'persisted', condition: notRepairNeeded },
    { from: 'persistence', to: 'handoff', label: 'repair', condition: repairNeeded, guard: { maxIterations: maxAttempts } },
    { from: 'gate', to: 'stop-check', label: 'gate-passed', condition: notRepairNeeded },
    { from: 'gate', to: 'handoff', label: 'gate-repair', condition: repairNeeded, guard: { maxIterations: maxAttempts } },
  ]

  const nodes: NodeSpec[] = [
    { id: 'discovery', type: LOOP_NODE_TYPES.discovery, config: { label: `${loop.name}:discovery` } },
    // handoff / stop-check 是分支汇合点（正常流 + repair 回边 / gate 短路），joinMode
    // 必须为 'any'：默认 'all' 的 join 屏障会等一条本轮不可能完成的前驱边，节点饿死
    { id: 'handoff', type: LOOP_NODE_TYPES.handoff, config: { label: `${loop.name}:handoff` }, joinMode: 'any' },
    {
      id: 'validation', type: LOOP_NODE_TYPES.validation,
      config: {
        label: `${loop.name}:validation`,
        ...(deps.approvalConfig ? { approvalConfig: deps.approvalConfig } : {}),
      },
    },
    { id: 'persistence', type: LOOP_NODE_TYPES.persistence, config: { label: `${loop.name}:persistence` } },
    { id: 'gate', type: LOOP_NODE_TYPES.gate, config: { label: `${loop.name}:gate` } },
    { id: 'stop-check', type: LOOP_NODE_TYPES.stop, config: { label: `${loop.name}:stop-check` }, joinMode: 'any' },
  ]

  return {
    id: `loop-${loop.id}`,
    version: 1,
    channels: {
      [CH.contracts]: { reducer: 'appendById', default: [] },
      [CH.verifications]: { reducer: 'append', default: [] },
      [CH.stage]: { reducer: 'overwrite', default: 'scheduling' },
      [CH.stopMet]: { reducer: 'overwrite', default: false },
      [CH.gateResults]: { reducer: 'overwrite', default: [] },
      [CH.repairQueue]: { reducer: 'append', default: [] },
      [CH.repairNeeded]: { reducer: 'overwrite', default: false },
      [CH.approvalResult]: { reducer: 'append', default: [] },
      [CH.phaseProgress]: { reducer: 'overwrite', default: [] },
      costTotal: { reducer: 'max', default: 0 },
    },
    nodes,
    edges,
    entryNode: 'discovery',
    limits: { maxSteps: 100, maxCost: loop.budget.maxCostTotal },
  }
}

/** 编译产物的节点注册表：phase 节点工厂闭包捕获 loop + 真实 deps */
export function makeLoopNodeRegistry(loop: LoopInstance, deps: CompileDeps): NodeRegistry {
  const registry = new NodeRegistry()
  registry.register(LOOP_NODE_TYPES.discovery, config => ({
    ...createPhaseNode('discovery', loop, deps),
    id: config.id as string,
  }))
  registry.register(LOOP_NODE_TYPES.handoff, config => ({
    ...createPhaseNode('handoff', loop, deps),
    id: config.id as string,
  }))
  registry.register(LOOP_NODE_TYPES.validation, config => ({
    ...createPhaseNode('validation', loop, deps),
    id: config.id as string,
  }))
  registry.register(LOOP_NODE_TYPES.persistence, config => ({
    ...createPhaseNode('persistence', loop, deps),
    id: config.id as string,
  }))
  registry.register(LOOP_NODE_TYPES.gate, config => ({
    ...createGateNode(loop, { commands: deps.gateCommands ?? [], log: deps.log }),
    id: config.id as string,
  }))
  registry.register(LOOP_NODE_TYPES.stop, config => ({
    ...createStopConditionNode(loop, { evaluateStop: deps.evaluateStop }),
    id: config.id as string,
  }))
  return registry
}

/** 便捷装配：compile + registry + hydrate 一步到位（appendById 等领域 reducer 经第三参注入） */
export function compileLoopToDef(
  loop: LoopInstance,
  deps: CompileDeps,
  customReducers: CustomReducers,
) {
  return hydrateGraphSpec(compileLoopToSpec(loop, deps), makeLoopNodeRegistry(loop, deps), customReducers)
}
