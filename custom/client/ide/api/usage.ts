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
}
