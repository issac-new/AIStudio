// overlay/custom/server/loop/graph/loop-to-graph.ts
// Loop-to-Graph 映射器 — 把 LoopInstance 映射为 GraphInstance + GraphDef
//
// P2 Task 3：loopToGraphDef 不再手写拓扑，委托 graph-compiler.compileLoopToSpec
// （LoopInstance → GraphSpec 六节点 + 守卫 repair 回边，图拓扑唯一事实源）再投影为
// controllers/graph.ts 的 legacy REST 形状（5 阶段节点 + repair/next-tick 边，节点
// execute 为占位、不可执行）。可执行图定义直接用 compileLoopToSpec + hydrate。
//
// 核心概念：
//   一个 Loop = 图中的一个 loop-node（5 阶段为子节点）
//   Loop 的 5 阶段（discovery→handoff→validation→persistence→scheduling）= 图的 5 个节点
//   Loop 的事件流 = 图的轨迹
//   Loop 的 stage = 图的当前执行位置

import type { LoopInstance, LoopEvent } from '../types'
import type { GraphInstance, GraphDef, NodeDef, EdgeDef, StateSchema, GraphEvent } from './types'
import { reducers } from './types'
import { compileLoopToSpec } from './graph-compiler'

const STAGES = ['discovery', 'handoff', 'validation', 'persistence', 'scheduling'] as const

/** 编译产物节点 id → legacy REST 阶段：gate/stop-check 折叠进 5 阶段视图的 scheduling 末段 */
const COMPILED_TO_REST_STAGE: Record<string, string> = {
  discovery: 'discovery',
  handoff: 'handoff',
  validation: 'validation',
  persistence: 'persistence',
  gate: 'scheduling',
  'stop-check': 'scheduling',
}

/** 把 LoopInstance 映射为 GraphInstance */
export function loopToGraphInstance(loop: LoopInstance, contracts: Array<{ id: string; status: string }>): GraphInstance {
  // 从 Loop stage 推导当前 step（0-4）
  const stageIndex = STAGES.indexOf(loop.stage as any)
  const currentStep = stageIndex >= 0 ? stageIndex : 0

  // 从 Loop status 推导 Graph status
  let status: GraphInstance['status']
  switch (loop.status) {
    case 'running': status = 'running'; break
    case 'awaiting-review': status = 'awaiting-input'; break
    case 'completed': status = 'completed'; break
    case 'failed': status = 'failed'; break
    case 'paused': status = 'paused'; break
    default: status = 'idle'; break
  }

  // 从 Loop stats 构建 state
  const state: Record<string, unknown> = {
    loopName: loop.name,
    pattern: loop.pattern,
    autonomyLevel: loop.autonomyLevel,
    goal: loop.goal,
    stopCondition: loop.stopCondition,
    tasksDiscovered: loop.stats.tasksDiscovered,
    tasksCompleted: loop.stats.tasksCompleted,
    tasksBlocked: loop.stats.tasksBlocked,
    currentIteration: loop.stats.currentIteration,
    contractCount: contracts.length,
  }

  return {
    id: `graph-${loop.id}`,
    graphDefId: loop.id,
    threadId: `thread-${loop.id}-${loop.stats.currentIteration}`,
    status,
    currentStep,
    state,
    totalCost: loop.stats.totalCost,
    createdAt: loop.createdAt,
    updatedAt: loop.updatedAt,
  }
}

