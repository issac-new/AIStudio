import { request, getApiKey, getBaseUrlValue } from '../client'

// ─── Types ──────────────────────────────────────────────────────

export type KanbanTaskStatus = 'triage' | 'todo' | 'scheduled' | 'ready' | 'running' | 'blocked' | 'review' | 'done' | 'archived'

export interface KanbanTask {
  id: string
  title: string
  body: string | null
  assignee: string | null
  status: KanbanTaskStatus
  priority: number
  created_by: string | null
  created_at: number
  started_at: number | null
  completed_at: number | null
  workspace_kind: string
  workspace_path: string | null
  tenant: string | null
  project_id: string | null
  result: string | null
  skills: string[] | null
  // ─── v0.19 运维状态字段（overlay 补齐，均 optional/nullable，向后兼容）───
  branch_name?: string | null
  idempotency_key?: string | null
  consecutive_failures?: number
  worker_pid?: number | null
  last_failure_error?: string | null
  max_runtime_seconds?: number | null
  last_heartbeat_at?: number | null
  current_run_id?: number | null
  workflow_template_id?: string | null
  current_step_key?: string | null
  model_override?: string | null
  max_retries?: number | null
  goal_max_turns?: number | null
  session_id?: string | null
  block_kind?: string | null
  block_recurrences?: number
  claim_lock?: string | null
  claim_expires?: number | null
  latest_summary?: string | null
  goal_mode?: boolean
}

export interface KanbanRun {
  id: number
  task_id: string
  profile: string | null
  status: string
  outcome: string | null
  summary: string | null
  error: string | null
  metadata: Record<string, unknown> | null
  worker_pid: number | null
  started_at: number
  ended_at: number | null
}

export interface KanbanComment {
  id: number | string
  task_id: string
  author: string
  body: string
  created_at: number
}

export interface KanbanEvent {
  id: number | string
  task_id: string
  kind: string
  payload: Record<string, unknown> | null
  created_at: number
  run_id: number | null
}

export interface KanbanTaskMessage {
  id: number | string
  session_id: string
  role: string
  content: string
  tool_call_id: string | null
  tool_calls: any[] | null
  tool_name: string | null
  timestamp: number
  token_count: number | null
  finish_reason: string | null
  reasoning: string | null
}

export interface KanbanTaskSession {
  id: string
  title: string | null
  source: string
  model: string
  started_at: number
  ended_at: number | null
  messages: KanbanTaskMessage[]
}

export interface KanbanTaskDetail {
  task: KanbanTask
  latest_summary: string | null
  session?: KanbanTaskSession
  comments: KanbanComment[]
  events: KanbanEvent[]
  runs: KanbanRun[]
  parents?: string[]
  children?: string[]
}

export interface KanbanAttachment {
  id: number
  filename: string
  content_type: string | null
  size: number
  uploaded_by: string | null
  created_at: number
}

export interface KanbanStats {
  by_status: Record<string, number>
  by_assignee: Record<string, number>
  total: number
}

export interface KanbanAssignee {
  name: string
  on_disk: boolean
  counts: Record<string, number> | null
}

export interface KanbanBoard {
  slug: string
  name: string
  description: string
  icon: string
  color: string
  created_at: number | null
  archived: boolean
  db_path?: string
  is_current?: boolean
  counts: Record<string, number>
  total: number
}

export interface KanbanBoardCreateRequest {
  slug: string
  name?: string
  description?: string
  icon?: string
  color?: string
  switchCurrent?: boolean
}

export interface KanbanCapabilityStatus {
  key: string
  status: 'supported' | 'partial' | 'missing'
  reason?: string
  canonicalRoute?: string
  canonicalCommand?: string
  requiresBoard: boolean
}

export interface KanbanCapabilities {
  source: 'hermes-cli'
  supports: Record<string, boolean>
  missing: string[]
  capabilities?: KanbanCapabilityStatus[]
}

// KanbanAttachment 复用 v0.6.35 上游内置定义（id/filename/content_type/size/uploaded_by/created_at）

