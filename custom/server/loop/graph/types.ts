// overlay/custom/server/loop/graph/types.ts
// Graph Engineering — 类型定义
// 升级自 Loop Engineering：从单节点循环 → 多节点有向图
//
// 核心概念（吸收 LangGraph + Simmons 三原语）：
// - Node = 能力单元（loop / function / human / retrieval）
// - Edge = 类型化状态转换（静态 or 动态路由）
// - State = 分通道 schema 对象（per-key reducer）
// - Checkpoint = per-super-step 持久化（resume / fork）
// - Interrupt = 人工审批异常（Command(resume=) 恢复）

// ============================================================================
// 状态模型 — LangGraph channel + reducer 模式
// ============================================================================

/** Reducer 函数：合并旧值和新值。默认覆盖，可自定义（如 list append） */
export type Reducer<T> = (old: T | undefined, next: T) => T

/** 通道定义：状态的每个 key 有独立的 reducer */
export interface Channel<T = unknown> {
  name: string
  reducer: Reducer<T>
  default: T | undefined
}

/** 内置 reducer */
export const reducers = {
  overwrite: <T>() => ((_old: T | undefined, next: T) => next) as Reducer<T>,
  append: <T>() => ((old: T[] | undefined, next: T[]) => [...(old ?? []), ...next]) as Reducer<T[]>,
  merge: <T extends Record<string, unknown>>() =>
    ((old: T | undefined, next: T) => ({ ...(old ?? {}), ...next })) as Reducer<T>,
  max: () => ((old: number | undefined, next: number) => Math.max(old ?? -Infinity, next)) as Reducer<number>,
  min: () => ((old: number | undefined, next: number) => Math.min(old ?? Infinity, next)) as Reducer<number>,
}

/** 状态 schema = 通道集合 */
export type StateSchema = Record<string, Channel>

/** 状态值 = 通道名 → 当前值 */
export type StateValues = Record<string, unknown>

/** 部分状态更新 = 节点返回的增量 */
export type StateUpdate = Partial<StateValues>

// ============================================================================
// 节点模型
// ============================================================================

export type NodeType = 'loop' | 'function' | 'human' | 'retrieval' | 'subgraph'

export interface NodeDef {
  id: string
  type: NodeType
  label: string
  /** 节点执行函数 — 接收当前状态，返回部分更新 + 路由决策 */
  execute: (state: StateValues, ctx: NodeContext) => Promise<NodeResult>
  /** 超时 ms */
  timeout?: number
  /** 重试配置 */
  retry?: { maxAttempts: number; backoffMs: number }
  /** 缓存 TTL（秒），同输入跳过执行 */
  cacheTtl?: number
  /** 子图引用（type='subgraph' 时使用） */
  subgraphId?: string
}

export interface NodeContext {
  graphId: string
  threadId: string
  nodeId: string
  superStep: number
  /** 依赖注入：store / emitEvent 等 */
  deps: GraphDeps
}

export interface NodeResult {
  /** 状态部分更新（经 reducer 合并） */
  update?: StateUpdate
  /** 路由目标节点 ID 列表。空 = 走默认出边。 */
  goto?: string[]
  /** interrupt：暂停执行等待人工输入 */
  interrupt?: { value: unknown; id: string }
  /** 终止图执行 */
  end?: unknown
  /** 发送 map-reduce 子任务（LangGraph Send API 模式） */
  send?: Array<{ node: string; state: StateUpdate }>
}

// ============================================================================
// 边模型
// ============================================================================

export type EdgeCondition = (state: StateValues) => string | string[] | null

export interface EdgeDef {
  source: string
  target: string
  /** 静态边（无 condition）或动态边（有 condition） */
  condition?: EdgeCondition
  label?: string
}

// ============================================================================
// 图定义
// ============================================================================

export interface GraphDef {
  id: string
  name: string
  description: string
  /** 状态 schema — 通道集合 */
  stateSchema: StateSchema
  /** 节点集合 */
  nodes: Map<string, NodeDef>
  /** 边集合 */
  edges: EdgeDef[]
  /** 入口节点 ID */
  entryNode: string
  /** 终止条件 */
  endCondition?: (state: StateValues) => boolean
  /** 最大 super-step 数（防无限循环） */
  maxSteps: number
  /** 预算 */
  budget?: { maxCost: number; maxTokens: number }
}

// ============================================================================
// 检查点模型
// ============================================================================

export interface Checkpoint {
  id: string
  graphId: string
  threadId: string
  superStep: number
  state: StateValues
  /** 下一步待执行的节点 */
  nextNodes: string[]
  /** interrupt 状态 */
  pendingInterrupts: Array<{ nodeId: string; value: unknown; id: string }>
  timestamp: string
  /** 累计花费 */
  totalCost: number
}

// ============================================================================
// 图实例 / 运行状态
// ============================================================================

export type GraphStatus = 'idle' | 'running' | 'paused' | 'awaiting-input' | 'completed' | 'failed'

export interface GraphInstance {
  id: string
  graphDefId: string
  threadId: string
  status: GraphStatus
  currentStep: number
  state: StateValues
  totalCost: number
  createdAt: string
  updatedAt: string
  parentThreadId?: string  // fork 来源
}

// ============================================================================
// 事件模型
// ============================================================================

export type GraphEvent =
  | { type: 'graph.started'; graphId: string; threadId: string; ts: string }
  | { type: 'graph.step-start'; graphId: string; threadId: string; step: number; nodes: string[]; ts: string }
  | { type: 'graph.node-start'; graphId: string; threadId: string; nodeId: string; step: number; ts: string }
  | { type: 'graph.node-complete'; graphId: string; threadId: string; nodeId: string; step: number; result: NodeResult; ts: string }
  | { type: 'graph.node-error'; graphId: string; threadId: string; nodeId: string; step: number; error: string; ts: string }
  | { type: 'graph.interrupt'; graphId: string; threadId: string; nodeId: string; value: unknown; interruptId: string; ts: string }
  | { type: 'graph.resume'; graphId: string; threadId: string; interruptId: string; resumeValue: unknown; ts: string }
  | { type: 'graph.step-complete'; graphId: string; threadId: string; step: number; state: StateValues; ts: string }
  | { type: 'graph.checkpoint'; graphId: string; threadId: string; checkpointId: string; step: number; ts: string }
  | { type: 'graph.completed'; graphId: string; threadId: string; finalState: StateValues; totalCost: number; ts: string }
  | { type: 'graph.failed'; graphId: string; threadId: string; error: string; ts: string }
  | { type: 'graph.forked'; graphId: string; threadId: string; parentThreadId: string; ts: string }

// ============================================================================
// 依赖注入接口
// ============================================================================

export interface GraphDeps {
  emitEvent: (event: GraphEvent) => void | Promise<void>
  /** 请求人工输入（返回 Promise，resolve 时得到审批结果） */
  requestHumanInput?: (nodeId: string, value: unknown) => Promise<unknown>
  /** 记录花费 */
  recordCost?: (amount: number) => void
}
