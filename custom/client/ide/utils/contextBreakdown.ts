// overlay/custom/client/ide/utils/contextBreakdown.ts
// 上下文构成分解（G4 前端估算版）。
//
// 语义源：dsh token-meter contextBreakdown（system/tools/message 三段之和恒等）+
// minimax /context 六段（SYSTEM_PROMPT/MEMORY/TOOLS/SKILLS/MESSAGES/OTHER）。
// 前端可见数据只有会话消息（chatStore.activeSession.messages）与服务端汇总的
// contextUsed（input+cacheRead+cacheWrite 口径），因此收敛为四段：
//   user / assistant（含 reasoning）/ tool（工具调用定义+结果）/ system+其他（推算桶）。
// 推算桶 = contextUsed - Σ可见分段，涵盖系统提示词、技能、工具 schema、记忆等
// 客户端不可见注入；消息无 token_count 时按 chars/4 估计（isEstimate=true 诚实标注）。
// hermes-agent 侧产 span 后可升级精确版（R5+）。
export interface BreakdownMessage {
  role: string
  content: string
  token_count?: number | null
  reasoning?: string | null
  tool_calls?: unknown
}

export interface ContextSegment {
  key: 'user' | 'assistant' | 'tool' | 'system'
  tokens: number
  /** 占 contextUsed 的百分比（0-100，一位小数内） */
  pct: number
}

export interface ContextBreakdown {
  segments: ContextSegment[]
  /** 客户端可归因 token 数（Σ前三段 + 可见 system 消息） */
  knownTokens: number
  /** 推算桶 token 数（≥0） */
  inferredTokens: number
  /** 构成总口径 = contextUsed */
  total: number
  /** 任一消息走了 chars/4 估计即为 true */
  isEstimate: boolean
}

const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function toolCallsChars(toolCalls: unknown): number {
  if (!toolCalls) return 0
  if (Array.isArray(toolCalls)) return toolCalls.reduce((sum, call) => sum + JSON.stringify(call ?? '').length, 0)
  return JSON.stringify(toolCalls).length
}

/**
 * 计算上下文构成。messages 为空或 contextUsed ≤0 时返回 null（无可分解口径）。
 * 各分段 token 不做上限裁剪，但推算桶下限 0（消息估计偏差不至于出负数即可）。
 */
export function computeBreakdown(messages: BreakdownMessage[], contextUsed: number): ContextBreakdown | null {
  if (!Array.isArray(messages) || messages.length === 0) return null
  if (!Number.isFinite(contextUsed) || contextUsed <= 0) return null

  let user = 0
  let assistant = 0
  let tool = 0
  let system = 0
  let isEstimate = false

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : ''
    const known = typeof msg.token_count === 'number' && Number.isFinite(msg.token_count) && msg.token_count > 0
    if (!known) isEstimate = true
    const base = known ? msg.token_count : estimateTokens(content)
    const reasoning = typeof msg.reasoning === 'string' && msg.reasoning ? estimateTokens(msg.reasoning) : 0
    const calls = toolCallsChars(msg.tool_calls)
    if (calls > 0) isEstimate = true

    switch (msg.role) {
      case 'user':
        user += base
        break
      case 'assistant':
        assistant += base + reasoning
        tool += calls > 0 ? Math.ceil(calls / CHARS_PER_TOKEN) : 0
        break
      case 'tool':
        tool += base
        break
      default:
        // system / command / moa 等可见系统类消息
        system += base
        break
    }
  }

  const knownTokens = user + assistant + tool + system
  const inferredTokens = Math.max(0, Math.round(contextUsed - knownTokens))
  const total = contextUsed

  const mk = (key: ContextSegment['key'], tokens: number): ContextSegment => ({
    key,
    tokens,
    pct: total > 0 ? Math.round((tokens / total) * 1000) / 10 : 0,
  })

  return {
    segments: [
      mk('user', user),
      mk('assistant', assistant),
      mk('tool', tool),
      mk('system', system + inferredTokens),
    ],
    knownTokens,
    inferredTokens,
    total,
    isEstimate,
  }
}