export interface KanbanDiagnosticAction {
  kind: string
  label: string
  suggested?: boolean
  payload?: Record<string, unknown>
}

export interface KanbanDiagnosticItem {
  kind: string
  title: string
  detail: string
  severity: 'warning' | 'error' | 'critical'
  count: number
  last_seen_at: number
  data: Record<string, unknown>
  actions: KanbanDiagnosticAction[]
}

export interface KanbanDiagnostic {
  task_id: string
  task_title: string
  task_status: string
  task_assignee: string | null
  diagnostics: KanbanDiagnosticItem[]
}

export interface KanbanOrchestrationProfile {
  name: string
  description: string
}

export interface KanbanOrchestration {
  orchestrator_profile?: string
  default_assignee?: string
  auto_decompose: boolean
  profiles: KanbanOrchestrationProfile[]
}

export interface KanbanOrchestrationPatch {
  orchestrator_profile?: string
  default_assignee?: string
  auto_decompose?: boolean
}

export interface KanbanProfileDescriptionPatch {
  description: string
}

export interface KanbanCreateRequest {
  title: string
  body?: string
  assignee?: string
  priority?: number
  tenant?: string
  project?: string
  workspace?: string
  branch?: string
  triage?: boolean
  skills?: string[]
  maxRuntime?: string
  maxRetries?: number
  goalMode?: boolean
  goalMaxTurns?: number
}

export interface KanbanBoardOptions {
  board?: string
}

export interface KanbanListOptions extends KanbanBoardOptions {
  status?: string
  assignee?: string
  tenant?: string
  includeArchived?: boolean
}

export interface KanbanCommentCreateRequest {
  body: string
  author?: string
}

export interface KanbanTaskLogOptions extends KanbanBoardOptions {
  tail?: number
}

export interface KanbanTaskLog {
  exists: boolean
  content: string
  size_bytes: number
  truncated: boolean
  path: string
}

export interface KanbanDiagnosticsOptions extends KanbanBoardOptions {
  task?: string
  severity?: 'warning' | 'error' | 'critical'
}

export interface KanbanReclaimOptions extends KanbanBoardOptions {
  reason?: string
}

export interface KanbanReassignOptions extends KanbanBoardOptions {
  reclaim?: boolean
  reason?: string
}

export interface KanbanSpecifyOptions extends KanbanBoardOptions {
  author?: string
}

export interface KanbanDispatchOptions extends KanbanBoardOptions {
  dryRun?: boolean
  max?: number
  failureLimit?: number
}

export interface KanbanLinkRequest {
  parent_id: string
  child_id: string
}

export interface KanbanBulkUpdateRequest {
  ids: string[]
  status?: KanbanTaskStatus
  assignee?: string | null
  archive?: boolean
  summary?: string
  reason?: string
}

export interface KanbanBulkTaskResult {
  id: string
  ok: boolean
  error?: string
}

function normalizedBoard(board?: string): string {
  const trimmed = board?.trim()
  return trimmed || 'default'
}

function activeProfileName(): string | null {
  try {
    return localStorage.getItem('hermes_active_profile_name')
  } catch {
    return null
  }
}

function appendQuery(path: string, params: URLSearchParams): string {
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

function boardParams(board?: string): URLSearchParams {
  const params = new URLSearchParams()
  params.set('board', normalizedBoard(board))
  return params
}

function websocketProtocol(base?: string): string {
  if (base) return base.startsWith('https') ? 'wss:' : 'ws:'
  return location.protocol === 'https:' ? 'wss:' : 'ws:'
}

function formatHostForPort(hostname: string, port: number): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) return `${hostname}:${port}`
  return hostname.includes(':') ? `[${hostname}]:${port}` : `${hostname}:${port}`
}

