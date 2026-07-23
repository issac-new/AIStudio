// overlay/custom/server/loop/graph/node-registry.ts
// NodeRegistry — 节点类型注册表
// 支持注册不同类型的节点（loop / function / human / retrieval / subgraph）

import type { NodeDef, NodeContext, NodeResult, StateValues } from './types'

export type NodeFactory = (config: Record<string, unknown>) => NodeDef

export class NodeRegistry {
  private factories: Map<string, NodeFactory> = new Map()

  /** 注册节点类型工厂 */
  register(type: string, factory: NodeFactory): void {
    this.factories.set(type, factory)
  }

  /** 创建节点实例 */
  create(type: string, config: Record<string, unknown>): NodeDef {
    const factory = this.factories.get(type)
    if (!factory) {
      throw new Error(`Unknown node type: ${type}`)
    }
    return factory(config)
  }

  /** 列出所有已注册类型 */
  listTypes(): string[] {
    return [...this.factories.keys()]
  }
}

// ============================================================================
// 内置节点类型工厂
// ============================================================================

/** 创建默认注册表，包含内置节点类型 */
export function createDefaultRegistry(): NodeRegistry {
  const registry = new NodeRegistry()

  // loop-node: 包装一个现有 Loop Engine 为图中的一个节点
  registry.register('loop', (config) => ({
    id: config.id as string,
    type: 'loop' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (state: StateValues, ctx: NodeContext): Promise<NodeResult> => {
      // 调用现有 LoopEngine tick
      const { store } = ctx.deps as any
      if (!store) throw new Error('Loop node requires store in deps')
      // 在实际使用中，这里会调用 LoopEngine.tick()
      // 简化：返回状态更新
      return {
        update: { [`${config.id}_completed`]: true },
        goto: [],
      }
    },
    timeout: (config.timeout as number) ?? 300000,
  }))

  // function-node: 执行确定性函数
  registry.register('function', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: config.execute as (state: StateValues, ctx: NodeContext) => Promise<NodeResult>,
    timeout: (config.timeout as number) ?? 60000,
    retry: config.retry as { maxAttempts: number; backoffMs: number } | undefined,
  }))

  // human-node: 人工审批节点
  registry.register('human', (config) => ({
    id: config.id as string,
    type: 'human' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (state: StateValues, ctx: NodeContext): Promise<NodeResult> => {
      // 发出 interrupt 等待人工输入
      const prompt = (config.prompt as string) ?? 'Approval required'
      return {
        interrupt: {
          value: { prompt, state },
          id: `${config.id}-${ctx.threadId}-${ctx.superStep}`,
        },
      }
    },
    timeout: (config.timeout as number) ?? 86400000, // 24h
  }))

  // retrieval-node: 检索节点（GraphRAG 模式）
  registry.register('retrieval', (config) => ({
    id: config.id as string,
    type: 'retrieval' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (state: StateValues, ctx: NodeContext): Promise<NodeResult> => {
      // 检索逻辑（实际实现时调用搜索/DB/向量库）
      return {
        update: { [`${config.id}_results`]: [] },
      }
    },
    timeout: (config.timeout as number) ?? 30000,
  }))

  // subgraph-node: 子图节点
  registry.register('subgraph', (config) => ({
    id: config.id as string,
    type: 'subgraph' as const,
    label: (config.label as string) ?? (config.id as string),
    subgraphId: config.subgraphId as string,
    execute: async (state: StateValues, ctx: NodeContext): Promise<NodeResult> => {
      // 子图执行逻辑 — 实际由 GraphRuntime 递归处理
      return {
        update: {},
        goto: [],
      }
    },
    timeout: (config.timeout as number) ?? 300000,
  }))

  return registry
}
