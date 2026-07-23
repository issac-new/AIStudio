// overlay/custom/server/loop/graph/loop-to-graph.ts
// Loop-to-Graph 映射器 — 把 LoopInstance 映射为 GraphInstance + GraphDef
//
// 核心概念：
//   一个 Loop = 图中的一个 loop-node（5 阶段为子节点）
//   Loop 的 5 阶段（discovery→handoff→validation→persistence→scheduling）= 图的 5 个节点
//   Loop 的事件流 = 图的轨迹
//   Loop 的 stage = 图的当前执行位置

import type { LoopInstance, LoopEvent } from '../types'
import type { GraphInstance, GraphDef, NodeDef, EdgeDef, StateSchema, GraphEvent } from './types'
import { reducers } from './types'

const STAGES = ['discovery', 'handoff', 'validation', 'persistence', 'scheduling'] as const

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

/** 把 LoopInstance 映射为 GraphDef（5 阶段为节点） */
export function loopToGraphDef(loop: LoopInstance): GraphDef {
  const nodes = new Map<string, NodeDef>()

  // 为每个阶段创建节点
  for (const stage of STAGES) {
    nodes.set(stage, {
      id: stage,
      type: 'loop',
      label: stage,
      execute: async () => ({ update: {} }),
    })
  }

  // 添加验证失败 → 回退交接的 repair 边
  const edges: EdgeDef[] = [
    { source: 'discovery', target: 'handoff' },
    { source: 'handoff', target: 'validation' },
    { source: 'validation', target: 'persistence' },
    { source: 'persistence', target: 'scheduling' },
    // 动态 repair 边：验证失败 → 回交接
    { source: 'validation', target: 'handoff', condition: (state) => (state.repair as boolean) ? 'handoff' : null, label: 'repair' },
    // 调度 → 下一 tick 回发现（循环）
    { source: 'scheduling', target: 'discovery', label: 'next tick' },
  ]

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