export function buildKanbanEventsWebSocketUrl(opts?: KanbanBoardOptions): string {
  const base = getBaseUrlValue()
  const params = boardParams(opts?.board)
  const token = getApiKey()
  if (token) params.set('token', token)
  const profile = activeProfileName()
  if (profile) params.set('profile', profile)
  const path = `/api/hermes/kanban/events?${params.toString()}`

  if (base) {
    return `${websocketProtocol(base)}//${new URL(base).host}${new URL(base).pathname.replace(/\/$/, '')}${path}`
  }

  const directDevPort = import.meta.env.VITE_HERMES_DIRECT_WS_PORT
  const host = import.meta.env.DEV && directDevPort
    ? formatHostForPort(location.hostname, Number(directDevPort))
    : location.host
  return `${websocketProtocol()}//${host}${path}`
}

export function openKanbanEventStream(opts?: KanbanBoardOptions): WebSocket {
  return new WebSocket(buildKanbanEventsWebSocketUrl(opts))
}

// ─── API functions ───────────────────────────────────────────────

export async function listBoards(opts?: { includeArchived?: boolean }): Promise<KanbanBoard[]> {
  const params = new URLSearchParams()
  if (opts?.includeArchived) params.set('includeArchived', 'true')
  const res = await request<{ boards: KanbanBoard[] }>(appendQuery('/api/hermes/kanban/boards', params))
  return res.boards
}

export async function createBoard(data: KanbanBoardCreateRequest): Promise<KanbanBoard> {
  const res = await request<{ board: KanbanBoard }>('/api/hermes/kanban/boards', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return res.board
}

export async function archiveBoard(slug: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/hermes/kanban/boards/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  })
}

export async function getCapabilities(): Promise<KanbanCapabilities> {
  const res = await request<{ capabilities: KanbanCapabilities }>('/api/hermes/kanban/capabilities')
  return res.capabilities
}

export async function listTasks(opts?: KanbanListOptions): Promise<KanbanTask[]> {
  const params = boardParams(opts?.board)
  if (opts?.status) params.set('status', opts.status)
  if (opts?.assignee) params.set('assignee', opts.assignee)
  if (opts?.tenant) params.set('tenant', opts.tenant)
  if (opts?.includeArchived) params.set('includeArchived', 'true')
  const res = await request<{ tasks: KanbanTask[] }>(appendQuery('/api/hermes/kanban', params))
  return res.tasks
}

export async function getTask(id: string, opts?: KanbanBoardOptions): Promise<KanbanTaskDetail> {
  return request<KanbanTaskDetail>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(id)}`, boardParams(opts?.board)))
}

export async function listAttachments(taskId: string, opts?: KanbanBoardOptions): Promise<KanbanAttachment[]> {
  const res = await request<{ attachments: KanbanAttachment[] }>(
    appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/attachments`, boardParams(opts?.board)),
  )
  return res.attachments
}

export function getAttachmentContentPath(taskId: string, attachmentId: number, opts?: KanbanBoardOptions): string {
  return appendQuery(
    `/api/hermes/kanban/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(String(attachmentId))}`,
    boardParams(opts?.board),
  )
}

export async function createTask(data: KanbanCreateRequest, opts?: KanbanBoardOptions): Promise<KanbanTask> {
  const res = await request<{ task: KanbanTask }>(appendQuery('/api/hermes/kanban', boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return res.task
}

export async function completeTasks(taskIds: string[], summary?: string, opts?: KanbanBoardOptions): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(appendQuery('/api/hermes/kanban/complete', boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify({ task_ids: taskIds, summary }),
  })
}

export async function blockTask(taskId: string, reason: string, opts?: KanbanBoardOptions): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/block`, boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function unblockTasks(taskIds: string[], opts?: KanbanBoardOptions): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(appendQuery('/api/hermes/kanban/unblock', boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify({ task_ids: taskIds }),
  })
}

export async function assignTask(taskId: string, profile: string, opts?: KanbanBoardOptions): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/assign`, boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify({ profile }),
  })
}

