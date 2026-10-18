// overlay/custom/client/ide/utils/task-mode.ts
// 任务模式派生与新建载荷（2026-10-18 双模式轮）：
//   派生不新增服务端字段——有 codingAgentId 的会话即编程任务，其余为工作任务（D-7）。
//   新建载荷集中此处，侧栏/命令面板/⌘N 共用，避免三处配方漂移。
import type { CodingAgentId } from '@/api/coding-agents'

export type IdeTaskMode = 'coding' | 'work'

/** 任务模式：编码标记（agent id / scoped|global 模式 / coding_agent 来源）任一在场即编程；
 *  其余（hermes 原生 / 历史聊天）为工作。判据收在一处，三处消费（徽标/模型取源/新建）同源。 */
export function sessionTaskMode(session?: {
  codingAgentId?: string | null
  codingAgentMode?: string | null
  source?: string | null
} | null): IdeTaskMode {
  if (!session) return 'work'
  if (session.codingAgentId) return 'coding'
  if (session.codingAgentMode === 'scoped' || session.codingAgentMode === 'global') return 'coding'
  if (session.source === 'coding_agent') return 'coding'
  return 'work'
}

/** 显式任务类型：只认真正出现过的标记；两头都没有（旧夹具/残缺数据）返回 null，
 *  调用方保持原偏好不误切（模型取源依赖它，误判会把 Ycode 模型写到 Hermes 会话）。 */
export function explicitTaskMode(session?: {
  codingAgentId?: string | null
  codingAgentMode?: string | null
  source?: string | null
  agent?: string | null
} | null): IdeTaskMode | null {
  if (!session) return null
  if (session.codingAgentId || session.codingAgentMode || session.source === 'coding_agent') return 'coding'
  if (session.source === 'cli' || session.source === 'api_server' || session.agent === 'hermes') return 'work'
  return null
}

export interface NewTaskOptionsInput {
  mode: IdeTaskMode
  /** 编程任务使用的编码 agent（工作模式忽略） */
  codingAgentId: CodingAgentId
  /** 编码 agent 在 chat store 的 agent 值（claude-code→claude 等；工作模式忽略） */
  chatAgent: string
  /** 编程任务绑定的工作区根（工作模式忽略，固定 null） */
  workspace: string | null
  /** 编程任务的默认模型（Ycode 目录；工作模式忽略，由 Hermes 当前选择决定） */
  model?: string | null
  provider?: string | null
}

/**
 * 生成 chatStore.newChat 入参。
 * 编程=现有 zcode 配方（scoped 会话级模型 + 工作区）；
 * 工作=hermes 原生会话（无 codingAgentId、不绑仓库、模型取 Hermes 当前选择）。
 */
export function buildNewTaskOptions(input: NewTaskOptionsInput): Record<string, unknown> {
  if (input.mode === 'work') {
    return { agent: 'hermes', source: 'cli', workspace: null }
  }
  const modelPayload = input.model ? { model: input.model, provider: input.provider || '' } : {}
  return {
    agent: input.chatAgent,
    codingAgentId: input.codingAgentId,
    codingAgentMode: 'scoped',
    source: 'coding_agent',
    workspace: input.workspace,
    ...modelPayload,
  }
}

