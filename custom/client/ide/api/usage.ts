// overlay/custom/client/ide/api/usage.ts
// 会话用量轮表 REST 客户端（G8）。GET /api/studio/sessions/:id/usage/rounds，
// server 侧见 patch 340（repositories/usage-store.ts getUsageRounds +
// controllers/sessions.ts usageRuns）：按 run_id 聚合 session_usage 行，
// 每 run 一行（同 run 多 source 行已合并）。
import { request } from '@/api/client'

export interface UsageRoundRow {
  run_id: string
  started_at: number
  ended_at: number
  api_calls: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  model: string
  agent: string
}

export const ideUsageApi = {
  rounds(sessionId: string, limit = 50): Promise<{ rounds: UsageRoundRow[] }> {
    return request<{ rounds: UsageRoundRow[] }>(
      `/api/studio/sessions/${encodeURIComponent(sessionId)}/usage/rounds?limit=${limit}`,
    )
  },
  /** 逐轮组成趋势（context-insights P2；server 见 custom/server/tokens/context-trend.ts） */
  contextTrend(sessionId: string): Promise<ContextTrendResponse> {
    return request<ContextTrendResponse>(`/api/ide/context-trend/${encodeURIComponent(sessionId)}`)
  },
  /** Fleet 编队子树聚合（P3；server 见 custom/server/tokens/fleet-tree.ts） */
  fleet(sessionId: string): Promise<FleetResponse> {
    return request<FleetResponse>(`/api/ide/fleet/${encodeURIComponent(sessionId)}`)
  },
}

export interface FleetCard {
  sessionId: string
  role: 'root' | 'parent' | 'current' | 'child'
  title: string
  agent: string
  model: string
  messageCount: number
  toolCallCount: number
  billedTokens: number
  costUsd: number
  lastActive: number
  isArchived: boolean
  subtreeTokens: number | null
  subtreeCostUsd: number | null
}

export interface FleetResponse {
  ok: boolean
  available?: boolean
  reason?: string
  rootId?: string
  parent?: FleetCard | null
  current?: FleetCard
  children?: FleetCard[]
  totals?: { sessions: number; billedTokens: number; costUsd: number }
  childrenTruncated?: boolean
}

/** 与 server foldContextTrend 输出对齐（available=false 时其余字段缺席，fail-soft）。 */
export interface ContextTrendStep {
  seq: number
  turn: number
  runId: string | null
  buckets: { system: number; user: number; assistant: number; tool: number }
  total: number
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; model: string | null } | null
}

export interface ContextTrendResponse {
  ok: boolean
  available?: boolean
  reason?: string
  steps?: ContextTrendStep[]
  events?: Array<{ kind: 'compaction'; throughMessageId: number; foldedMessages: number }>
  usageAligned?: 'run' | 'order-approx'
  isEstimate?: boolean
  truncated?: boolean
  charsPerToken?: number
}
