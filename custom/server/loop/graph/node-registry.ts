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
  // P0 未接线：抛错而非静默返回空 update，防止静默空跑
  registry.register('loop', (config) => ({
    id: config.id as string,
    type: 'loop' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (): Promise<NodeResult> => {
      throw new Error(`loop node '${config.id}' not implemented (P1): LoopEngine 接线在 P1 完成`)
    },
    timeout: (config.timeout as number) ?? 300000,
  }))

  // function-node: 执行确定性函数
  // config.execute 为函数时直用（内存构建）；为字符串（如 'noop'）时按名查 deps.fnTable；
  // 两者都缺 → 抛错
  registry.register('function', (config) => ({
    id: config.id as string,
    type: 'function' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (state: StateValues, ctx: NodeContext): Promise<NodeResult> => {
      let fn: NodeDef['execute'] | undefined
      if (typeof config.execute === 'function') {
        fn = config.execute as NodeDef['execute']
      } else if (typeof config.execute === 'string') {
        fn = ctx.deps.fnTable?.[config.execute]
        if (!fn) {
          throw new Error(
            `function node '${config.id}': execute '${config.execute}' not found in deps.fnTable`,
          )
        }
      }
      if (!fn) {
        throw new Error(
          `function node '${config.id}': no execute available (provide config.execute function/name or deps.fnTable)`,
        )
      }
      return fn(state, ctx)
    },
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
    timeout: (config.timeoutMs as number) ?? (config.timeout as number) ?? 86400000, // 24h
  }))

  // retrieval-node: 检索节点（GraphRAG 模式）
  // P0 未接线：抛错而非静默返回空 update，防止静默空跑
  registry.register('retrieval', (config) => ({
    id: config.id as string,
    type: 'retrieval' as const,
    label: (config.label as string) ?? (config.id as string),
    execute: async (): Promise<NodeResult> => {
      throw new Error(`retrieval node '${config.id}' not implemented (P1): 检索接线在 P1 完成`)
    },
    timeout: (config.timeout as number) ?? 30000,
  }))

  // subgraph-node: 子图节点 — 经 deps.subgraphRunner 递归执行
  registry.register('subgraph', (config) => ({
    id: config.id as string,
    type: 'subgraph' as const,
    label: (config.label as string) ?? (config.id as string),
    subgraphId: config.subgraphId as string,
    execute: async (state: StateValues, ctx: NodeContext): Promise<NodeResult> => {
      const runner = ctx.deps.subgraphRunner
      if (!runner) {
        throw new Error(
          `subgraph node '${config.id}' requires deps.subgraphRunner (subgraphId: '${config.subgraphId}')`,
        )
      }
      return runner(config.subgraphId as string, state, ctx)
    },
    timeout: (config.timeout as number) ?? 300000,
  }))

  return registry
}
