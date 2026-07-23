// overlay/custom/server/loop/graph/graph-definition.ts
// GraphDef 构建器 — 声明式图定义（链式 API）

import type {
  GraphDef, NodeDef, EdgeDef, StateSchema, Channel, StateValues,
  NodeResult, NodeContext, EdgeCondition,
} from './types'
import { reducers } from './types'

export class GraphBuilder {
  private nodes: Map<string, NodeDef> = new Map()
  private edges: EdgeDef[] = []
  private stateSchema: StateSchema = {}
  private entryNode: string = ''
  private maxSteps: number = 100
  private endCondition?: (state: StateValues) => boolean

  constructor(
    private id: string,
    private name: string,
    private description: string = '',
  ) {}

  /** 添加状态通道 */
  addChannel<T>(name: string, channel?: Partial<Channel<T>>): this {
    this.stateSchema[name] = {
      name,
      reducer: channel?.reducer ?? reducers.overwrite<T>(),
      default: channel?.default,
    }
    return this
  }

  /** 添加节点 */
  addNode(node: NodeDef): this {
    this.nodes.set(node.id, node)
    return this
  }

  /** 添加入口节点 */
  setEntry(nodeId: string): this {
    this.entryNode = nodeId
    return this
  }

  /** 添加静态边 */
  addEdge(source: string, target: string, label?: string): this {
    this.edges.push({ source, target, label })
    return this
  }

  /** 添加动态边（条件路由） */
  addConditionalEdge(source: string, condition: EdgeCondition, label?: string): this {
    this.edges.push({ source, target: '', condition, label })
    return this
  }

  /** 设置终止条件 */
  setEndCondition(fn: (state: StateValues) => boolean): this {
    this.endCondition = fn
    return this
  }

  /** 设置最大步数 */
  setMaxSteps(n: number): this {
    this.maxSteps = n
    return this
  }

  /** 构建图定义 */
  build(): GraphDef {
    if (!this.entryNode) {
      throw new Error('Entry node is required')
    }
    if (!this.nodes.has(this.entryNode)) {
      throw new Error(`Entry node not found: ${this.entryNode}`)
    }
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      stateSchema: this.stateSchema,
      nodes: this.nodes,
      edges: this.edges,
      entryNode: this.entryNode,
      endCondition: this.endCondition,
      maxSteps: this.maxSteps,
    }
  }
}

// ============================================================================
// 便捷构建函数
// ============================================================================

/** 创建一个简单节点 */
export function node(
  id: string,
  type: NodeDef['type'],
  execute: NodeDef['execute'],
  opts?: Partial<NodeDef>,
): NodeDef {
  return {
    id,
    type,
    label: opts?.label ?? id,
    execute,
    timeout: opts?.timeout,
    retry: opts?.retry,
    cacheTtl: opts?.cacheTtl,
    subgraphId: opts?.subgraphId,
  }
}

/** 创建一个函数节点 */
export function fnNode(
  id: string,
  fn: (state: StateValues, ctx: NodeContext) => Promise<NodeResult>,
  opts?: Partial<NodeDef>,
): NodeDef {
  return node(id, 'function', fn, opts)
}

/** 创建一个人工审批节点 */
export function humanNode(
  id: string,
  prompt: string,
  opts?: Partial<NodeDef>,
): NodeDef {
  return node(id, 'human', async (_state, ctx) => ({
    interrupt: {
      value: { prompt, state: _state },
      id: `${id}-${ctx.threadId}-${ctx.superStep}`,
    },
  }), opts)
}

/** 创建一个条件路由边 */
export function when(
  condition: (state: StateValues) => boolean,
  target: string,
): EdgeCondition {
  return (state) => condition(state) ? target : null
}

/** 创建一个多分支路由 */
export function router(
  fn: (state: StateValues) => string | string[] | null,
): EdgeCondition {
  return fn
}
