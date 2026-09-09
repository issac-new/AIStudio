# P0：Graph 内核补完（守卫回边 DAG + 有限终止 + 事件日志持久化 + interrupt 闭环）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `overlay/custom/server/loop/graph/` 的 LangGraph 风格内核（当前约 50% 完成、仅测试引用）补完为生产可用的图执行内核：可 JSON 序列化的 GraphSpec DSL、守卫回边（guarded back edge）+ 四层终止防御、SQLite append-only 执行事件日志作为事实源、真 checkpoint/resume、interrupt 人机闭环、join 屏障、fail-branch、Send 真并行。

**Architecture:** 在现有 `custom/server/loop/graph/` 原地演进（P0 不做目录搬迁，搬迁留给 P1 切换时一并做，避免 patch 134 的 import 路径中途失效）。新增四个模块：`graph-spec.ts`（JSON DSL + 校验）、`predicate.ts`（声明式谓词求值）、`event-log-store.ts`（SQLite 日志 + checkpoint 快照）、`graph-service.ts`（Run 注册表 + resume 闭环）；改造 `graph-runtime.ts`（守卫/屏障/预算/fail-branch/Send 并行/事件日志接线）。存储默认 `better-sqlite3`（同步 API、Electron 友好），测试与默认路径用 `:memory:`；无 better-sqlite3 时降级为内存实现（同一接口）。

**Tech Stack:** TypeScript / Vitest（既有配置，`npm test`，include `custom/**/*.test.ts`）/ better-sqlite3（可选依赖）/ 无其他新依赖。

## Global Constraints

- **上游零污染**：只改 `overlay/custom/` 与 `overlay/docs/`、`overlay/package.json`；禁止触碰 `upstream/`。
- 测试命令统一 `cd overlay && npm test`；只跑 `custom/**/*.test.ts`（vitest.config.ts 已限定）。
- 服务端源码被测试经**相对路径**引用（`../../../../server/loop/graph/...`），P0 保持该模式。
- 所有新事件必须同时写入 EventLogStore（若装配）——emitEvent 与日志追加是同一调用点，禁止旁路。
- 序列化纪律：GraphSpec / PredicateExpr / 事件 payload 一律纯 JSON；函数不得出现在可序列化结构中。
- 现有 10 个 graph-runtime 测试 + 10 个 loop-to-graph 测试必须保持全绿（行为兼容或显式更新测试）。
- 命名沿用现状：`GraphRuntime` / `GraphBuilder` / `ChannelStore` 类名不变；新类型用 `GraphSpec`/`EdgeSpec`/`NodeSpec` 与运行时内存模型 `GraphDef`/`EdgeDef`/`NodeDef` 区分。

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `custom/server/loop/graph/predicate.ts` | 声明式谓词求值（PredicateExpr → boolean / 路由目标） | 新建 |
| `custom/server/loop/graph/graph-spec.ts` | GraphSpec 类型 + validateGraphSpec（含无 guard 环拒绝）+ hydrate（GraphSpec→GraphDef） | 新建 |
| `custom/server/loop/graph/event-log-store.ts` | EventLogStore 接口 + InMemoryEventLogStore + SqliteEventLogStore（可选 better-sqlite3） | 新建 |
| `custom/server/loop/graph/types.ts` | 扩展：EdgeDef.guard、NodeDef.onError/joinMode、GraphDef.maxDurationMs、GraphEvent 新 kind | 修改 |
| `custom/server/loop/graph/graph-definition.ts` | GraphBuilder 支持 guard/onError/joinMode/maxDurationMs；build() 调校验 | 修改 |
| `custom/server/loop/graph/graph-runtime.ts` | 守卫回边、L4 预算、__remainingSteps、join 屏障、fail-branch、Send 真并行、事件日志、真 resume | 修改（核心） |
| `custom/server/loop/graph/checkpoint-manager.ts` | 改为 EventLogStore 驱动的真快照读写 + fork | 重写 |
| `custom/server/loop/graph/node-registry.ts` | hydrate 支持：补 human/subgraph 真实现，loop/retrieval 标注 P1 | 修改 |
| `custom/server/loop/graph/graph-service.ts` | GraphService：Run 注册表、start/resume/fork 闭环、awaiting-input 管理 | 新建 |
| `custom/client/loop/graph/__tests__/` | 新增 5 个测试文件 + 更新 graph-runtime.test.ts | 新建/修改 |

---

### Task 1: PredicateExpr 谓词求值器

**Files:**
- Create: `custom/server/loop/graph/predicate.ts`
- Test: `custom/client/loop/graph/__tests__/predicate.test.ts`

**Interfaces:**
- Produces:
  - `type PredicateExpr = { op: 'cmp'; path: string; cmp: 'eq'|'ne'|'gt'|'gte'|'lt'|'lte'; value: unknown } | { op: 'and'|'or'; exprs: PredicateExpr[] } | { op: 'not'; expr: PredicateExpr } | { op: 'truthy'; path: string } | { op: 'exists'; path: string }`
  - `evaluatePredicate(expr: PredicateExpr, state: StateValues): boolean`
  - `getPath(state: unknown, path: string): unknown`（点路径取值，`a.b.0.c`）
- Consumes: `StateValues` from `./types`

- [ ] **Step 1: 写失败测试** `custom/client/loop/graph/__tests__/predicate.test.ts`

```typescript
// overlay/custom/client/loop/graph/__tests__/predicate.test.ts
import { describe, it, expect } from 'vitest'
import { evaluatePredicate, getPath } from '../../../../server/loop/graph/predicate'
import type { PredicateExpr } from '../../../../server/loop/graph/predicate'

describe('getPath', () => {
  it('resolves dot paths including array index', () => {
    const s = { a: { b: [{ c: 42 }] }, x: 0, y: false, z: null }
    expect(getPath(s, 'a.b.0.c')).toBe(42)
    expect(getPath(s, 'x')).toBe(0)
    expect(getPath(s, 'y')).toBe(false)
    expect(getPath(s, 'missing.deep')).toBeUndefined()
  })
})

describe('evaluatePredicate', () => {
  const state = { count: 3, name: 'loop', tags: ['a'], verdict: { passed: true } }

  it('cmp operators', () => {
    expect(evaluatePredicate({ op: 'cmp', path: 'count', cmp: 'gte', value: 3 }, state)).toBe(true)
    expect(evaluatePredicate({ op: 'cmp', path: 'count', cmp: 'gt', value: 3 }, state)).toBe(false)
    expect(evaluatePredicate({ op: 'cmp', path: 'name', cmp: 'eq', value: 'loop' }, state)).toBe(true)
    expect(evaluatePredicate({ op: 'cmp', path: 'name', cmp: 'ne', value: 'loop' }, state)).toBe(false)
    expect(evaluatePredicate({ op: 'cmp', path: 'count', cmp: 'lt', value: 5 }, state)).toBe(true)
  })

  it('and / or / not composition', () => {
    const andExpr: PredicateExpr = {
      op: 'and',
      exprs: [
        { op: 'cmp', path: 'count', cmp: 'gte', value: 3 },
        { op: 'truthy', path: 'verdict.passed' },
      ],
    }
    expect(evaluatePredicate(andExpr, state)).toBe(true)
    expect(evaluatePredicate({ op: 'not', expr: andExpr }, state)).toBe(false)
    const orExpr: PredicateExpr = {
      op: 'or',
      exprs: [
        { op: 'cmp', path: 'count', cmp: 'gt', value: 100 },
        { op: 'exists', path: 'tags' },
      ],
    }
    expect(evaluatePredicate(orExpr, state)).toBe(true)
  })

  it('truthy treats 0/false/null/undefined as false', () => {
    expect(evaluatePredicate({ op: 'truthy', path: 'count' }, { count: 0 })).toBe(false)
    expect(evaluatePredicate({ op: 'truthy', path: 'count' }, { count: 1 })).toBe(true)
    expect(evaluatePredicate({ op: 'truthy', path: 'nope' }, {})).toBe(false)
  })

  it('missing path in cmp returns false (never throws)', () => {
    expect(evaluatePredicate({ op: 'cmp', path: 'a.b.c', cmp: 'eq', value: 1 }, {})).toBe(false)
  })

  it('malformed expr throws PredicateError with op name', () => {
    expect(() => evaluatePredicate({ op: 'cmp', path: 'x', cmp: 'bad' as never, value: 1 }, {}))
      .toThrow(/cmp/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/predicate.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `custom/server/loop/graph/predicate.ts`

```typescript
// overlay/custom/server/loop/graph/predicate.ts
// PredicateExpr — 声明式谓词（纯 JSON 可序列化，无任意代码求值）
// 用途：条件边 / endCondition / breakCondition / guard —— 所有"可进数据库"的判定逻辑

