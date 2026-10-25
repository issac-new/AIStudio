import type { AgentToolDefinition, ModelCapabilities } from '../model/types'

export type AgentToolApprovalChoice = 'once' | 'session' | 'always' | 'deny'

export interface AgentToolApprovalRequest {
  approvalId: string
  toolName: string
  key: string
  command: string
  description: string
  choices: AgentToolApprovalChoice[]
  allowPermanent: boolean
  timeoutMs: number
}

export type AgentToolApprovalRequester = (
  request: AgentToolApprovalRequest,
) => Promise<AgentToolApprovalChoice>

export interface AgentClarificationRequest {
  clarifyId: string
  question: string
  choices?: string[]
  timeoutMs: number
}

export type AgentClarificationRequester = (
  request: AgentClarificationRequest,
) => Promise<string>

export interface AgentToolAuthorizationDecision {
  approved: boolean
  scope: 'safe' | 'once' | 'session' | 'always' | 'denied'
  key?: string
  description?: string
  error?: string
}

export type AgentToolAuthorizer = (
  toolName: string,
  input: Record<string, unknown>,
  context?: AgentToolContext,
) => Promise<AgentToolAuthorizationDecision>

export interface AgentToolContext {
  /** Host-bound reader for durable session goals; distinct from this run's updatePlan callback. */
  listSessionTasks?: () => import('./session-tasks').AgentSessionTasksSnapshot | Promise<import('./session-tasks').AgentSessionTasksSnapshot>
  /** Host-bound writer for the current session's goals, separate from run execution plans. */
  updateSessionTasks?: (update: import('./session-tasks').AgentSessionTasksUpdate) => import('./session-tasks').AgentSessionTasksSnapshot | Promise<import('./session-tasks').AgentSessionTasksSnapshot>
  updatePlan?: (update: import('./plan').AgentPlanUpdate) => import('./plan').AgentTaskPlan
  runId?: string
  cwd?: string
  workspaceRoot?: string
  workspaceId?: string
  userId?: string
  sessionId?: string
  profileId?: string
  sourceMessageIds?: string[]
  memoryWritePolicy?: import('../memory/types').MemoryWritePolicy
  memoryExplicitIntent?: boolean
  memoryForgetIntent?: boolean
  memoryForgetAllIntent?: boolean
  memoryOrigin?: import('../memory/types').MemoryOrigin
  memoryRecallScopes?: import('../memory/types').MemoryScope[]
  memoryWriteScopes?: import('../memory/types').MemoryScope[]
  memoryDefaultWriteScope?: import('../memory/types').MemoryScope
  browserSessionId?: string
  mcpServers?: Record<string, unknown>
  /** Isolate MCP connections for this scope; aborting it closes them without cancelling the agent. */
  mcpSessionSignal?: AbortSignal
  /** Computer Use owns a native driver for this run; abort to close it and release the desktop. */
  computerUseSessionSignal?: AbortSignal
  timeoutMs?: number
  signal?: AbortSignal
  requestToolApproval?: AgentToolApprovalRequester
  requestUserClarification?: AgentClarificationRequester
  /** Capabilities of the model that will consume this tool result. */
  modelCapabilities?: ModelCapabilities
  modelProvider?: string
  modelName?: string
  skillMutationSource?: 'foreground' | 'background-review'
  delegationDepth?: number
  delegateTask?: AgentTaskDelegate
}

export type AgentTaskMode = 'foreground' | 'background'

export interface AgentTaskRequest {
  goal: string
  context?: string
  mode: AgentTaskMode
}

export type AgentTaskDelegate = (request: AgentTaskRequest) => Promise<AgentToolResult>

export interface AgentToolResult {
  ok: boolean
  content: string
  contentParts?: AgentToolContentPart[]
  data?: unknown
  error?: string
}

export type AgentToolContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

export type AgentToolConcurrency = 'serial' | 'parallel'

export interface AgentTool<TInput extends Record<string, unknown> = Record<string, unknown>> {
  definition: AgentToolDefinition
  /** Defaults to serial. Use parallel only when independent calls cannot race through shared mutable state. */
  concurrency?: AgentToolConcurrency
  execute(input: TInput, context?: AgentToolContext): Promise<AgentToolResult>
}

export interface AgentToolProvider {
  id: string
  listTools(context?: AgentToolContext): Promise<AgentTool[]>
}

export class AgentToolError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'AgentToolError'
  }
}

// HERMES_CUSTOM[tool-waterfall] P1（2026-10-04 九源轮）：工具执行瀑布钩子。
// preExecute 在 authorizer 之后、真实执行之前（权限先于一切副作用）；
// postExecute 在执行之后、结果回填模型之前（可改写）。来源：《Agent Harness
// 工程》"schema 校验→权限→审批→Hook→能力路由"分层 + dsh tools/pre-execute→
// tools/execute→tools/post-execute 瀑布。钩子异常=放行原路径（fail-open 由
// 调用方约定；ekko 默认无钩子，行为零变化）。
export interface ToolExecuteHook {
  preExecute?(
    name: string,
    input: Record<string, unknown>,
    context?: AgentToolContext,
  ): Promise<{ allow: false; error: string } | void> | { allow: false; error: string } | void
  postExecute?(
    name: string,
    input: Record<string, unknown>,
    result: AgentToolResult,
    context?: AgentToolContext,
  ): Promise<AgentToolResult | void> | AgentToolResult | void
}
