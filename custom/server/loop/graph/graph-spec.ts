// overlay/custom/server/loop/graph/graph-spec.ts
// GraphSpec — 可 JSON 序列化的图定义 DSL（函数零内联）
// hydrate: GraphSpec + NodeRegistry → GraphDef（运行时内存模型）

import type { GraphDef, EdgeDef, LoopGuard, NodeErrorRoute, JoinMode, StateSchema, StateValues } from './types'
import { reducers } from './types'
import { evaluatePredicate, type PredicateExpr } from './predicate'
import type { NodeRegistry } from './node-registry'

export interface NodeSpec {
  id: string
  type: string
  config: Record<string, unknown>
  retry?: { maxAttempts: number; backoffMs: number }
  timeoutMs?: number
  onError?: NodeErrorRoute
  joinMode?: JoinMode
}

export interface EdgeSpec {
  from: string
  to: string
  condition?: PredicateExpr
  guard?: LoopGuard
  label?: string
}

export interface GraphSpec {
  id: string
  version: number
  channels: Record<string, { reducer: keyof typeof reducers | string; default?: unknown }>
  nodes: NodeSpec[]
  edges: EdgeSpec[]
  entryNode: string
  endCondition?: PredicateExpr
  limits: { maxSteps: number; maxCost?: number; maxDurationMs?: number }
}

export class GraphSpecError extends Error {}

/** 自定义 reducer 表：appendById 等领域 reducer 经此注入（默认仅内置 reducers 合法） */
export type CustomReducers = Record<string, (old: any, next: any) => any>

/** 静态拓扑：DFS 识别回边（v 是 u 的祖先，或自环），返回回边在 edges 中的下标集合。
 *  导出供 GraphBuilder.build() 复用（内存 GraphDef 的轻量环检测）。 */
export function collectBackEdges(edges: Array<{ from: string; to: string }>, nodeIds: string[], entryNode: string): Set<number> {
  const adj = new Map<string, number[]>()
  edges.forEach((e, i) => {
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push(i)
  })
  const visited = new Set<string>()
  const onStack = new Set<string>()
  const back = new Set<number>()
  function dfs(u: string) {
    visited.add(u)
    onStack.add(u)
    for (const i of adj.get(u) ?? []) {
      const v = edges[i].to
      if (onStack.has(v)) back.add(i) // 含自环（v === u 时 u 必在栈上）
      else if (!visited.has(v)) dfs(v)
    }
    onStack.delete(u)
  }
  dfs(entryNode)
  for (const id of nodeIds) if (!visited.has(id)) dfs(id) // 覆盖入口不可达的残留分量
  return back
}

export function validateGraphSpec(spec: GraphSpec, customReducers?: CustomReducers): void {
  const nodeIds = new Set(spec.nodes.map(n => n.id))
  if (nodeIds.size !== spec.nodes.length) throw new GraphSpecError('Duplicate node id')
  if (!nodeIds.has(spec.entryNode)) throw new GraphSpecError(`Entry node not found: ${spec.entryNode}`)
  for (const [name, ch] of Object.entries(spec.channels)) {
    // f1 台账：按自有属性判定——'constructor'/'toString' 等原型链键不得伪装成合法 reducer
    if (!Object.hasOwn(reducers, ch.reducer) && !(customReducers && Object.hasOwn(customReducers, ch.reducer))) {
      throw new GraphSpecError(`Unknown reducer "${ch.reducer}" on channel "${name}"`)
    }
  }
  for (const e of spec.edges) {
    if (!nodeIds.has(e.from)) throw new GraphSpecError(`Edge from unknown node: ${e.from}`)
    if (!nodeIds.has(e.to)) throw new GraphSpecError(`Edge to unknown node: ${e.to}`)
    if (e.guard && (!Number.isInteger(e.guard.maxIterations) || e.guard.maxIterations < 1)) {
      throw new GraphSpecError(`guard.maxIterations must be >= 1 on edge ${e.from}->${e.to}`)
    }
  }
  // f4 台账：onError goto/retry-goto 的 target 是 fail-branch 的运行时路由目标，编译期可校验
  for (const n of spec.nodes) {
    if (n.onError && n.onError.type !== 'fail' && !nodeIds.has(n.onError.target)) {
      throw new GraphSpecError(`onError target unknown node "${n.onError.target}" on node "${n.id}"`)
    }
  }
  // 回边必须带 guard：DFS 树中后代指向祖先的边（含自环）构成环的闭合边
  const backEdges = collectBackEdges(spec.edges, spec.nodes.map(n => n.id), spec.entryNode)
  spec.edges.forEach((e, i) => {
    if (backEdges.has(i) && !e.guard) {
      throw new GraphSpecError(`Unguarded back edge: ${e.from} -> ${e.to} (cycle requires guard.maxIterations)`)
    }
  })
  // 可达性：除入口外，每个节点至少一条入边
  const inbound = new Set(spec.edges.map(e => e.to))
  for (const n of spec.nodes) {
    if (n.id !== spec.entryNode && !inbound.has(n.id)) {
      throw new GraphSpecError(`Unreachable node (no inbound edge): ${n.id}`)
    }
  }
  if (!Number.isInteger(spec.limits.maxSteps) || spec.limits.maxSteps < 1) {
    throw new GraphSpecError('limits.maxSteps must be >= 1')
  }
}

/** 把 GraphSpec 装配为运行时 GraphDef（PredicateExpr 编译为闭包，节点经 registry 装配） */
export function hydrateGraphSpec(spec: GraphSpec, registry: NodeRegistry, customReducers?: CustomReducers): GraphDef {
  validateGraphSpec(spec, customReducers)
  const stateSchema: StateSchema = {}
  for (const [name, ch] of Object.entries(spec.channels)) {
    const custom = customReducers?.[ch.reducer as string]
    const reducerFactory = (reducers as Record<string, () => unknown>)[ch.reducer as string]
    const reducer = custom ?? (reducerFactory ? reducerFactory() : undefined)
    if (!reducer) throw new GraphSpecError(`Unknown reducer "${ch.reducer}" on channel "${name}"`)
    stateSchema[name] = {
      name,
      reducer: reducer as never,
      default: ch.default,
    }
  }
  const nodes = new Map()
  for (const n of spec.nodes) {
    const def = registry.create(n.type, { ...n.config, id: n.id })
    nodes.set(n.id, {
      ...def,
      retry: n.retry ?? def.retry,
      timeout: n.timeoutMs ?? def.timeout,
      onError: n.onError,
      joinMode: n.joinMode,
    })
  }
  const edges: EdgeDef[] = spec.edges.map(e => ({
    source: e.from,
    target: e.to,
    label: e.label,
    guard: e.guard,
    condition: e.condition
      ? (state: StateValues) => (evaluatePredicate(e.condition!, state) ? e.to : null)
      : undefined,
  }))
  return {
    id: spec.id,
    name: spec.id,
    description: '',
    stateSchema,
    nodes,
    edges,
    entryNode: spec.entryNode,
    endCondition: spec.endCondition ? (s: StateValues) => evaluatePredicate(spec.endCondition!, s) : undefined,
    maxSteps: spec.limits.maxSteps,
    maxDurationMs: spec.limits.maxDurationMs,
    budget: spec.limits.maxCost !== undefined ? { maxCost: spec.limits.maxCost, maxTokens: 0 } : undefined,
  }
}
