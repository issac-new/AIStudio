// overlay/custom/client/matrix-teams/agent-router.ts
// M-B 路由与拆分：按 agent.profile 能力标签匹配本机 Agent（MVP 计划 §4 M-B）。
// 纯函数、无 IO：决策表单测的单一事实源。容错纪律同协议层：非法输入不抛，走保守分支。
import type { AgentDescriptor } from './protocol'

/** 本机某 agent 当前在途任务数（来源：dispatch kv 中 routedAgentId 归属计数）。 */
export interface AgentLoad {
  agentId: string
  running: number
}

export type RouteDecision =
  | { kind: 'assigned'; agent: AgentDescriptor }
  | { kind: 'no-match' }
  | { kind: 'queued'; reason: 'max-parallel' }

/** maxParallel 缺省语义：保守取 1（agent 未声明并发上限时按串行处理，声明值可放宽）。 */
export const DEFAULT_MAX_PARALLEL = 1

/** 执行轴「在途」判定：created/running/waiting-human 占用并发额度，done/failed 释放。 */
export const LOAD_OCCUPYING_STATUSES: readonly string[] = ['created', 'running', 'waiting-human']

export function isLoadOccupying(status: string): boolean {
  return LOAD_OCCUPYING_STATUSES.includes(status)
}

/**
 * 能力路由决策（M-B 验收门 1 的决策表）：
 * - 匹配语义：agent 必须覆盖 assign.capability 的全部标签（严格超集，确定性）；
 * - 候选中按「在途最少优先，同载按 agentId 字典序」取一（确定性，可测）；
 * - 无任何覆盖者 → no-match（调用方回执 failed 'no-capability-match'）；
 * - 有覆盖者但全部达到 maxParallel → queued（调用方入队，槽位释放后重试）；
 * - capability 为空/缺失 → no-match（调用方对无标签 assign 不应调用本函数，走既有三级回退）。
 */
export function selectAgent(
  assign: { capability?: string[] },
  agents: readonly AgentDescriptor[],
  loads: readonly AgentLoad[],
): RouteDecision {
  const required = assign.capability ?? []
  if (required.length === 0) return { kind: 'no-match' }
  const loadOf = (agentId: string): number => loads.find(l => l.agentId === agentId)?.running ?? 0
  const covering = agents
    .filter(a => required.every(tag => a.capabilities.includes(tag)))
    .map(a => ({ agent: a, running: loadOf(a.agentId) }))
    .sort((x, y) => x.running - y.running || (x.agent.agentId < y.agent.agentId ? -1 : 1))
  if (covering.length === 0) return { kind: 'no-match' }
  const eligible = covering.filter(e => e.running < (e.agent.maxParallel ?? DEFAULT_MAX_PARALLEL))
  if (eligible.length === 0) return { kind: 'queued', reason: 'max-parallel' }
  return { kind: 'assigned', agent: eligible[0].agent }
}