import type { StateValues } from './types'

export type PredicateExpr =
  | { op: 'cmp'; path: string; cmp: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: unknown }
  | { op: 'and' | 'or'; exprs: PredicateExpr[] }
  | { op: 'not'; expr: PredicateExpr }
  | { op: 'truthy'; path: string }
  | { op: 'exists'; path: string }

export class PredicateError extends Error {}

/** 点路径取值：'a.b.0.c'。任何一段缺失/越界返回 undefined，不抛。 */
export function getPath(state: unknown, path: string): unknown {
  let cur: unknown = state
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      const idx = Number(seg)
      if (!Number.isInteger(idx)) return undefined
      cur = cur[idx]
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}

export function evaluatePredicate(expr: PredicateExpr, state: StateValues): boolean {
  switch (expr.op) {
    case 'cmp': {
      const actual = getPath(state, expr.path)
      if (actual === undefined) return false
      switch (expr.cmp) {
        case 'eq': return actual === expr.value
        case 'ne': return actual !== expr.value
        case 'gt': return (actual as number) > (expr.value as number)
        case 'gte': return (actual as number) >= (expr.value as number)
        case 'lt': return (actual as number) < (expr.value as number)
        case 'lte': return (actual as number) <= (expr.value as number)
        default: throw new PredicateError(`Unknown cmp operator: ${String(expr.cmp)}`)
      }
    }
    case 'and': return expr.exprs.every(e => evaluatePredicate(e, state))
    case 'or': return expr.exprs.some(e => evaluatePredicate(e, state))
    case 'not': return !evaluatePredicate(expr.expr, state)
    case 'truthy': return Boolean(getPath(state, expr.path))
    case 'exists': return getPath(state, expr.path) !== undefined
    default: throw new PredicateError(`Unknown predicate op: ${String((expr as { op: unknown }).op)}`)
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/predicate.test.ts`
Expected: PASS（6 例）

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/graph/predicate.ts custom/client/loop/graph/__tests__/predicate.test.ts
git commit -m "feat(graph): 声明式谓词求值器 PredicateExpr"
```

---

### Task 2: GraphSpec DSL + 校验 + hydrate

**Files:**
- Create: `custom/server/loop/graph/graph-spec.ts`
- Modify: `custom/server/loop/graph/types.ts`（新增守卫/屏障/错误路由类型）
- Test: `custom/client/loop/graph/__tests__/graph-spec.test.ts`

**Interfaces:**
- Consumes: `PredicateExpr`/`evaluatePredicate`（Task 1）；`NodeRegistry`（node-registry.ts，本任务只依赖其接口 `create(type, config): NodeDef`，P0 稍后在 Task 7 补真实现）
- Produces（后续任务依赖的确切名字）:
  - `interface LoopGuard { maxIterations: number; breakCondition?: PredicateExpr }`
  - `interface NodeErrorRoute { type: 'fail' } | { type: 'goto'; target: string } | { type: 'retry-goto'; target: string; maxAttempts: number }`
  - `type JoinMode = 'all' | 'any'`
  - `interface NodeSpec { id: string; type: string; config: Record<string, unknown>; retry?: {maxAttempts:number;backoffMs:number}; timeoutMs?: number; onError?: NodeErrorRoute; joinMode?: JoinMode }`
  - `interface EdgeSpec { from: string; to: string; condition?: PredicateExpr; guard?: LoopGuard; label?: string }`
  - `interface GraphSpec { id: string; version: number; channels: Record<string,{reducer:string;default?:unknown}>; nodes: NodeSpec[]; edges: EdgeSpec[]; entryNode: string; endCondition?: PredicateExpr; limits: { maxSteps: number; maxCost?: number; maxDurationMs?: number } }`
  - `class GraphSpecError extends Error`
  - `validateGraphSpec(spec: GraphSpec): void`（抛 GraphSpecError；规则见测试）
  - `hydrateGraphSpec(spec: GraphSpec, registry: NodeRegistry): GraphDef`（边条件/终止条件由 PredicateExpr 编译为闭包；节点由 registry 按 type+config 装配；guard/onError/joinMode 透传到 EdgeDef/NodeDef）

types.ts 的扩展（保持既有内容不动，仅追加/修改下列成员）：

```typescript
// EdgeDef 增加：
//   guard?: LoopGuard                      // 回边守卫（from 的后代指向祖先时必填）
// NodeDef 增加：
//   onError?: NodeErrorRoute               // 失败路由（默认 fail）
//   joinMode?: 'all' | 'any'               // 多入边激活语义（默认 'all'）
// GraphDef 增加：
//   maxDurationMs?: number                 // L4 时长守卫
//   edges 中 condition 的来源可以是 PredicateExpr 编译结果（类型不变：EdgeCondition 函数）
```

- [ ] **Step 1: 写失败测试** `custom/client/loop/graph/__tests__/graph-spec.test.ts`

```typescript
// overlay/custom/client/loop/graph/__tests__/graph-spec.test.ts
import { describe, it, expect } from 'vitest'
import {
  validateGraphSpec, hydrateGraphSpec, GraphSpecError,
  type GraphSpec,
} from '../../../../server/loop/graph/graph-spec'
import { NodeRegistry } from '../../../../server/loop/graph/node-registry'
import { reducers } from '../../../../server/loop/graph/types'

function baseSpec(): GraphSpec {
  return {
    id: 'g1', version: 1,
    channels: { count: { reducer: 'overwrite', default: 0 } },
    nodes: [
      { id: 'a', type: 'function', config: { execute: 'noop' } },
      { id: 'b', type: 'function', config: { execute: 'noop' } },
    ],
    edges: [{ from: 'a', to: 'b' }],
    entryNode: 'a',
    limits: { maxSteps: 50 },
  }
}

describe('validateGraphSpec', () => {
  it('accepts a valid DAG', () => {
    expect(() => validateGraphSpec(baseSpec())).not.toThrow()
  })

  it('rejects missing entry node', () => {
    const s = baseSpec(); s.entryNode = 'nope'
    expect(() => validateGraphSpec(s)).toThrow(GraphSpecError)
  })

  it('rejects edge referencing unknown node', () => {
    const s = baseSpec(); s.edges.push({ from: 'a', to: 'ghost' })
    expect(() => validateGraphSpec(s)).toThrow(/ghost/)
  })

  it('rejects unknown channel reducer name', () => {
    const s = baseSpec(); s.channels.bad = { reducer: 'nope' as never }
    expect(() => validateGraphSpec(s)).toThrow(GraphSpecError)
  })

  it('accepts a guarded back edge (cycle with guard)', () => {
    const s = baseSpec()
    s.edges.push({ from: 'b', to: 'a', guard: { maxIterations: 3 } })
    expect(() => validateGraphSpec(s)).not.toThrow()
  })

  it('rejects an unguarded back edge', () => {
    const s = baseSpec()
    s.edges.push({ from: 'b', to: 'a' })
    expect(() => validateGraphSpec(s)).toThrow(/guard/i)
  })

  it('rejects guard.maxIterations < 1', () => {
    const s = baseSpec()
    s.edges.push({ from: 'b', to: 'a', guard: { maxIterations: 0 } })
    expect(() => validateGraphSpec(s)).toThrow(GraphSpecError)
  })

  it('rejects unreachable node (not entry, no inbound)', () => {
    const s = baseSpec()
    s.nodes.push({ id: 'orphan', type: 'function', config: {} })
    expect(() => validateGraphSpec(s)).toThrow(/orphan/)
  })
})

describe('hydrateGraphSpec', () => {
  function registry(): NodeRegistry {
    const r = new NodeRegistry()
    r.register('function', (config) => ({
      id: config.id as string,
      type: 'function' as const,
      label: (config.id as string),
      execute: async () => ({ update: {} }),
    }))
    return r
  }

  it('produces GraphDef with compiled predicate edges', () => {
    const s = baseSpec()
    s.edges = [{ from: 'a', to: 'b', condition: { op: 'cmp', path: 'count', cmp: 'gte', value: 1 } }]
    s.endCondition = { op: 'truthy', path: 'done' }
    const def = hydrateGraphSpec(s, registry())
    expect(def.id).toBe('g1')
    expect(def.maxSteps).toBe(50)
    expect(def.nodes.has('a')).toBe(true)
    expect(def.stateSchema.count.reducer(1, 2)).toBe(2) // overwrite
    const edge = def.edges[0]
    expect(typeof edge.condition).toBe('function')
    expect(edge.condition!({ count: 1 })).toBe('b')
    expect(edge.condition!({ count: 0 })).toBe(null)
    expect(def.endCondition!({ done: true })).toBe(true)
    expect(def.endCondition!({})).toBe(false)
  })

  it('carries guard/onError/joinMode into runtime defs', () => {
    const s = baseSpec()
    s.edges.push({ from: 'b', to: 'a', guard: { maxIterations: 2 } })
    s.nodes[1].onError = { type: 'goto', target: 'a' }
    s.nodes[1].joinMode = 'any'
    const def = hydrateGraphSpec(s, registry())
    expect(def.edges[1].guard?.maxIterations).toBe(2)
    expect(def.nodes.get('b')!.onError).toEqual({ type: 'goto', target: 'a' })
    expect(def.nodes.get('b')!.joinMode).toBe('any')
  })

  it('throws for unknown node type', () => {
    const s = baseSpec(); s.nodes[0].type = 'mystery'
    expect(() => hydrateGraphSpec(s, registry())).toThrow(/mystery/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/graph-spec.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: types.ts 扩展**

在 `custom/server/loop/graph/types.ts` 追加（不改既有行）：

```typescript
// === 追加到 types.ts 顶部 import 之后 ===
import type { PredicateExpr } from './predicate'

/** 回边守卫：有限终止的循环级安全网 */
export interface LoopGuard {
  maxIterations: number
  breakCondition?: PredicateExpr
}

/** 节点失败路由 */
export type NodeErrorRoute =
  | { type: 'fail' }
  | { type: 'goto'; target: string }
  | { type: 'retry-goto'; target: string; maxAttempts: number }

/** 多入边激活语义：all=等全部前驱完成（默认） any=任一前驱完成即激活 */
export type JoinMode = 'all' | 'any'
```

修改 `EdgeDef` 增加 `guard?: LoopGuard`；`NodeDef` 增加 `onError?: NodeErrorRoute; joinMode?: JoinMode`；`GraphDef` 增加 `maxDurationMs?: number`。

- [ ] **Step 4: 实现** `custom/server/loop/graph/graph-spec.ts`

```typescript
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

/** 静态拓扑：判断 from 能否经边到达 to（用于识别回边） */
function reaches(edges: Array<{ from: string; to: string }>, from: string, to: string): boolean {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push(e.to)
  }
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === to) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const n of adj.get(cur) ?? []) stack.push(n)
  }
  return false
}

