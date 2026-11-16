// 自建 GraphSpec 的受信执行能力：起跑前判定，不在编辑器 spec 内合成权限。
import type { GraphSpec } from './graph-spec'
import type { GateCommandEntry } from './gate-executor'
import type { GraphExecutionMode } from './run-spec-snapshot'

export interface SpecExecutionCapabilities {
  gateCatalog: GateCommandEntry[]
  hasRealKanbanBridge: boolean
  executionMode: GraphExecutionMode
}

/** 编辑器输入或当前能力不满足起跑条件；HTTP 壳可统一映射为 422。 */
export class EditorSpecError extends Error {
  readonly status = 422
  readonly statusCode = 422
  readonly code: string

  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'EditorSpecError'
    this.code = message === undefined ? 'spec_invalid' : code
  }
}

function unavailable(nodeId: string): never {
  throw new EditorSpecError(
    'agent_execution_unavailable',
    `Node '${nodeId}' requires an unavailable agent execution capability`,
  )
}

/**
 * 只读检查 spec 与受信能力，不 hydrate、不调用节点工厂，也不产生 gate/bridge 副作用。
 * 通用 Agent/subgraph 本批没有执行器；DryRun 仅由显式 shadow 声明开启。
 */
export function preflightSpecCapabilities(
  spec: GraphSpec,
  capabilities: SpecExecutionCapabilities,
): void {
  if (Object.hasOwn(spec.meta ?? {}, 'gateCommands')) {
    throw new EditorSpecError(
      'gate_meta_forbidden',
      'spec.meta.gateCommands cannot expand the trusted gate catalog',
    )
  }
  const catalog = Array.isArray(capabilities.gateCatalog) ? capabilities.gateCatalog : []
  for (const node of spec.nodes) {
    if (node.type === 'agent' || node.type === 'subgraph') unavailable(node.id)
    if (node.type === 'agent-task' &&
        !capabilities.hasRealKanbanBridge && capabilities.executionMode !== 'shadow') {
      unavailable(node.id)
    }
    if (node.type !== 'gate') continue

    const rawCommand = node.config.command
    if (rawCommand === undefined || rawCommand === null || !String(rawCommand).trim()) {
      throw new EditorSpecError('gate_command_missing', `Gate node '${node.id}' requires a command`)
    }
    const command = String(rawCommand)
    if (!catalog.some(entry => entry.command === command)) {
      throw new EditorSpecError(
        'gate_command_not_cataloged',
        `Gate node '${node.id}' command is not in the trusted catalog`,
      )
    }
    if (node.retry !== undefined || Object.hasOwn(node.config, 'retry')) {
      throw new EditorSpecError('gate_retry_forbidden', `Gate node '${node.id}' cannot use retry`)
    }
    if ((node.onError !== undefined && node.onError.type !== 'fail') ||
        Object.hasOwn(node.config, 'onError')) {
      throw new EditorSpecError('gate_on_error_forbidden', `Gate node '${node.id}' cannot route around failure`)
    }
  }
}
