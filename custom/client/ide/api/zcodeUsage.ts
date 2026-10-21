// overlay/custom/client/ide/api/zcodeUsage.ts
// 本机 zcode 用量账本 REST 客户端（2026-10-21 dsh-context 数据面吸收轮）。
// 消费 GET /api/ide/zcode-usage/*（server 侧 custom/server/controllers/ide/
// zcode-usage.ts：只读 ~/.zcode/cli/db 三张用量表——model_usage/tool_usage/turn_usage）。
// 覆盖面=本机 zcode 全部会话（引擎/CLI/子代理/workflow 子任务），与 studio
// 自身落账的 /usage/rounds（session_usage）互补。
import { authFetch } from '../utils/auth-fetch'

export interface ZcodeTokenSums {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheWriteTokens: number
  cacheReadTokens: number
}

export interface ZcodeSummaryKpi extends ZcodeTokenSums {
  billedTokens: number
  sessions: number
  turns: number
  modelCalls: number
  modelErrors: number
  toolCalls: number
  toolErrors: number
  turnErrors: number
  cacheHitRate: number | null
  activeMs: number
}

export interface ZcodeSummary {
  days: number
  fromMs: number | null
  kpi: ZcodeSummaryKpi
  byDay: Array<{ day: string; billedTokens: number; modelCalls: number }>
  byModel: Array<{ provider: string; model: string; calls: number; errors: number } & ZcodeTokenSums & { billedTokens: number }>
  byAgent: Array<{ agent: string; calls: number; billedTokens: number }>
  bySource: Array<{ source: string; calls: number; billedTokens: number }>
  note?: string
}

export interface ZcodeUsageSession extends ZcodeTokenSums {
  id: string
  title: string
  directory: string
  taskType: string
  parentId: string | null
  isSubagent: boolean
  timeCreated: number
  timeUpdated: number
  turns: number
  modelCalls: number
  toolCalls: number
  turnErrors: number
  firstAt: number | null
  lastAt: number | null
  billedTokens: number
}

export interface ZcodeUsageRound {
  turnId: string
  status: string
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  ttftMs: number | null
  modelRequestCount: number
  toolCallCount: number
  toolErrorCount: number
  errorType: string
  errorCode: string
  models: Array<{ provider: string; model: string; calls: number } & ZcodeTokenSums & { billedTokens: number }>
}

export interface ZcodeUsageTool {
  id: string
  turnId: string | null
  toolName: string
  status: string
  startedAt: number
  completedAt: number | null
  durationMs: number | null
  readOnly: boolean
  destructive: boolean
  approvalStatus: string
  outputBytes: number
  errorType: string
}

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`zcode-usage → ${res.status}`)
  return res.json() as Promise<T>
}

export const zcodeUsageApi = {
  summary(days: number): Promise<ZcodeSummary> {
    return getJson<ZcodeSummary>(`/api/ide/zcode-usage/summary?days=${days}`)
  },
  sessions(limit = 30): Promise<{ sessions: ZcodeUsageSession[]; note?: string }> {
    return getJson(`/api/ide/zcode-usage/sessions?limit=${limit}`)
  },
  rounds(sessionId: string, limit = 50): Promise<{ rounds: ZcodeUsageRound[] }> {
    return getJson(`/api/ide/zcode-usage/sessions/${encodeURIComponent(sessionId)}/rounds?limit=${limit}`)
  },
  tools(sessionId: string, limit = 100): Promise<{ tools: ZcodeUsageTool[] }> {
    return getJson(`/api/ide/zcode-usage/sessions/${encodeURIComponent(sessionId)}/tools?limit=${limit}`)
  },
}