export async function addComment(taskId: string, data: KanbanCommentCreateRequest, opts?: KanbanBoardOptions): Promise<{ ok: boolean; output?: string }> {
  return request<{ ok: boolean; output?: string }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/comments`, boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function linkTasks(data: KanbanLinkRequest, opts?: KanbanBoardOptions): Promise<{ ok: boolean; output?: string }> {
  return request<{ ok: boolean; output?: string }>(appendQuery('/api/hermes/kanban/links', boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function unlinkTasks(data: KanbanLinkRequest, opts?: KanbanBoardOptions): Promise<{ ok: boolean; output?: string }> {
  const params = boardParams(opts?.board)
  params.set('parent_id', data.parent_id)
  params.set('child_id', data.child_id)
  return request<{ ok: boolean; output?: string }>(appendQuery('/api/hermes/kanban/links', params), {
    method: 'DELETE',
  })
}

export async function bulkUpdateTasks(data: KanbanBulkUpdateRequest, opts?: KanbanBoardOptions): Promise<{ results: KanbanBulkTaskResult[] }> {
  return request<{ results: KanbanBulkTaskResult[] }>(appendQuery('/api/hermes/kanban/tasks/bulk', boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getTaskLog(taskId: string, opts?: KanbanTaskLogOptions): Promise<KanbanTaskLog> {
  const params = boardParams(opts?.board)
  if (opts?.tail !== undefined) params.set('tail', String(opts.tail))
  return request<KanbanTaskLog>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/log`, params))
}

export async function reclaimTask(taskId: string, opts?: KanbanReclaimOptions): Promise<{ ok: boolean; output?: string }> {
  return request<{ ok: boolean; output?: string }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/reclaim`, boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify({ reason: opts?.reason }),
  })
}

export async function reassignTask(taskId: string, profile: string, opts?: KanbanReassignOptions): Promise<{ ok: boolean; output?: string }> {
  return request<{ ok: boolean; output?: string }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/reassign`, boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify({ profile, reclaim: opts?.reclaim, reason: opts?.reason }),
  })
}

export async function specifyTask(taskId: string, opts?: KanbanSpecifyOptions): Promise<unknown[]> {
  const res = await request<{ results: unknown[] }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/specify`, boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify({ author: opts?.author }),
  })
  return res.results
}

export async function dispatch(opts?: KanbanDispatchOptions): Promise<unknown> {
  const params = boardParams(opts?.board)
  const res = await request<{ result: unknown }>(appendQuery('/api/hermes/kanban/dispatch', params), {
    method: 'POST',
    body: JSON.stringify({ dryRun: opts?.dryRun, max: opts?.max, failureLimit: opts?.failureLimit }),
  })
  return res.result
}

export async function getStats(opts?: KanbanBoardOptions): Promise<KanbanStats> {
  const res = await request<{ stats: KanbanStats }>(appendQuery('/api/hermes/kanban/stats', boardParams(opts?.board)))
  return res.stats
}

export async function getAssignees(opts?: KanbanBoardOptions): Promise<KanbanAssignee[]> {
  const res = await request<{ assignees: KanbanAssignee[] }>(appendQuery('/api/hermes/kanban/assignees', boardParams(opts?.board)))
  return res.assignees
}

export async function deleteTask(taskId: string, opts?: KanbanBoardOptions): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}`, boardParams(opts?.board)), {
    method: 'DELETE',
  })
}

export interface KanbanTaskPatch {
  status?: KanbanTaskStatus
  assignee?: string | null
  priority?: number
  title?: string
  body?: string
  result?: string
  block_reason?: string
  summary?: string
}

export async function patchTask(taskId: string, patch: KanbanTaskPatch, opts?: KanbanBoardOptions): Promise<KanbanTask> {
  const res = await request<{ task: KanbanTask }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}`, boardParams(opts?.board)), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return res.task
}

export async function decomposeTask(taskId: string, opts?: KanbanBoardOptions & { author?: string }): Promise<unknown> {
  const res = await request<{ result: unknown }>(appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/decompose`, boardParams(opts?.board)), {
    method: 'POST',
    body: JSON.stringify({ author: opts?.author }),
  })
  return res.result
}

// ─── Attachments ───────────────────────────────────────────────

