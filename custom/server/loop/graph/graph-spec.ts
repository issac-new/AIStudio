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
  /** P4：人类可读描述（模板卡/编辑器标题栏） */
  description?: string
  /** P4：模板语义元数据——随实例化携带（goal/权限档/敏感清单/worktree 策略/门禁命令） */
  meta?: GraphSpecMeta
  /** P4：loop 容器可视化元数据（子图框 + 迭代徽标）；环本身仍由守卫回边表达 */
  containers?: SpecContainer[]
  /** P4：spec 来源——'editor'=画布编辑器自建（可编辑/可删），'template'=loop 编译模板（只读） */
  origin?: 'editor' | 'template'
}

export interface SpecContainer {
  id: string
  label?: string
  nodeIds: string[]
}

export interface GraphSpecMeta {
  goal?: string
  cron?: string
  permissionLevel?: string
  sensitivePaths?: string[]
  worktreePolicy?: 'auto' | 'manual' | 'shared'
  gateCommands?: string[]
}

/** P4 编辑守卫——警告级问题（不阻断 hydrate，编辑器实时渲染；错误级仍走 validateGraphSpec throw） */
export interface SpecWarning {
  code:
    | 'branch-cross-edge'    // §7B.3 铁律② 分支间无顺序保证且不可互相依赖
    | 'branch-escape-edge'   // §7B.3 铁律③ 分支产物不回写主上下文
    | 'fanout-no-converge'   // §7B.3 铁律④ 分支必须收敛到 join
    | 'mainline-to-branch'   // §7B.3 铁律① 主流程上下文不进分支
    | 'no-end-condition'     // 无终止配置（endCondition 与守卫环皆缺 → 只能靠 maxSteps 截停）
  message: string
  edgeIndex?: number
  nodeId?: string
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
  // P4 元数据校验：容器引用/归属、origin 枚举
  if (spec.containers) {
    const seenContainerIds = new Set<string>()
    const nodeOwner = new Map<string, string>()
    for (const c of spec.containers) {
      if (seenContainerIds.has(c.id)) throw new GraphSpecError(`Duplicate container id: ${c.id}`)
      seenContainerIds.add(c.id)
      for (const nodeId of c.nodeIds) {
        if (!nodeIds.has(nodeId)) throw new GraphSpecError(`Container ${c.id} references unknown node: ${nodeId}`)
        const owner = nodeOwner.get(nodeId)
        if (owner) throw new GraphSpecError(`Node "${nodeId}" belongs to multiple containers (${owner}, ${c.id})`)
        nodeOwner.set(nodeId, c.id)
      }
    }
  }
  if (spec.origin !== undefined && spec.origin !== 'editor' && spec.origin !== 'template') {
    throw new GraphSpecError(`Invalid spec origin: ${spec.origin} (expected 'editor' | 'template')`)
  }
}

/** P4 死图检测（spec §7B.3 并行分支铁律四条 + 终止性提示）。
 *  只分析无条件前向边（排除守卫回边与谓词路由边——路由菱形不是并行分支）；
 *  fan-out = ≥2 条无条件出边的节点。分支集 = 独占可达集（含自身），
 *  join = 最近的非 target 公共后代；已划入外层分支的节点不再作独立 fan-out 分析
 *  （嵌套结构由外层覆盖）。纯警告不 throw——编辑器逐键调用渲染，保存门禁仍由
 *  validateGraphSpec 承担。 */
