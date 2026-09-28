// overlay/custom/client/ide/api/workflows.ts
// 工作流查询面 REST 客户端（workflow 集成轮）。
// 端点 = 服务端 engine-controller 的 workflow 四条 GET（引擎 RPC 透传：
// conversationWorkflowRunsV4 / conversationWorkflowRunEventsV4 / listSavedWorkflows /
// listSavedWorkflowRuns；引擎离线时 503 {reason:'engine_unreachable'}）。
import type { ZcodeWorkflowActivity } from '../../zcode/store/zcode-projection'

export interface WorkflowRunRecord {
  runId: string
  status?: string
  stopReason?: string
  startedAt?: number
  endedAt?: number
  name?: string
  currentPhase?: string
  [k: string]: unknown
}

export interface WorkflowRunEventRecord {
  sequence?: number
  type?: string
  at?: number
  [k: string]: unknown
}

export interface SavedWorkflowRecord {
  name: string
  description?: string
  scope?: string
  updatedAt?: string
  [k: string]: unknown
}

async function getJson<T = Record<string, unknown>>(path: string): Promise<T> {
  const res = await fetch(path)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const reason = (body as { reason?: string }).reason ?? `http_${res.status}`
    throw new Error(`${reason}: ${(body as { detail?: string }).detail ?? ''}`)
  }
  return body as T
}

export async function fetchWorkflowRuns(workspacePath: string, sessionId: string, limit = 50): Promise<WorkflowRunRecord[]> {
  const data = await getJson<{ runs?: WorkflowRunRecord[] }>(`/api/zcode-engine/workflow/runs?workspacePath=${encodeURIComponent(workspacePath)}&sessionId=${encodeURIComponent(sessionId)}&limit=${limit}`)
  return data.runs ?? []
}

export async function fetchWorkflowRunEvents(workspacePath: string, sessionId: string, runId: string, afterSequence?: number, limit = 100): Promise<WorkflowRunEventRecord[]> {
  const params = new URLSearchParams({ workspacePath, sessionId, runId, limit: String(limit) })
  if (afterSequence !== undefined) params.set('afterSequence', String(afterSequence))
  const data = await getJson<{ events?: WorkflowRunEventRecord[] }>(`/api/zcode-engine/workflow/run-events?${params.toString()}`)
  return data.events ?? []
}

export async function fetchSavedWorkflows(workspacePath: string, scope?: 'project' | 'global'): Promise<SavedWorkflowRecord[]> {
  const params = new URLSearchParams({ workspacePath })
  if (scope) params.set('scope', scope)
  const data = await getJson<{ workflows?: SavedWorkflowRecord[] }>(`/api/zcode-engine/workflow/saved?${params.toString()}`)
  return data.workflows ?? []
}

export async function fetchSavedWorkflowRuns(workspacePath: string, name?: string, limit = 20, scope?: 'project' | 'global'): Promise<WorkflowRunRecord[]> {
  const params = new URLSearchParams({ workspacePath, limit: String(limit) })
  if (name) params.set('name', name)
  if (scope) params.set('scope', scope)
  const data = await getJson<{ runs?: WorkflowRunRecord[] }>(`/api/zcode-engine/workflow/saved-runs?${params.toString()}`)
  return data.runs ?? []
}

/** 会话摘要里的 workflowActivity 直通（侧栏运行行用；键缺席返回 undefined）。 */
export function activityOf(session: { workflowActivity?: ZcodeWorkflowActivity } | undefined): ZcodeWorkflowActivity | undefined {
  return session?.workflowActivity
}