export function validateGraphSpec(spec: GraphSpec): void {
  const nodeIds = new Set(spec.nodes.map(n => n.id))
  if (nodeIds.size !== spec.nodes.length) throw new GraphSpecError('Duplicate node id')
  if (!nodeIds.has(spec.entryNode)) throw new GraphSpecError(`Entry node not found: ${spec.entryNode}`)
  for (const [name, ch] of Object.entries(spec.channels)) {
    if (!(ch.reducer in reducers)) throw new GraphSpecError(`Unknown reducer "${ch.reducer}" on channel "${name}"`)
  }
  for (const e of spec.edges) {
    if (!nodeIds.has(e.from)) throw new GraphSpecError(`Edge from unknown node: ${e.from}`)
    if (!nodeIds.has(e.to)) throw new GraphSpecError(`Edge to unknown node: ${e.to}`)
    if (e.guard && (!Number.isInteger(e.guard.maxIterations) || e.guard.maxIterations < 1)) {
      throw new GraphSpecError(`guard.maxIterations must be >= 1 on edge ${e.from}->${e.to}`)
    }
  }
  // 回边必须带 guard：e.to 能回到 e.from（含 e.to===e.from 自环）即构成环
  for (const e of spec.edges) {
    const isCycle = e.to === e.from || reaches(spec.edges, e.to, e.from)
    if (isCycle && !e.guard) {
      throw new GraphSpecError(`Unguarded back edge: ${e.from} -> ${e.to} (cycle requires guard.maxIterations)`)
    }
  }
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
export function hydrateGraphSpec(spec: GraphSpec, registry: NodeRegistry): GraphDef {
  validateGraphSpec(spec)
  const stateSchema: StateSchema = {}
  for (const [name, ch] of Object.entries(spec.channels)) {
    const reducerFactory = (reducers as Record<string, () => unknown>)[ch.reducer as string]
    stateSchema[name] = {
      name,
      reducer: reducerFactory() as never,
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
```

- [ ] **Step 5: 运行确认通过**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/graph-spec.test.ts`
Expected: PASS（12 例）

- [ ] **Step 6: Commit**

```bash
git add custom/server/loop/graph/predicate.ts custom/server/loop/graph/graph-spec.ts custom/server/loop/graph/types.ts custom/client/loop/graph/__tests__/graph-spec.test.ts
git commit -m "feat(graph): GraphSpec 可序列化 DSL + 守卫回边编译期校验 + hydrate"
```

---

### Task 3: EventLogStore（SQLite 事实源 + 内存实现）

**Files:**
- Create: `custom/server/loop/graph/event-log-store.ts`
- Test: `custom/client/loop/graph/__tests__/event-log-store.test.ts`

**Interfaces:**
- Produces:
  - `interface GraphLogEvent { seq: number; runId: string; graphId: string; ts: number; kind: string; nodeId?: string; iteration?: number; superStep?: number; payload: Record<string, unknown> }`
  - `interface EventLogStore { append(e: Omit<GraphLogEvent,'seq'>): Promise<number>; query(runId: string, opts?: {sinceSeq?: number; limit?: number; kind?: string}): Promise<GraphLogEvent[]>; latestSeq(runId: string): Promise<number>; count(runId: string): Promise<number> }`
  - `class InMemoryEventLogStore implements EventLogStore`
  - `createEventLogStore(sqlitePath?: string): EventLogStore`——有 better-sqlite3 且给了路径 → SqliteEventLogStore；否则 InMemoryEventLogStore（动态 require，不硬依赖）
  - checkpoint 快照表存取也在此：`saveCheckpoint(c: StoredCheckpoint): Promise<void>` / `getLatestCheckpoint(runId: string): Promise<StoredCheckpoint | null>` / `listCheckpoints(runId): Promise<StoredCheckpoint[]>`
  - `interface StoredCheckpoint { id: string; runId: string; graphId: string; superStep: number; state: Record<string, unknown>; nextNodes: string[]; pendingInterrupts: Array<{nodeId: string; value: unknown; id: string}>; iterCounters: Record<string, number>; totalCost: number; startedAtMs: number; createdAt: string }`

说明：`iterCounters`（回边迭代计数器，key=`${from}->${to}`）与 `startedAtMs`（L4 时长守卫基准）是 resume 恢复必需的运行时状态，必须进 checkpoint。

- [ ] **Step 1: 写失败测试** `custom/client/loop/graph/__tests__/event-log-store.test.ts`

```typescript
// overlay/custom/client/loop/graph/__tests__/event-log-store.test.ts
import { describe, it, expect } from 'vitest'
import {
  InMemoryEventLogStore, createEventLogStore,
  type StoredCheckpoint,
} from '../../../../server/loop/graph/event-log-store'

const base = { runId: 'r1', graphId: 'g1', ts: 1000, kind: 'node.completed', payload: { ok: true } }

describe('InMemoryEventLogStore', () => {
  it('appends with monotonic seq and queries by run', async () => {
    const s = new InMemoryEventLogStore()
    const s1 = await s.append(base)
    const s2 = await s.append({ ...base, nodeId: 'n1', superStep: 0 })
    expect(s1).toBe(1); expect(s2).toBe(2)
    const all = await s.query('r1')
    expect(all).toHaveLength(2)
    expect(all[1].nodeId).toBe('n1')
    expect(await s.latestSeq('r1')).toBe(2)
    expect(await s.count('r1')).toBe(2)
    expect(await s.query('other')).toHaveLength(0)
  })

  it('filters by sinceSeq and kind', async () => {
    const s = new InMemoryEventLogStore()
    await s.append(base)
    await s.append({ ...base, kind: 'checkpoint.saved' })
    await s.append({ ...base, kind: 'node.failed' })
    expect(await s.query('r1', { sinceSeq: 1 })).toHaveLength(2)
    expect(await s.query('r1', { kind: 'node.failed' })).toHaveLength(1)
  })

  it('saves and retrieves checkpoints in order', async () => {
    const s = new InMemoryEventLogStore()
    const cp = (n: number): StoredCheckpoint => ({
      id: `cp-${n}`, runId: 'r1', graphId: 'g1', superStep: n,
      state: { count: n }, nextNodes: ['b'], pendingInterrupts: [],
      iterCounters: { 'b->a': n }, totalCost: 0.5, startedAtMs: 100,
      createdAt: new Date(1000 + n).toISOString(),
    })
    await s.saveCheckpoint(cp(0))
    await s.saveCheckpoint(cp(3))
    const latest = await s.getLatestCheckpoint('r1')
    expect(latest?.superStep).toBe(3)
    expect(latest?.iterCounters).toEqual({ 'b->a': 3 })
    expect((await s.listCheckpoints('r1')).map(c => c.superStep)).toEqual([0, 3])
    expect(await s.getLatestCheckpoint('nope')).toBeNull()
  })

  it('round-trips state payloads via JSON (no class instances)', async () => {
    const s = new InMemoryEventLogStore()
    await s.append({ ...base, payload: { nested: { arr: [1, 2] } } })
    const [e] = await s.query('r1')
    expect(e.payload).toEqual({ nested: { arr: [1, 2] } })
    expect(() => JSON.stringify(e)).not.toThrow()
  })
})

describe('createEventLogStore', () => {
  it('falls back to memory when no path given', () => {
    const s = createEventLogStore()
    expect(s).toBeInstanceOf(InMemoryEventLogStore)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/event-log-store.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `custom/server/loop/graph/event-log-store.ts`

```typescript
// overlay/custom/server/loop/graph/event-log-store.ts
// EventLogStore — 图执行的 append-only 事实源
// 默认 InMemory（测试/Electron 无原生模块时降级）；
// 生产经 createEventLogStore(path) 走 better-sqlite3（动态 require，未安装则降级并 warn）

export interface GraphLogEvent {
  seq: number
  runId: string
  graphId: string
  ts: number
  kind: string
  nodeId?: string
  iteration?: number
  superStep?: number
  payload: Record<string, unknown>
}

export interface StoredCheckpoint {
  id: string
  runId: string
  graphId: string
  superStep: number
  state: Record<string, unknown>
  nextNodes: string[]
  pendingInterrupts: Array<{ nodeId: string; value: unknown; id: string }>
  iterCounters: Record<string, number>
  totalCost: number
  startedAtMs: number
  createdAt: string
}

export interface EventLogStore {
  append(e: Omit<GraphLogEvent, 'seq'>): Promise<number>
  query(runId: string, opts?: { sinceSeq?: number; limit?: number; kind?: string }): Promise<GraphLogEvent[]>
  latestSeq(runId: string): Promise<number>
  count(runId: string): Promise<number>
  saveCheckpoint(c: StoredCheckpoint): Promise<void>
  getLatestCheckpoint(runId: string): Promise<StoredCheckpoint | null>
  listCheckpoints(runId: string): Promise<StoredCheckpoint[]>
}

export class InMemoryEventLogStore implements EventLogStore {
  private events: GraphLogEvent[] = []
  private checkpoints = new Map<string, StoredCheckpoint[]>()

  async append(e: Omit<GraphLogEvent, 'seq'>): Promise<number> {
    const seq = this.events.length + 1
    this.events.push({ ...JSON.parse(JSON.stringify(e)), seq })
    return seq
  }

  async query(runId: string, opts?: { sinceSeq?: number; limit?: number; kind?: string }): Promise<GraphLogEvent[]> {
    let out = this.events.filter(e => e.runId === runId)
    if (opts?.sinceSeq !== undefined) out = out.filter(e => e.seq > opts.sinceSeq!)
    if (opts?.kind !== undefined) out = out.filter(e => e.kind === opts.kind)
    if (opts?.limit !== undefined) out = out.slice(0, opts.limit)
    return out
  }

  async latestSeq(runId: string): Promise<number> {
    const evts = this.events.filter(e => e.runId === runId)
    return evts.length ? evts[evts.length - 1].seq : 0
  }

  async count(runId: string): Promise<number> {
    return this.events.filter(e => e.runId === runId).length
  }

  async saveCheckpoint(c: StoredCheckpoint): Promise<void> {
    const list = this.checkpoints.get(c.runId) ?? []
    list.push(JSON.parse(JSON.stringify(c)))
    this.checkpoints.set(c.runId, list)
  }

  async getLatestCheckpoint(runId: string): Promise<StoredCheckpoint | null> {
    const list = this.checkpoints.get(runId) ?? []
    return list.length ? list[list.length - 1] : null
  }

  async listCheckpoints(runId: string): Promise<StoredCheckpoint[]> {
    return [...(this.checkpoints.get(runId) ?? [])]
  }
}

/** better-sqlite3 实现（可选依赖；schema 见 spec §3.1，checkpoints 同库另表） */
class SqliteEventLogStore implements EventLogStore {
  constructor(private db: import('better-sqlite3').Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL, graph_id TEXT NOT NULL, ts INTEGER NOT NULL,
        kind TEXT NOT NULL, node_id TEXT, iteration INTEGER, super_step INTEGER,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_events_run ON graph_events(run_id, seq);
      CREATE TABLE IF NOT EXISTS graph_checkpoints (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, graph_id TEXT NOT NULL,
        super_step INTEGER NOT NULL, state TEXT NOT NULL, next_nodes TEXT NOT NULL,
        pending_interrupts TEXT NOT NULL, iter_counters TEXT NOT NULL,
        total_cost REAL NOT NULL, started_at_ms INTEGER NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_cp_run ON graph_checkpoints(run_id, super_step);
    `)
  }

  async append(e: Omit<GraphLogEvent, 'seq'>): Promise<number> {
    const r = this.db.prepare(
      `INSERT INTO graph_events (run_id, graph_id, ts, kind, node_id, iteration, super_step, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(e.runId, e.graphId, e.ts, e.kind, e.nodeId ?? null, e.iteration ?? null, e.superStep ?? null, JSON.stringify(e.payload))
    return Number(r.lastInsertRowid)
  }

  async query(runId: string, opts?: { sinceSeq?: number; limit?: number; kind?: string }): Promise<GraphLogEvent[]> {
    let sql = `SELECT * FROM graph_events WHERE run_id = ?`
    const args: unknown[] = [runId]
    if (opts?.sinceSeq !== undefined) { sql += ` AND seq > ?`; args.push(opts.sinceSeq) }
    if (opts?.kind !== undefined) { sql += ` AND kind = ?`; args.push(opts.kind) }
    sql += ` ORDER BY seq`
    if (opts?.limit !== undefined) { sql += ` LIMIT ?`; args.push(opts.limit) }
    return (this.db.prepare(sql).all(...args) as Array<Record<string, unknown>>).map(rowToEvent)
  }

  async latestSeq(runId: string): Promise<number> {
    const row = this.db.prepare(`SELECT MAX(seq) AS m FROM graph_events WHERE run_id = ?`).get(runId) as { m: number | null }
    return row.m ?? 0
  }

  async count(runId: string): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM graph_events WHERE run_id = ?`).get(runId) as { c: number }
    return row.c
  }

  async saveCheckpoint(c: StoredCheckpoint): Promise<void> {
    this.db.prepare(
      `INSERT INTO graph_checkpoints
       (id, run_id, graph_id, super_step, state, next_nodes, pending_interrupts, iter_counters, total_cost, started_at_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(c.id, c.runId, c.graphId, c.superStep, JSON.stringify(c.state), JSON.stringify(c.nextNodes),
      JSON.stringify(c.pendingInterrupts), JSON.stringify(c.iterCounters), c.totalCost, c.startedAtMs, c.createdAt)
  }

  async getLatestCheckpoint(runId: string): Promise<StoredCheckpoint | null> {
    const row = this.db.prepare(
      `SELECT * FROM graph_checkpoints WHERE run_id = ? ORDER BY super_step DESC LIMIT 1`,
    ).get(runId) as Record<string, unknown> | undefined
    return row ? rowToCheckpoint(row) : null
  }

  async listCheckpoints(runId: string): Promise<StoredCheckpoint[]> {
    const rows = this.db.prepare(
      `SELECT * FROM graph_checkpoints WHERE run_id = ? ORDER BY super_step`,
    ).all(runId) as Array<Record<string, unknown>>
    return rows.map(rowToCheckpoint)
  }
}

function rowToEvent(r: Record<string, unknown>): GraphLogEvent {
  return {
    seq: r.seq as number, runId: r.run_id as string, graphId: r.graph_id as string,
    ts: r.ts as number, kind: r.kind as string,
    nodeId: (r.node_id as string) ?? undefined,
    iteration: (r.iteration as number) ?? undefined,
    superStep: (r.super_step as number) ?? undefined,
    payload: JSON.parse(r.payload as string),
  }
}

function rowToCheckpoint(r: Record<string, unknown>): StoredCheckpoint {
  return {
    id: r.id as string, runId: r.run_id as string, graphId: r.graph_id as string,
    superStep: r.super_step as number,
    state: JSON.parse(r.state as string),
    nextNodes: JSON.parse(r.next_nodes as string),
    pendingInterrupts: JSON.parse(r.pending_interrupts as string),
    iterCounters: JSON.parse(r.iter_counters as string),
    totalCost: r.total_cost as number,
    startedAtMs: r.started_at_ms as number,
    createdAt: r.created_at as string,
  }
}

/** 工厂：给路径且 better-sqlite3 可用 → SQLite；否则内存降级 */
export function createEventLogStore(sqlitePath?: string): EventLogStore {
  if (sqlitePath) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3')
      return new SqliteEventLogStore(new Database(sqlitePath))
    } catch {
      // 原生模块不可用时降级（Electron 未重建 / 测试环境）
    }
  }
  return new InMemoryEventLogStore()
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/event-log-store.test.ts`
Expected: PASS（5 例；无 better-sqlite3 时 sqlite 路径测试自动走内存分支——工厂测试只断言降级行为）

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/graph/event-log-store.ts custom/client/loop/graph/__tests__/event-log-store.test.ts
git commit -m "feat(graph): EventLogStore append-only 事实源（内存 + 可选 SQLite）"
```

---

### Task 4: GraphRuntime 核心增强（守卫回边 / L4 / join 屏障 / fail-branch / Send 并行 / 日志接线 / 真 resume）

**Files:**
- Modify: `custom/server/loop/graph/graph-runtime.ts`（核心改造）
- Modify: `custom/server/loop/graph/graph-definition.ts`（GraphBuilder 透传新字段 + build 校验）
- Test: `custom/client/loop/graph/__tests__/graph-runtime-guards.test.ts`（新增）；`graph-runtime.test.ts`（既有 10 例保持绿）

**Interfaces:**
- Consumes: `LoopGuard`/`NodeErrorRoute`/`JoinMode`（Task 2 types）；`EventLogStore`/`StoredCheckpoint`（Task 3）
- Produces:
  - `GraphRuntime` 构造签名变为 `constructor(deps: GraphDeps, opts?: { checkpointManager?: CheckpointManager; eventLog?: EventLogStore; runId?: string })`（旧第二参位置兼容：若第二参是 CheckpointManager 实例仍按旧义处理）
  - `start(graphDef, threadId, initialState?)` 行为扩展（见下）
  - `resumeFromCheckpoint(graphDef, checkpoint: StoredCheckpoint, resumeValue: unknown, interruptId: string): Promise<GraphInstance>`——真恢复续跑
  - 节点 ctx.state 注入只读 `__remainingSteps`（number，每 super-step 递减）与 `__iteration`（当前回边代数）

**运行时行为规格（实现必须逐条满足）：**

1. **回边守卫**：边 `e` 命中（条件满足/静态）且 `e.guard` 存在时：计数器 `iterCounters['from->to']++`；若 `> maxIterations` → 该边丢弃不发车，发事件 `edge.guard-exceeded`；若 `breakCondition` 求值 true → 丢弃该边并发 `edge.break`。
2. **L3 图级预算**：每 super-step 在 state 注入 `__remainingSteps = maxSteps - step - 1`（节点可读）；超限仍按现有逻辑 failed（事件 `graph.failed` error 含 `maxSteps`）。
3. **L4 成本/时长**：`GraphDeps.recordCost` 回调存在时，节点完成累计金额入 `instance.totalCost` 并发 `cost.recorded` 日志；`budget.maxCost>0 && totalCost>maxCost` → run failed（`budget exceeded`）。`maxDurationMs` 存在且 `Date.now()-startedAtMs > maxDurationMs` → failed（`duration exceeded`）。检查点在每 super-step 末。
4. **join 屏障**：节点 N 的入边集合中若 `N.joinMode !== 'any'` 且有 ≥2 个不同 source，则 N 只在**本 run 中其全部前驱都至少完成过一次、且自上次 N 完成后有新前驱完成**时激活。实现：维护 `completedSources: Map<nodeId, Set<sourceId>>`——super-step 末，对每个候选下一节点检查所有静态/条件入边 source 是否都在“本代已完成集合”中；`joinMode:'any'` 或无多入边节点维持现状语义。**注意与回边兼容**：回边 source 的“完成”在每次迭代都会刷新（见测试 join-with-loop）。
5. **fail-branch**：节点执行最终失败（含重试耗尽）且 `node.onError` 为 `goto/retry-goto` 时，不判 run failed，改为把 `onError.target` 加入下一批（`retry-goto` 还需同 target 计数 `< maxAttempts`）；发 `node.error-routed` 事件。无 onError → 维持现状（run failed）。
6. **Send 真并行**：`sendTasks` 不再内联 await，改为收集后在**同一 super-step 内** `Promise.all` 并行执行，各子任务用独立 ChannelStore 派生（现状逻辑），完成后统一 apply 回主 store。
7. **事件日志接线**：构造提供 `eventLog` 时，每个 GraphEvent 同时 append（映射：`graph.node-complete`→`node.completed`，payload 携带 result 的 JSON 安全子集：`{updateKeys, goto, hasEnd, hasInterrupt}`；完整 state 不重复进日志——state 由 checkpoint 承载，日志只存 delta 键名与路由事实，控制体积）。
8. **真 resume**：`resumeFromCheckpoint` 用 checkpoint 恢复 ChannelStore/nextNodes/pendingInterrupts/iterCounters/totalCost/startedAtMs，把 `resumeValue` 写入 channel `__resume:<interruptId>`（schema 无此 key 时按现状直写），从 `checkpoint.superStep+1` 继续主循环；发 `graph.resume` 事件（日志 kind `interrupt.resumed`）。
9. **GraphBuilder**：`addEdge(source,target,label?,guard?)`、`addNode` 透传 onError/joinMode、`setMaxDurationMs()`、`build()` 在存在无 guard 回边时抛错（复用 validate 规则的轻量版：仅环检测，因 Builder 产物是内存 GraphDef 无 spec）。

- [ ] **Step 1: 写失败测试** `custom/client/loop/graph/__tests__/graph-runtime-guards.test.ts`

```typescript
// overlay/custom/client/loop/graph/__tests__/graph-runtime-guards.test.ts
import { describe, it, expect } from 'vitest'
import { GraphRuntime } from '../../../../server/loop/graph/graph-runtime'
import { GraphBuilder, fnNode } from '../../../../server/loop/graph/graph-definition'
import { reducers, type GraphEvent, type StateValues } from '../../../../server/loop/graph/types'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'

function builder() {
  return new GraphBuilder('g', 'G')
    .addChannel('count', { reducer: reducers.overwrite(), default: 0 })
    .addChannel('log', { reducer: reducers.append(), default: [] as string[] })
}

describe('guarded back edge', () => {
  it('terminates via guard.maxIterations and emits edge.guard-exceeded', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode(fnNode('a', async (s: StateValues) => ({ update: { count: (s.count as number) + 1 } })))
      .addNode(fnNode('b', async () => ({ update: {} })))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('b', 'a', 'retry', { maxIterations: 3 })
      .setMaxSteps(50)
      .build()
    const inst = await rt.start(g, 't1')
    // a 执行 4 次（初始 + 3 次回边），第 4 次回边被 guard 拦截
    expect(inst.state.count).toBe(4)
    expect(inst.status).toBe('completed')
    expect(events.some(e => (e as any).type === 'edge.guard-exceeded')).toBe(true)
  })

  it('breakCondition exits loop early', async () => {
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) })
    const g = builder()
      .addNode(fnNode('a', async (s: StateValues) => ({ update: { count: (s.count as number) + 1 } })))
      .addNode(fnNode('b', async () => ({ update: {} })))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('b', 'a', 'retry', {
        maxIterations: 100,
        breakCondition: { op: 'cmp', path: 'count', cmp: 'gte', value: 2 },
      })
      .build()
    const inst = await rt.start(g, 't2')
    expect(inst.state.count).toBe(2)
    expect(inst.status).toBe('completed')
    expect(events.some(e => (e as any).type === 'edge.break')).toBe(true)
  })

  it('builder rejects unguarded cycle at build()', () => {
    expect(() => builder()
      .addNode(fnNode('a', async () => ({})))
      .addNode(fnNode('b', async () => ({})))
      .setEntry('a')
      .addEdge('a', 'b')
      .addEdge('b', 'a')
      .build(),
    ).toThrow(/guard/i)
  })
})

describe('remaining steps + budget', () => {
  it('injects __remainingSteps into node-visible state', async () => {
    const seen: number[] = []
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('a', async (s: StateValues) => {
        seen.push(s.__remainingSteps as number)
        return { update: { count: (s.count as number) + 1 } }
      }))
      .addNode(fnNode('b', async (s: StateValues) => {
        seen.push(s.__remainingSteps as number)
        return { update: {} }
      }))
      .setEntry('a').addEdge('a', 'b')
      .addEdge('b', 'a', 'loop', { maxIterations: 2 })
      .setMaxSteps(10)
      .build()
    await rt.start(g, 't3')
    expect(seen[0]).toBe(9)     // step0: 10-0-1
    expect(seen[1]).toBe(8)     // step1
    expect(seen[2]).toBe(7)     // step2 (a again)
  })

  it('fails when cost budget exceeded', async () => {
    const rt = new GraphRuntime({
      emitEvent: () => {},
      recordCost: () => {},
    })
    const g = builder()
      .addNode(fnNode('spend', async (_s, ctx) => {
        ctx.deps.recordCost?.(10)
        return { update: {} }
      }))
      .setEntry('spend')
      .addEdge('spend', 'spend', 'loop', { maxIterations: 10 })
      .setMaxSteps(20)
      .build()
    g.budget = { maxCost: 15, maxTokens: 0 }
    const inst = await rt.start(g, 't4')
    expect(inst.status).toBe('failed')
    expect(inst.totalCost).toBeGreaterThan(15)
  })
})

describe('join barrier', () => {
  it('waits for all predecessors by default', async () => {
    const order: string[] = []
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('start', async () => { order.push('start'); return {} }))
      .addNode(fnNode('fast', async () => { order.push('fast'); return {} }))
      .addNode(fnNode('slow', async () => { await new Promise(r => setTimeout(r, 20)); order.push('slow'); return {} }))
      .addNode(fnNode('join', async () => { order.push('join'); return {} }))
      .setEntry('start')
      .addEdge('start', 'fast')
      .addEdge('start', 'slow')
      .addEdge('fast', 'join')
      .addEdge('slow', 'join')
      .build()
    const inst = await rt.start(g, 't5')
    expect(inst.status).toBe('completed')
    // join 必须在 fast 与 slow 都完成后执行，且只执行一次
    expect(order.filter(x => x === 'join')).toHaveLength(1)
    expect(order.indexOf('join')).toBeGreaterThan(order.indexOf('fast'))
    expect(order.indexOf('join')).toBeGreaterThan(order.indexOf('slow'))
  })

  it('joinMode any fires on first predecessor', async () => {
    const order: string[] = []
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode(fnNode('start', async () => { order.push('start'); return {} }))
      .addNode(fnNode('fast', async () => { order.push('fast'); return {} }))
      .addNode(fnNode('slow', async () => { await new Promise(r => setTimeout(r, 20)); order.push('slow'); return {} }))
      .addNode({ id: 'join', type: 'function', label: 'join', joinMode: 'any',
        execute: async () => { order.push('join'); return {} } })
      .setEntry('start')
      .addEdge('start', 'fast')
      .addEdge('start', 'slow')
      .addEdge('fast', 'join')
      .addEdge('slow', 'join')
      .build()
    const inst = await rt.start(g, 't6')
    expect(inst.status).toBe('completed')
    expect(order.indexOf('join')).toBeLessThan(order.indexOf('slow'))
  })
})

describe('fail-branch', () => {
  it('routes to onError target instead of failing the run', async () => {
    const rt = new GraphRuntime({ emitEvent: () => {} })
    const g = builder()
      .addNode({
        id: 'risky', type: 'function', label: 'risky',
        execute: async () => { throw new Error('boom') },
        onError: { type: 'goto', target: 'fallback' },
      })
      .addNode(fnNode('fallback', async () => ({ update: { log: ['rescued'] } })))
      .setEntry('risky')
      .addEdge('risky', 'fallback')
      .build()
    const inst = await rt.start(g, 't7')
    expect(inst.status).toBe('completed')
    expect(inst.state.log).toEqual(['rescued'])
  })
})

describe('event log wiring', () => {
  it('appends lifecycle events to EventLogStore', async () => {
    const log = new InMemoryEventLogStore()
    const rt = new GraphRuntime({ emitEvent: () => {} }, { eventLog: log, runId: 'run-1' })
    const g = builder()
      .addNode(fnNode('a', async () => ({ update: { count: 1 } })))
      .setEntry('a')
      .build()
    await rt.start(g, 't8')
    const kinds = (await log.query('run-1')).map(e => e.kind)
    expect(kinds).toContain('run.started')
    expect(kinds).toContain('node.completed')
    expect(kinds).toContain('checkpoint.saved')
    expect(kinds).toContain('run.completed')
  })
})

describe('true resume', () => {
  it('resumes from checkpoint and continues remaining nodes', async () => {
    const log = new InMemoryEventLogStore()
    const events: GraphEvent[] = []
    const rt = new GraphRuntime({ emitEvent: e => events.push(e) }, { eventLog: log, runId: 'run-9' })
    const order: string[] = []
    const g = builder()
      .addNode(fnNode('a', async () => { order.push('a'); return { update: { count: 1 } } }))
      .addNode(fnNode('gate', async (_s, ctx) => ({
        interrupt: { value: { prompt: 'ok?' }, id: `gate-${ctx.threadId}-${ctx.superStep}` },
      })))
      .addNode(fnNode('c', async (s: StateValues) => {
        order.push('c')
        return { update: { log: [`resumed:${String(s['__resume:gate-t9-1'])}`] } }
      }))
      .setEntry('a').addEdge('a', 'gate').addEdge('gate', 'c')
      .build()
    const inst = await rt.start(g, 't9')
    expect(inst.status).toBe('awaiting-input')
    expect(order).toEqual(['a'])

    const cp = await log.getLatestCheckpoint('run-9')
    expect(cp).not.toBeNull()
    expect(cp!.pendingInterrupts).toHaveLength(1)
    const interruptId = cp!.pendingInterrupts[0].id

    const rt2 = new GraphRuntime({ emitEvent: e => events.push(e) }, { eventLog: log, runId: 'run-9' })
    const inst2 = await rt2.resumeFromCheckpoint(g, cp!, 'yes', interruptId)
    expect(inst2.status).toBe('completed')
    expect(order).toEqual(['a', 'c'])           // a 没有重跑
    expect(inst2.state.count).toBe(1)           // 状态从 checkpoint 恢复
    expect(inst2.state.log).toEqual(['resumed:yes'])
    const kinds = (await log.query('run-9')).map(e => e.kind)
    expect(kinds).toContain('interrupt.raised')
    expect(kinds).toContain('interrupt.resumed')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/graph-runtime-guards.test.ts`
Expected: FAIL（新 API 不存在）

- [ ] **Step 3: 实现改造**

`graph-runtime.ts` 逐条落实行为规格 1–8；`graph-definition.ts` 落实规格 9。要点：

- 主循环提取为私有方法 `runLoop(graphDef, instance, store, startStep, nextNodes, pendingInterrupts, iterCounters, startedAtMs)`，`start()` 与 `resumeFromCheckpoint()` 共用。
- `iterCounters: Record<string, number>` 与 `completedThisRun: Set<string>` / `completedPred: Map<string, Set<string>>` 作为 runLoop 局部状态，进出 checkpoint。
- join 屏障实现位置：`computeNextNodes` 之后过滤——候选节点 N 若有多 source 入边且 `joinMode!=='any'`，要求其全部 source ∈ `completedThisRun` 且 N 不在本 super-step 已执行集合；回边 source 在每次完成时重新加入 `completedThisRun`，因此循环体内的 join 每代都能重新满足。
- 节点可见 state：`executeNode` 收到的 state = `store.getValues()` + `{ __remainingSteps, __iteration }`（`__iteration` = 该节点上一次完成次数）。
- `recordCost` 接线：`GraphDeps.recordCost(amount)` 被节点调用时 runtime 同步累加 `instance.totalCost += amount`（deps 由 runtime 包装注入，保证 totalCost 真实）。
- 事件映射常量：
  - `graph.started→run.started` / `graph.completed→run.completed` / `graph.failed→run.failed`
  - `graph.node-complete→node.completed` / `graph.node-error→node.failed` / `graph.node-start→node.started`
  - `graph.interrupt→interrupt.raised` / `graph.resume→interrupt.resumed` / `graph.checkpoint→checkpoint.saved`
  - 新增 GraphEvent 类型：`edge.guard-exceeded`、`edge.break`、`node.error-routed`、`cost.recorded`（types.ts 追加联合成员）

- [ ] **Step 4: 运行全部 graph 测试确认通过（含既有 20 例回归）**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/`
Expected: PASS（既有 10+10 回归 + 新增 9 例）

注意：既有测试 `conditional routing`（thread-3）用了**无 guard 回边** `addEdge('continue','check')`——按规格 9 会在 build() 抛错。该测试需更新为带 guard 写法：

```typescript
.addEdge('continue', 'check', 'loop', { maxIterations: 10 })
```

同理 `respects maxSteps limit`（thread-6）的自环 `addEdge('loop','loop')` 与 `end condition terminates graph`（thread-7）的自环改为带大 guard（如 `{ maxIterations: 1000 }`），语义不变（maxSteps/endCondition 先行终止）。**只改这三处 addEdge 调用，断言不动。**

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/graph/ custom/client/loop/graph/__tests__/
git commit -m "feat(graph): 守卫回边+四层终止+join屏障+fail-branch+事件日志+真resume"
```

---

### Task 5: CheckpointManager 重写（EventLogStore 驱动）+ fork

**Files:**
- Rewrite: `custom/server/loop/graph/checkpoint-manager.ts`
- Test: `custom/client/loop/graph/__tests__/checkpoint-manager.test.ts`

**Interfaces:**
- Consumes: `EventLogStore`/`StoredCheckpoint`（Task 3）
- Produces:
  - `class CheckpointManager { constructor(log: EventLogStore); save(c: StoredCheckpoint): Promise<void>; getLatest(runId: string): Promise<StoredCheckpoint|null>; list(runId: string): Promise<StoredCheckpoint[]>; getAt(runId: string, superStep: number): Promise<StoredCheckpoint|null>; fork(runId: string, superStep: number, newRunId: string): Promise<StoredCheckpoint> }`
  - fork 语义：复制该 superStep 的 checkpoint 到 newRunId（新 id、runId 替换、其余不变），并向 newRunId 日志追加 `run.forked`（payload 携带 `fromRunId`、`fromSuperStep`）——time-travel 的最小可用形态。
  - **破坏性变更**：旧构造签名 `constructor(store: LoopStateStore)` 与 `getLatest(graphId, threadId)` 废弃。调研确认 CheckpointManager 生产零引用（仅 graph-runtime 构造可选传入），无其它调用点需要迁移。

- [ ] **Step 1: 写失败测试** `custom/client/loop/graph/__tests__/checkpoint-manager.test.ts`

```typescript
// overlay/custom/client/loop/graph/__tests__/checkpoint-manager.test.ts
import { describe, it, expect } from 'vitest'
import { CheckpointManager } from '../../../../server/loop/graph/checkpoint-manager'
import { InMemoryEventLogStore, type StoredCheckpoint } from '../../../../server/loop/graph/event-log-store'

const cp = (runId: string, step: number): StoredCheckpoint => ({
  id: `cp-${runId}-${step}`, runId, graphId: 'g', superStep: step,
  state: { count: step }, nextNodes: ['n'], pendingInterrupts: [],
  iterCounters: {}, totalCost: step * 0.1, startedAtMs: 1,
  createdAt: new Date(1000 + step).toISOString(),
})

describe('CheckpointManager', () => {
  it('saves and gets latest per run', async () => {
    const log = new InMemoryEventLogStore()
    const m = new CheckpointManager(log)
    await m.save(cp('r1', 0)); await m.save(cp('r1', 2)); await m.save(cp('r2', 5))
    expect((await m.getLatest('r1'))?.superStep).toBe(2)
    expect((await m.getLatest('r2'))?.superStep).toBe(5)
    expect((await m.list('r1')).map(c => c.superStep)).toEqual([0, 2])
    expect((await m.getAt('r1', 0))?.state.count).toBe(0)
  })

  it('fork copies checkpoint into a new run and logs run.forked', async () => {
    const log = new InMemoryEventLogStore()
    const m = new CheckpointManager(log)
    await m.save(cp('r1', 3))
    const forked = await m.fork('r1', 3, 'r2')
    expect(forked.runId).toBe('r2')
    expect(forked.state).toEqual({ count: 3 })
    expect(forked.id).not.toBe('cp-r1-3')
    const evts = await log.query('r2', { kind: 'run.forked' })
    expect(evts).toHaveLength(1)
    expect(evts[0].payload.fromRunId).toBe('r1')
    expect(evts[0].payload.fromSuperStep).toBe(3)
  })

  it('fork of missing checkpoint throws', async () => {
    const m = new CheckpointManager(new InMemoryEventLogStore())
    await expect(m.fork('nope', 0, 'r2')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/checkpoint-manager.test.ts`
Expected: FAIL

- [ ] **Step 3: 重写 checkpoint-manager.ts**（整体替换，接口如上；实现为 EventLogStore 薄封装 + fork 复制）

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/graph/checkpoint-manager.ts custom/client/loop/graph/__tests__/checkpoint-manager.test.ts
git commit -m "feat(graph): CheckpointManager 重写为事件日志驱动 + 检查点 fork"
```

---

### Task 6: NodeRegistry hydrate 支持

**Files:**
- Modify: `custom/server/loop/graph/node-registry.ts`
- Test: 并入 `graph-spec.test.ts` 的 hydrate 段已覆盖注册表缺失路径；本任务补 1 个测试文件

**Interfaces:**
- Produces: `createDefaultRegistry()` 返回的注册表中：
  - `human`：真实现（返回 interrupt，带 prompt；支持 config.timeoutMs）
  - `subgraph`：经 `ctx.deps.subgraphRunner`（新增可选 dep：`(subgraphId: string, state: StateValues, ctx: NodeContext) => Promise<NodeResult>`）递归执行；deps 未提供时抛带说明的错误（而非静默空更新）
  - `function`：config.execute 为函数时直用（内存构建）；config.execute 为字符串（如 `'noop'`）时查 `deps.fnTable`（新增可选 dep `Record<string, NodeDef['execute']>`），两者都缺 → 抛错
  - `loop` / `retrieval`：保留 stub 但错误信息明确标注 `P1 接线`；P0 不许静默返回空 update（改抛 `not implemented (P1)`）
- Consumes: `GraphDeps` 扩展（types.ts 追加可选字段 `subgraphRunner?`、`fnTable?`）

- [ ] **Step 1: 写失败测试** `custom/client/loop/graph/__tests__/node-registry.test.ts`

```typescript
// overlay/custom/client/loop/graph/__tests__/node-registry.test.ts
import { describe, it, expect } from 'vitest'
import { createDefaultRegistry } from '../../../../server/loop/graph/node-registry'
import type { NodeContext } from '../../../../server/loop/graph/types'

const ctx = (deps = {}): NodeContext => ({
  graphId: 'g', threadId: 't', nodeId: 'n', superStep: 0,
  deps: { emitEvent: () => {}, ...deps },
})

describe('createDefaultRegistry', () => {
  it('human node returns interrupt with prompt', async () => {
    const r = createDefaultRegistry()
    const n = r.create('human', { id: 'h', prompt: 'approve?' })
    const res = await n.execute({}, ctx())
    expect(res.interrupt?.value).toMatchObject({ prompt: 'approve?' })
  })

  it('function node resolves execute from fnTable when config.execute is a string', async () => {
    const r = createDefaultRegistry()
    const n = r.create('function', { id: 'f', execute: 'noop' })
    const res = await n.execute({}, ctx({ fnTable: { noop: async () => ({ update: { done: 1 } }) } }))
    expect(res.update).toEqual({ done: 1 })
  })

  it('function node throws when no execute available', async () => {
    const r = createDefaultRegistry()
    const n = r.create('function', { id: 'f' })
    await expect(n.execute({}, ctx())).rejects.toThrow(/execute/)
  })

  it('subgraph delegates to deps.subgraphRunner', async () => {
    const r = createDefaultRegistry()
    const n = r.create('subgraph', { id: 's', subgraphId: 'child' })
    const res = await n.execute({ x: 1 }, ctx({
      subgraphRunner: async (id: string) => ({ update: { from: id } }),
    }))
    expect(res.update).toEqual({ from: 'child' })
  })

  it('subgraph without runner throws actionable error', async () => {
    const r = createDefaultRegistry()
    const n = r.create('subgraph', { id: 's', subgraphId: 'child' })
    await expect(n.execute({}, ctx())).rejects.toThrow(/subgraphRunner/)
  })

  it('loop and retrieval nodes throw not-implemented (P1) instead of silent noop', async () => {
    const r = createDefaultRegistry()
    await expect(r.create('loop', { id: 'l' }).execute({}, ctx())).rejects.toThrow(/P1/)
    await expect(r.create('retrieval', { id: 'r' }).execute({}, ctx())).rejects.toThrow(/P1/)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/node-registry.test.ts`
Expected: FAIL

- [ ] **Step 3: 修改 node-registry.ts + types.ts（GraphDeps 追加 `subgraphRunner?`、`fnTable?`）**

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/ custom/client/loop/__tests__/store-factory.test.ts`
Expected: PASS（graph-spec.test.ts 中 hydrate 的 `function` 节点用 `config.execute:'noop'`——hydrate 测试的 registry 是测试内自建，不受影响）

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/graph/node-registry.ts custom/server/loop/graph/types.ts custom/client/loop/graph/__tests__/node-registry.test.ts
git commit -m "feat(graph): NodeRegistry hydrate 支持（human/subgraph/fnTable）"
```

---

### Task 7: GraphService（Run 注册表 + resume 闭环）

**Files:**
- Create: `custom/server/loop/graph/graph-service.ts`
- Test: `custom/client/loop/graph/__tests__/graph-service.test.ts`

**Interfaces:**
- Consumes: 全部前序任务产物
- Produces:
  - `class GraphService { constructor(opts: { eventLog: EventLogStore; deps?: Partial<GraphDeps> })`
  - `registerGraph(def: GraphDef): void`
  - `startRun(graphId: string, initialState?: StateValues): Promise<{ runId: string; instance: GraphInstance }>`——新 runId（`run-<graphId>-<seq>`），事件订阅者经 `onEvent(cb)` 注册
  - `resumeRun(runId: string, interruptId: string, value: unknown): Promise<GraphInstance>`——从最新 checkpoint 恢复续跑；run 不在 awaiting-input → 抛错
  - `forkRun(runId: string, superStep: number): Promise<{ runId: string }>`
  - `getRun(runId: string): { instance: GraphInstance; status: GraphStatus } | null`
  - `listRuns(): Array<{ runId: string; graphId: string; status: GraphStatus; updatedAt: string }>`
  - `replayRun(runId: string): Promise<GraphLogEvent[]>`（回放数据层，P2 UI 用）
  - 进程内 Run 注册表（Map）；P1 装配进 Koa 时由 controllers 薄壳调用，本任务不含 HTTP。

- [ ] **Step 1: 写失败测试** `custom/client/loop/graph/__tests__/graph-service.test.ts`

```typescript
// overlay/custom/client/loop/graph/__tests__/graph-service.test.ts
import { describe, it, expect } from 'vitest'
import { GraphService } from '../../../../server/loop/graph/graph-service'
import { InMemoryEventLogStore } from '../../../../server/loop/graph/event-log-store'
import { GraphBuilder, fnNode, humanNode } from '../../../../server/loop/graph/graph-definition'
import { reducers, type StateValues } from '../../../../server/loop/graph/types'

function approvalGraph() {
  return new GraphBuilder('approval-flow', 'Approval')
    .addChannel('steps', { reducer: reducers.append(), default: [] as string[] })
    .addNode(fnNode('work', async () => ({ update: { steps: ['work'] } })))
    .addNode(humanNode('gate', 'approve?'))
    .addNode(fnNode('finish', async (s: StateValues) => ({
      update: { steps: [`finish:${String(s['__resume:gate-0'] ?? 'ok')}`] },
    })))
    .setEntry('work').addEdge('work', 'gate').addEdge('gate', 'finish')
    .build()
}

describe('GraphService', () => {
  it('start → awaiting-input → resume → completed, runs listed', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId, instance } = await svc.startRun('approval-flow')
    expect(instance.status).toBe('awaiting-input')
    expect(svc.getRun(runId)?.status).toBe('awaiting-input')

    const cp = await svc['eventLog'].getLatestCheckpoint(runId)
    const done = await svc.resumeRun(runId, cp!.pendingInterrupts[0].id, 'yes')
    expect(done.status).toBe('completed')
    expect(svc.getRun(runId)?.status).toBe('completed')
    expect(svc.listRuns().map(r => r.runId)).toContain(runId)
  })

  it('resume on non-awaiting run throws', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(new GraphBuilder('plain', 'P')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({})))
      .setEntry('a').build())
    const { runId } = await svc.startRun('plain')
    await expect(svc.resumeRun(runId, 'any', 1)).rejects.toThrow(/awaiting/)
  })

  it('forkRun creates an independent run from a past checkpoint', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    svc.registerGraph(approvalGraph())
    const { runId } = await svc.startRun('approval-flow')
    const { runId: forkedId } = await svc.forkRun(runId, 1)
    expect(forkedId).not.toBe(runId)
    const evts = await svc.replayRun(forkedId)
    expect(evts.some(e => e.kind === 'run.forked')).toBe(true)
  })

  it('emits events to subscribers', async () => {
    const svc = new GraphService({ eventLog: new InMemoryEventLogStore() })
    const seen: string[] = []
    svc.onEvent(e => seen.push(e.type))
    svc.registerGraph(new GraphBuilder('g2', 'G2')
      .addChannel('x', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('a', async () => ({})))
      .setEntry('a').build())
    await svc.startRun('g2')
    expect(seen).toContain('graph.started')
    expect(seen).toContain('graph.completed')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd overlay && npx vitest run custom/client/loop/graph/__tests__/graph-service.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 graph-service.ts**

要点：内部为每个 run 持有 `GraphRuntime` 实例（构造注入 `{ eventLog, runId }`）；`resumeRun` 走 runtime `resumeFromCheckpoint`；`forkRun` 走 `CheckpointManager.fork` + 以 forked checkpoint 的 state 作为 initialState 起新 run（但不自动执行——返回待启动状态由调用方 `startRun` 语义区分：fork 产物以 `paused` 入注册表，P2 UI 决定何时启动）。`__resume:gate-0` 的 key 形态：interrupt id 为 `humanNode` 生成的 `${id}-${threadId}-${superStep}`，GraphService 的 runId 即 threadId——测试里用 `gate-0` 匹配的是实现细节，实现时确保 humanNode 的 interrupt id 规则可断言（或在测试中用 `Object.keys(s).find(k=>k.startsWith('__resume:'))` 取值，实现者二选一并同步测试）。

- [ ] **Step 4: 运行确认通过 + 全量回归**

Run: `cd overlay && npm test`
Expected: 全绿（graph 7 个测试文件 + 既有 69 文件无回归）

- [ ] **Step 5: Commit**

```bash
git add custom/server/loop/graph/graph-service.ts custom/client/loop/graph/__tests__/graph-service.test.ts
git commit -m "feat(graph): GraphService Run 注册表 + resume/fork 闭环"
```

---

### Task 8: P0 收口——文档 + 门禁

**Files:**
- Modify: `overlay/package.json`（optionalDependencies 加 `better-sqlite3`，版本对齐上游 server 既有依赖；若上游已有则不动）
- Create: `docs/superpowers/specs/2026-09-09-loop-graph-p0-kernel-notes.md`（内核 API 速览 + 四层终止语义 + P1 接线点清单）
- Test: 全量

- [ ] **Step 1: 检查上游 better-sqlite3 现状**

Run: `grep -rn "better-sqlite3" ../upstream/hermes-studio/packages/server/package.json ../upstream/hermes-studio/package.json 2>/dev/null`
若上游已有 → overlay package.json 不加（复用符号链接的 node_modules）；若无 → 加入 overlay `optionalDependencies` 并 `npm install --no-audit --no-fund`（失败不阻塞，工厂有内存降级）。

- [ ] **Step 2: 写 P0 内核笔记**（供 P1 计划引用）

内容：模块地图（7 文件职责一句话）、GraphSpec JSON 示例（五阶段循环的最小图）、四层终止对照表、事件 kind 全表、P1 接线点（patch 134 装配改造点、loop-to-graph 编译器、调度器收敛）。

- [ ] **Step 3: 全量门禁**

Run: `cd overlay && npm test && npx tsc --noEmit -p ../upstream/hermes-studio/packages/server/tsconfig.json 2>&1 | head -20`（server tsc 若因未 inject 而不可跑，则以 `npm test` + `npm run build` 的 client 构建为门禁，并在笔记中声明）
Expected: vitest 全绿

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json docs/superpowers/specs/2026-09-09-loop-graph-p0-kernel-notes.md
git commit -m "docs(graph): P0 内核笔记 + 可选 SQLite 依赖"
```

---

## Self-Review 记录

- **Spec 覆盖**：spec §2（守卫回边/四层终止/状态模型）→ Task 1/2/4；§3（事件日志/checkpoint/fork）→ Task 3/5；§4（HITL 闭环的运行时部分）→ Task 4/7（REST/Matrix 通知属 P1/P2）；§2.4 四项残缺（join/fail-branch/Send 并行/resume）→ Task 4。P1 编译器、调度器收敛、REST/Socket、前端均不在 P0 范围（spec §10 分期）。
- **类型一致性**：`StoredCheckpoint.iterCounters/startedAtMs` 在 Task 3 定义、Task 4 runtime 写入、Task 5 fork 复制、Task 7 resume 恢复——四处一致。`LoopGuard/NodeErrorRoute/JoinMode` 在 Task 2 types.ts 定义，Task 2/4 共用。
- **已知取舍**：`__resume:` channel 的 key 形态在 Task 7 Step 3 留有实现者二选一（已写明同步测试）；loop/retrieval 节点 P0 抛 not-implemented 是刻意收紧（防止静默空跑），P1 接线。