/** 把 LoopInstance 映射为 GraphDef（P2 Task 3：委托 compileLoopToSpec 编译，再投影 legacy REST 形状） */
export function loopToGraphDef(loop: LoopInstance): GraphDef {
  const spec = compileLoopToSpec(loop, {})

  // 节点：编译产物 6 节点折叠为 5 阶段 REST 视图（占位 execute，不可执行——可执行面走 hydrate）
  const stages: string[] = []
  for (const n of spec.nodes) {
    const stage = COMPILED_TO_REST_STAGE[n.id] ?? n.id
    if (!stages.includes(stage)) stages.push(stage)
  }
  const nodes = new Map<string, NodeDef>()
  for (const stage of stages) {
    nodes.set(stage, {
      id: stage,
      type: 'loop',
      label: stage,
      execute: async () => ({ update: {} }),
    })
  }

  // 边（逐字段对齐 legacy 形状）：
  // - 直连主干边（投影后 target 恰为 source 的下一阶段）保留，去掉编译期 label
  // - validation→handoff 的 repair 回边保留 label + legacy repair 通道条件
  //   （编译产物的 repairNeeded 谓词作用于图执行通道，legacy REST 视图无此通道，不投影）
  // - gate→stop-check 自环、gate-repair/no-contracts 分支边在 5 阶段视图无对应物，不投影
  // - legacy tick 循环边 scheduling→discovery 补回（编译语义里由 RunSpawner 每 tick 新起 run 承载）
  const edges: EdgeDef[] = []
  for (const e of spec.edges) {
    const source = COMPILED_TO_REST_STAGE[e.from] ?? e.from
    const target = COMPILED_TO_REST_STAGE[e.to] ?? e.to
    if (source === target) continue // gate→stop-check 同折叠为 scheduling，自环不投影
    if (e.label === 'repair') {
      edges.push({
        source,
        target,
        condition: (state) => (state.repair as boolean) ? 'handoff' : null,
        label: 'repair',
      })
    } else if (stages.indexOf(target) === stages.indexOf(source) + 1) {
      edges.push({ source, target })
    }
  }
  if (!edges.some(e => e.source === 'scheduling' && e.target === 'discovery')) {
    edges.push({ source: 'scheduling', target: 'discovery', label: 'next tick' })
  }

  const stateSchema: StateSchema = {
    loopName: { name: 'loopName', reducer: reducers.overwrite(), default: '' },
    pattern: { name: 'pattern', reducer: reducers.overwrite(), default: 'daily-triage' },
    autonomyLevel: { name: 'autonomyLevel', reducer: reducers.overwrite(), default: 'L1' },
    tasksDiscovered: { name: 'tasksDiscovered', reducer: reducers.overwrite(), default: 0 },
    tasksCompleted: { name: 'tasksCompleted', reducer: reducers.overwrite(), default: 0 },
    tasksBlocked: { name: 'tasksBlocked', reducer: reducers.overwrite(), default: 0 },
    currentIteration: { name: 'currentIteration', reducer: reducers.overwrite(), default: 0 },
    repair: { name: 'repair', reducer: reducers.overwrite(), default: false },
  }

  return {
    id: loop.id,
    name: loop.name,
    description: loop.goal,
    stateSchema,
    nodes,
    edges,
    entryNode: loop.stage === 'scheduling' ? 'discovery' : loop.stage,
    maxSteps: loop.stats.totalIterations * 5 + 10,
    budget: { maxCost: loop.budget.maxCostTotal, maxTokens: 0 },
  }
}

/** 把 LoopEvent 映射为 GraphEvent */
export function loopEventToGraphEvent(event: LoopEvent, loopId: string): GraphEvent | null {
  const ts = (event as any).ts ?? new Date().toISOString()
  const threadId = `thread-${loopId}`

  switch (event.type) {
    case 'loop.created':
      return { type: 'graph.started', graphId: loopId, threadId, ts }
    case 'loop.stage-transition': {
      const from = (event as any).from as string
      const to = (event as any).to as string
      return { type: 'graph.node-complete', graphId: loopId, threadId, nodeId: from, step: 0, result: { goto: [to] }, ts }
    }
    case 'loop.task-discovered':
      return { type: 'graph.node-complete', graphId: loopId, threadId, nodeId: 'discovery', step: 0, result: { update: { tasksDiscovered: 1 } }, ts }
    case 'loop.task-handed-off':
      return { type: 'graph.node-complete', graphId: loopId, threadId, nodeId: 'handoff', step: 0, result: { update: {} }, ts }
    case 'loop.verification-complete': {
      const passed = (event as any).passed as boolean
      return { type: 'graph.node-complete', graphId: loopId, threadId, nodeId: 'validation', step: 0, result: { update: { repair: !passed } }, ts }
    }
    case 'loop.persisted':
      return { type: 'graph.node-complete', graphId: loopId, threadId, nodeId: 'persistence', step: 0, result: { update: {} }, ts }
    case 'loop.tick-complete': {
      const stats = (event as any).stats
      return { type: 'graph.step-complete', graphId: loopId, threadId, step: 0, state: stats, ts }
    }
    case 'loop.budget-warning':
      return { type: 'graph.node-error', graphId: loopId, threadId, nodeId: 'scheduling', step: 0, error: `budget ${((event as any).spent / (event as any).limit * 100).toFixed(0)}%`, ts }
    case 'loop.stuck':
      return { type: 'graph.node-error', graphId: loopId, threadId, nodeId: (event as any).reason, step: 0, error: (event as any).reason, ts }
    case 'loop.completed': {
      const stats = (event as any).finalStats
      return { type: 'graph.completed', graphId: loopId, threadId, finalState: stats, totalCost: stats?.totalCost ?? 0, ts }
    }
    default:
      return null
  }
}

/** 把 LoopEvent 列表映射为 GraphEvent 列表 */
export function loopEventsToGraphEvents(events: LoopEvent[], loopId: string): GraphEvent[] {
  return events
    .map(e => loopEventToGraphEvent(e, loopId))
    .filter((e): e is GraphEvent => e !== null)
}