export async function uploadAttachment(
  taskId: string,
  file: File,
  opts?: KanbanBoardOptions & { uploadedBy?: string },
): Promise<KanbanAttachment> {
  const params = boardParams(opts?.board)
  if (opts?.uploadedBy) params.set('uploaded_by', opts.uploadedBy)
  const formData = new FormData()
  formData.append('file', file)
  const res = await request<{ attachment: KanbanAttachment }>(
    appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/attachments`, params),
    {
      method: 'POST',
      body: formData,
    },
  )
  return res.attachment
}

export async function downloadAttachment(attachmentId: number, opts?: KanbanBoardOptions): Promise<Blob> {
  const base = getBaseUrlValue()
  const params = boardParams(opts?.board)
  const url = `${base}${appendQuery(`/api/hermes/kanban/attachments/${attachmentId}`, params)}`
  const headers: Record<string, string> = {}
  const apiKey = getApiKey()
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return res.blob()
}

export async function deleteAttachment(attachmentId: number, opts?: KanbanBoardOptions): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    appendQuery(`/api/hermes/kanban/attachments/${attachmentId}`, boardParams(opts?.board)),
    {
      method: 'DELETE',
    },
  )
}

// ─── Diagnostics ───────────────────────────────────────────────

export async function getDiagnostics(opts?: KanbanDiagnosticsOptions): Promise<KanbanDiagnostic[]> {
  const params = boardParams(opts?.board)
  if (opts?.task) params.set('task', opts.task)
  if (opts?.severity) params.set('severity', opts.severity)
  const res = await request<{ diagnostics: KanbanDiagnostic[]; count: number }>(
    appendQuery('/api/hermes/kanban/diagnostics', params),
  )
  return res.diagnostics
}

// ─── Orchestration ─────────────────────────────────────────────

export async function getOrchestration(opts?: KanbanBoardOptions): Promise<KanbanOrchestration> {
  return request<KanbanOrchestration>(appendQuery('/api/hermes/kanban/orchestration', boardParams(opts?.board)))
}

export async function saveOrchestration(
  patch: KanbanOrchestrationPatch,
  opts?: KanbanBoardOptions,
): Promise<KanbanOrchestration> {
  return request<KanbanOrchestration>(appendQuery('/api/hermes/kanban/orchestration', boardParams(opts?.board)), {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
}

export async function saveProfileDescription(
  name: string,
  patch: KanbanProfileDescriptionPatch,
  opts?: KanbanBoardOptions,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    appendQuery(`/api/hermes/kanban/profiles/${encodeURIComponent(name)}`, boardParams(opts?.board)),
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )
}

export async function autoGenerateProfileDescription(
  name: string,
  opts?: KanbanBoardOptions & { overwrite?: boolean },
): Promise<{ ok: boolean; description?: string }> {
  const params = boardParams(opts?.board)
  if (opts?.overwrite) params.set('overwrite', 'true')
  return request<{ ok: boolean; description?: string }>(
    appendQuery(`/api/hermes/kanban/profiles/${encodeURIComponent(name)}/describe-auto`, params),
    {
      method: 'POST',
    },
  )
}

// ─── Home channel notification subscriptions ──────────────────────

export interface HomeChannel {
  platform: string
  chat_id: string
  thread_id: string
  name: string
  subscribed: boolean
}

export async function getHomeChannels(taskId: string | null, opts?: KanbanBoardOptions): Promise<HomeChannel[]> {
  const params = boardParams(opts?.board)
  if (taskId) params.set('task', taskId)
  const res = await request<{ home_channels: HomeChannel[] }>(
    appendQuery('/api/hermes/kanban/home-channels', params),
  )
  return res.home_channels
}

export async function subscribeHomeChannel(
  taskId: string,
  platform: string,
  opts?: KanbanBoardOptions,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/home-subscribe/${encodeURIComponent(platform)}`, boardParams(opts?.board)),
    { method: 'POST' },
  )
}

export async function unsubscribeHomeChannel(
  taskId: string,
  platform: string,
  opts?: KanbanBoardOptions,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    appendQuery(`/api/hermes/kanban/${encodeURIComponent(taskId)}/home-subscribe/${encodeURIComponent(platform)}`, boardParams(opts?.board)),
    { method: 'DELETE' },
  )
}