export function analyzeGraphSpec(spec: GraphSpec): SpecWarning[] {
  const warnings: SpecWarning[] = []
  const back = collectBackEdges(spec.edges, spec.nodes.map(n => n.id), spec.entryNode)
  // 无条件前向边：守卫回边（环）与谓词路由边（条件分叉）都不参与并行分支分析
  const forward: Array<{ e: EdgeSpec; i: number }> = spec.edges
    .map((e, i) => ({ e, i }))
    .filter(x => !back.has(x.i) && !x.e.condition)
  const out = new Map<string, Array<{ e: EdgeSpec; i: number }>>()
  for (const f of forward) {
    if (!out.has(f.e.from)) out.set(f.e.from, [])
    out.get(f.e.from)!.push(f)
  }
  /** start 出发沿无条件前向边可达集（含 start；其他 target 作叶子——计入但不穿越） */
  function reachInclude(start: string, otherTargets: Set<string>, stop: string | null): Set<string> {
    const seen = new Set<string>([start])
    const queue = [start]
    while (queue.length > 0) {
      const u = queue.shift()!
      for (const { e } of out.get(u) ?? []) {
        if (e.to === stop || seen.has(e.to)) continue
        seen.add(e.to)
        if (!otherTargets.has(e.to)) queue.push(e.to)
      }
    }
    return seen
  }
  /** BFS 距离表（无条件前向），join 取公共后代中距 fan-out 最近者 */
  function distancesFrom(start: string): Map<string, number> {
    const dist = new Map<string, number>([[start, 0]])
    const queue = [start]
    while (queue.length > 0) {
      const u = queue.shift()!
      for (const { e } of out.get(u) ?? []) {
        if (dist.has(e.to)) continue
        dist.set(e.to, dist.get(u)! + 1)
        queue.push(e.to)
      }
    }
    return dist
  }

  // fan-out 按距入口 BFS 升序处理（外层先分析，其分支区间 covered 后内层不再独立
  // 分析——嵌套/区间内节点不构成独立 fan-out，避免把汇合+逃逸边误判成分叉）
  const covered = new Set<string>()
  const fanouts: Array<[string, Array<{ e: EdgeSpec; i: number }>]> = [...out.entries()]
    .filter(([, outs]) => new Set(outs.map(x => x.e.to)).size >= 2)
  if (fanouts.length > 0) {
    const entryDist = distancesFrom(spec.entryNode)
    fanouts.sort((a, b) => (entryDist.get(a[0]) ?? Infinity) - (entryDist.get(b[0]) ?? Infinity))
  }
  for (const [fanoutId, outs] of fanouts) {
    if (covered.has(fanoutId)) continue
    const targets = [...new Set(outs.map(x => x.e.to))]
    const reachSets = targets.map(t => reachInclude(t, new Set(targets.filter(x => x !== t)), fanoutId))
    let commonLoose = reachSets[0]
    for (const s of reachSets.slice(1)) commonLoose = new Set([...commonLoose].filter(x => s.has(x)))
    if (commonLoose.size === 0) {
      warnings.push({
        code: 'fanout-no-converge',
        nodeId: fanoutId,
        message: `fan-out "${fanoutId}" 的分支没有公共汇合点（分支必须收敛到 join）`,
      })
      for (const t of targets) covered.add(t)
      continue
    }
    const commonStrict = new Set([...commonLoose].filter(x => !targets.includes(x)))
    if (commonStrict.size === 0) continue // 收敛点即 target（零长分支/路由捷径）——合法形态，不告警
    const dist = distancesFrom(fanoutId)
    const join = [...commonStrict].sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity))[0]
    const branchSets = targets.map((t, i) => {
      const exclusive = new Set<string>([t])
      for (const x of reachSets[i]) {
        if (reachSets.every((r, j) => j === i || !r.has(x))) exclusive.add(x)
      }
      return exclusive
    })
    for (const { e, i } of forward) {
      if (e.from === fanoutId) continue
      const fromBranch = branchSets.findIndex(b => b.has(e.from))
      if (fromBranch !== -1) {
        if (e.to === join) continue // 正常汇合
        const toBranch = branchSets.findIndex(b => b.has(e.to))
        if (toBranch !== -1 && toBranch !== fromBranch) {
          warnings.push({
            code: 'branch-cross-edge',
            edgeIndex: i,
            message: `分支间互连边 ${e.from} -> ${e.to}（分支间无顺序保证，不可互相依赖）`,
          })
        } else if (toBranch === -1) {
          warnings.push({
            code: 'branch-escape-edge',
            edgeIndex: i,
            message: `分支逃逸边 ${e.from} -> ${e.to}（绕过 join ${join}，分支产物不得回写主上下文）`,
          })
        }
      } else if (branchSets.some(b => b.has(e.to))) {
        warnings.push({
          code: 'mainline-to-branch',
          edgeIndex: i,
          message: `主流程边 ${e.from} -> ${e.to} 直入并行分支（主流程上下文不进分支）`,
        })
      }
    }
    for (const b of branchSets) for (const n of b) covered.add(n)
  }
  if (!spec.endCondition && !spec.edges.some(e => e.guard)) {
    warnings.push({
      code: 'no-end-condition',
      message: '无终止配置：endCondition 缺失且无守卫环，run 只能靠 limits.maxSteps 截停',
    })
  }
  return warnings
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
    description: spec.description ?? '',
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
