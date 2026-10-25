import type { ChildProcess, ExecFileOptions } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { logger } from '../../../studio/public/logging'
import { detectHermesRootHome } from '../runtime/path'
import { execHermes, spawnHermes } from '../runtime/process'
import { safeFileStore } from '../../../studio/public/safe-file-store'
import { getActiveProfileName, getProfileDir } from '../profiles/profile'
import { RACIDispatchService } from '../../../../custom/services/kanban/raci-dispatch'
import { evaluateRules } from '../../../../custom/loop/engine/architecture-engine'

const execOpts = { windowsHide: true }
const BOARD_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const NO_WORKER_LOG_PATTERNS = [
  /^\(no log for [^)]+?\s+—\s+task may not have spawned yet\)$/i,
  /^no worker log(?: for [^\n]+)?$/i,
]

export function normalizeBoardSlug(board?: string | null): string {
  if (board === undefined || board === null) return 'default'
  const trimmed = board.trim().toLowerCase()
  if (!trimmed) throw new Error('Invalid kanban board slug')
  if (!BOARD_SLUG_RE.test(trimmed)) {
    throw new Error('Invalid kanban board slug')
  }
  return trimmed
}

function boardArgs(board?: string | null): string[] {
  return ['kanban', '--board', normalizeBoardSlug(board)]
}

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
  // HERMES_CUSTOM[v020] BEGIN: per-task model provider + reasoning depth
  provider_override?: string | null
  reasoning_effort?: string | null
  // HERMES_CUSTOM[v020] END
  max_retries?: number | null
  goal_max_turns?: number | null
  session_id?: string | null
  block_kind?: string | null
  block_recurrences?: number
  claim_lock?: string | null
  claim_expires?: number | null
  goal_mode?: boolean
}

export interface KanbanRun {
  id: number
  task_id: string
  profile: string | null
  status: string
  started_at: number
  ended_at: number | null
  outcome: string | null
  summary: string | null
  error: string | null
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

export interface KanbanTaskDetail {
  task: KanbanTask
  comments: KanbanComment[]
  events: KanbanEvent[]
  runs: KanbanRun[]
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

export interface KanbanAttachment {
  id: number
  filename: string
  content_type: string | null
  size: number
  uploaded_by: string | null
  stored_path: string
  created_at: number
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
  // HERMES_CUSTOM[v020] BEGIN: board project scope
  project_id?: string | null
  default_workdir?: string | null
  // HERMES_CUSTOM[v020] END
  counts: Record<string, number>
  total: number
}

export interface KanbanBoardCreateOptions {
  slug: string
  name?: string
  description?: string
  icon?: string
  color?: string
  switchCurrent?: boolean
  // HERMES_CUSTOM[v020] BEGIN: board project scope
  project?: string
  defaultWorkdir?: string
  // HERMES_CUSTOM[v020] END
}

export interface KanbanCapabilities {
  source: 'hermes-cli'
  supports: Record<string, boolean>
  missing: string[]
  capabilities: KanbanCapabilityStatus[]
}

export interface KanbanTaskLog {
  task_id: string
  path: string | null
  exists: boolean
  size_bytes: number
  content: string
  truncated: boolean
}

export interface KanbanCapabilityStatus {
  key: string
  status: 'supported' | 'partial' | 'missing'
  reason?: string
  canonicalRoute?: string
  canonicalCommand?: string
  requiresBoard: boolean
}

export interface KanbanBoardOptions {
  board?: string
}

export interface KanbanWatchOptions extends KanbanBoardOptions {
  interval?: number
}

export interface KanbanBulkTaskUpdateOptions extends KanbanBoardOptions {
  ids: string[]
  status?: KanbanTaskStatus
  assignee?: string | null
  priority?: number
  archive?: boolean
  summary?: string
  reason?: string
  operatorOverride?: boolean
}

export interface KanbanBulkTaskResult {
  id: string
  ok: boolean
  error?: string
}

export interface KanbanBulkTaskUpdateResult {
  results: KanbanBulkTaskResult[]
}

// ─── CLI wrappers ───────────────────────────────────────────────

export async function listBoards(opts?: { includeArchived?: boolean }): Promise<KanbanBoard[]> {
  const args = ['kanban', 'boards', 'list', '--json']
  if (opts?.includeArchived) args.push('--all')

  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return JSON.parse(stdout)
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban boards list failed')
    throw new Error(`Failed to list kanban boards: ${err.message}`)
  }
}

async function findBoard(slug: string, includeArchived = true): Promise<KanbanBoard | null> {
  const boards = await listBoards({ includeArchived })
  return boards.find(board => board.slug === slug) || null
}

export async function createBoard(opts: KanbanBoardCreateOptions): Promise<KanbanBoard> {
  const slug = normalizeBoardSlug(opts.slug)
  const args = ['kanban', 'boards', 'create', slug]
  if (opts.name?.trim()) args.push('--name', opts.name.trim())
  if (opts.description?.trim()) args.push('--description', opts.description.trim())
  if (opts.icon?.trim()) args.push('--icon', opts.icon.trim())
  if (opts.color?.trim()) args.push('--color', opts.color.trim())
  if (opts.switchCurrent) args.push('--switch')
  // HERMES_CUSTOM[v020] BEGIN: board project scope
  if (opts.project?.trim()) args.push('--project', opts.project.trim())
  if (opts.defaultWorkdir?.trim()) args.push('--default-workdir', opts.defaultWorkdir.trim())
  // HERMES_CUSTOM[v020] END

  try {
    await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    const board = await findBoard(slug)
    if (!board) throw new Error('created board was not returned by boards list')
    return board
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban boards create failed')
    throw new Error(`Failed to create kanban board: ${err.message}`)
  }
}

export async function archiveBoard(slugInput: string): Promise<void> {
  const slug = normalizeBoardSlug(slugInput)
  if (slug === 'default') throw new Error('Cannot archive the default kanban board')

  try {
    await execHermes(['kanban', 'boards', 'rm', slug], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban boards archive failed')
    throw new Error(`Failed to archive kanban board: ${err.message}`)
  }
}

export async function getCapabilities(): Promise<KanbanCapabilities> {
  const capabilities: KanbanCapabilityStatus[] = [
    { key: 'explicitBoard', status: 'supported', canonicalCommand: '--board', requiresBoard: true },
    { key: 'boardsList', status: 'supported', canonicalRoute: '/boards', canonicalCommand: 'boards list', requiresBoard: false },
    { key: 'boardCreate', status: 'supported', canonicalRoute: '/boards', canonicalCommand: 'boards create', requiresBoard: false },
    { key: 'boardArchive', status: 'supported', canonicalRoute: '/boards/{slug}', canonicalCommand: 'boards rm', requiresBoard: false },
    { key: 'cliCurrentSwitch', status: 'partial', reason: 'Backend keeps explicit board context and does not expose a WUI route for mutating canonical CLI current board', canonicalRoute: '/boards/{slug}/switch', canonicalCommand: 'boards switch', requiresBoard: false },
    { key: 'taskCrudLite', status: 'supported', canonicalRoute: '/tasks', canonicalCommand: 'list/show/create/complete/block/unblock/assign', requiresBoard: true },
    { key: 'commentsWrite', status: 'supported', canonicalRoute: '/tasks/{task_id}/comments', canonicalCommand: 'comment', requiresBoard: true },
    { key: 'commentsRead', status: 'supported', reason: 'Comments are returned on task detail responses', canonicalRoute: '/tasks/{task_id}', canonicalCommand: 'show --json', requiresBoard: true },
    { key: 'taskLog', status: 'supported', canonicalRoute: '/tasks/{task_id}/log', canonicalCommand: 'log', requiresBoard: true },
    { key: 'attachments', status: 'supported', canonicalRoute: '/tasks/{task_id}/attachments', canonicalCommand: 'attachments --json', requiresBoard: true },
    { key: 'diagnostics', status: 'supported', canonicalRoute: '/diagnostics', canonicalCommand: 'diagnostics', requiresBoard: true },
    { key: 'reclaim', status: 'supported', canonicalRoute: '/tasks/{task_id}/reclaim', canonicalCommand: 'reclaim', requiresBoard: true },
    { key: 'reassign', status: 'supported', canonicalRoute: '/tasks/{task_id}/reassign', canonicalCommand: 'reassign', requiresBoard: true },
    { key: 'specify', status: 'supported', canonicalRoute: '/tasks/{task_id}/specify', canonicalCommand: 'specify', requiresBoard: true },
    { key: 'dispatch', status: 'supported', canonicalRoute: '/dispatch', canonicalCommand: 'dispatch', requiresBoard: true },
    { key: 'links', status: 'supported', canonicalRoute: '/links', canonicalCommand: 'link/unlink', requiresBoard: true },
    { key: 'bulk', status: 'partial', reason: 'WUI applies supported bulk-equivalent CLI transitions per id and returns per-task outcomes; direct priority/status patch parity remains deferred', canonicalRoute: '/tasks/bulk', canonicalCommand: 'bulk-equivalent via complete/block/unblock/archive/assign', requiresBoard: true },
    { key: 'events', status: 'partial', reason: 'WUI exposes a board-scoped WebSocket bridge backed by the canonical `kanban watch` stream; payload is currently a refresh invalidation signal, not a typed event model', canonicalRoute: '/events', canonicalCommand: 'watch', requiresBoard: true },
    { key: 'homeSubscriptions', status: 'supported', canonicalRoute: '/home-channels and subscription routes', canonicalCommand: 'notify-subscribe/notify-list/notify-unsubscribe', requiresBoard: true },
  ]
  const supports = Object.fromEntries(capabilities.map(capability => [capability.key, capability.status === 'supported'])) as Record<string, boolean>
  const missing = capabilities
    .filter(capability => capability.status !== 'supported')
    .map(capability => capability.key)
  return { source: 'hermes-cli', supports, missing, capabilities }
}

function parseJsonPayload(stdout: string): unknown[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []
  const parsed = JSON.parse(trimmed)
  if (Array.isArray(parsed)) return parsed
  return [parsed]
}

function isNoWorkerLogError(err: any): boolean {
  const lines = [err?.stderr, err?.stdout, err?.message]
    .filter(Boolean)
    .flatMap(value => String(value).split(/\r?\n/).map(line => line.trim()).filter(Boolean))
  return lines.some(line => NO_WORKER_LOG_PATTERNS.some(pattern => pattern.test(line)))
}

function pushOptional(args: string[], flag: string, value?: string | number | null): void {
  if (value !== undefined && value !== null && String(value).trim() !== '') args.push(flag, String(value))
}

function textFromExecValue(value: unknown): string {
  if (Buffer.isBuffer(value)) return value.toString('utf8')
  return value === undefined || value === null ? '' : String(value)
}

async function execKanbanMutation(
  args: string[],
  logMessage: string,
  errorPrefix: string,
  options: ExecFileOptions = {},
): Promise<string> {
  try {
    const { stdout, stderr } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
      ...options,
    })
    const stderrText = textFromExecValue(stderr).trim()
    if (stderrText) throw new Error(stderrText)
    return textFromExecValue(stdout)
  } catch (err: any) {
    logger.error(err, logMessage)
    throw new Error(`${errorPrefix}: ${err.message}`)
  }
}

export function buildWatchArgs(opts?: KanbanWatchOptions): string[] {
  const args = [...boardArgs(opts?.board), 'watch']
  pushOptional(args, '--interval', opts?.interval ?? 0.5)
  return args
}

export function watchEvents(opts?: KanbanWatchOptions): ChildProcess {
  return spawnHermes(buildWatchArgs(opts), {
    stdio: ['ignore', 'pipe', 'pipe'],
    ...execOpts,
  })
}

export async function linkTasks(parentId: string, childId: string, opts?: KanbanBoardOptions): Promise<{ ok: boolean; output: string }> {
  const output = await execKanbanMutation(
    [...boardArgs(opts?.board), 'link', parentId, childId],
    'Hermes CLI: kanban link failed',
    'Failed to link kanban tasks',
  )
  return { ok: true, output }
}

export async function unlinkTasks(parentId: string, childId: string, opts?: KanbanBoardOptions): Promise<{ ok: boolean; output: string }> {
  const output = await execKanbanMutation(
    [...boardArgs(opts?.board), 'unlink', parentId, childId],
    'Hermes CLI: kanban unlink failed',
    'Failed to unlink kanban tasks',
  )
  return { ok: true, output }
}

export async function addComment(taskId: string, body: string, opts?: KanbanBoardOptions & { author?: string }): Promise<{ ok: boolean; output: string }> {
  const args = [...boardArgs(opts?.board), 'comment', taskId, body]
  pushOptional(args, '--author', opts?.author)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return { ok: true, output: stdout }
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban comment failed')
    throw new Error(`Failed to comment on kanban task: ${err.message}`)
  }
}

export async function getTaskLog(taskId: string, opts?: KanbanBoardOptions & { tail?: number }): Promise<KanbanTaskLog> {
  const args = [...boardArgs(opts?.board), 'log', taskId]
  pushOptional(args, '--tail', opts?.tail)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    const sizeBytes = Buffer.byteLength(stdout, 'utf8')
    return {
      task_id: taskId,
      path: null,
      exists: true,
      size_bytes: sizeBytes,
      content: stdout,
      truncated: opts?.tail !== undefined && sizeBytes >= opts.tail,
    }
  } catch (err: any) {
    const detail = await getTask(taskId, opts)
    if (!detail) throw new Error('Kanban task not found')
    if ((err.code === 1 || err.status === 1) && isNoWorkerLogError(err)) {
      return {
        task_id: taskId,
        path: null,
        exists: false,
        size_bytes: 0,
        content: '',
        truncated: false,
      }
    }
    logger.error(err, 'Hermes CLI: kanban log failed')
    throw new Error(`Failed to read kanban task log: ${err.message}`)
  }
}

export async function getDiagnostics(opts?: KanbanBoardOptions & { task?: string; severity?: string }): Promise<unknown[]> {
  const args = [...boardArgs(opts?.board), 'diagnostics', '--json']
  pushOptional(args, '--task', opts?.task)
  pushOptional(args, '--severity', opts?.severity)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return JSON.parse(stdout)
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban diagnostics failed')
    throw new Error(`Failed to get kanban diagnostics: ${err.message}`)
  }
}

export async function reclaimTask(taskId: string, opts?: KanbanBoardOptions & { reason?: string }): Promise<{ ok: boolean; output: string }> {
  const args = [...boardArgs(opts?.board), 'reclaim', taskId]
  pushOptional(args, '--reason', opts?.reason)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return { ok: true, output: stdout }
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban reclaim failed')
    throw new Error(`Failed to reclaim kanban task: ${err.message}`)
  }
}

export async function reassignTask(taskId: string, profile: string, opts?: KanbanBoardOptions & { reclaim?: boolean; reason?: string }): Promise<{ ok: boolean; output: string }> {
  const args = [...boardArgs(opts?.board), 'reassign', taskId, profile]
  if (opts?.reclaim) args.push('--reclaim')
  pushOptional(args, '--reason', opts?.reason)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return { ok: true, output: stdout }
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban reassign failed')
    throw new Error(`Failed to reassign kanban task: ${err.message}`)
  }
}

export async function specifyTask(taskId: string, opts?: KanbanBoardOptions & { author?: string }): Promise<unknown[]> {
  const args = [...boardArgs(opts?.board), 'specify', taskId, '--json']
  pushOptional(args, '--author', opts?.author)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return parseJsonPayload(stdout)
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban specify failed')
    throw new Error(`Failed to specify kanban task: ${err.message}`)
  }
}

export async function dispatch(opts?: KanbanBoardOptions & { dryRun?: boolean; max?: number; failureLimit?: number }): Promise<unknown> {
  const args = [...boardArgs(opts?.board), 'dispatch', '--json']
  if (opts?.dryRun) args.push('--dry-run')
  pushOptional(args, '--max', opts?.max)
  pushOptional(args, '--failure-limit', opts?.failureLimit)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return JSON.parse(stdout)
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban dispatch failed')
    throw new Error(`Failed to dispatch kanban tasks: ${err.message}`)
  }
}

export async function listTasks(opts?: {
  board?: string
  status?: string
  assignee?: string
  tenant?: string
  includeArchived?: boolean
}): Promise<KanbanTask[]> {
  const args = [...boardArgs(opts?.board), 'list', '--json']
  if (opts?.includeArchived) args.push('--archived')
  if (opts?.status) args.push('--status', opts.status)
  if (opts?.assignee) args.push('--assignee', opts.assignee)
  if (opts?.tenant) args.push('--tenant', opts.tenant)

  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return JSON.parse(stdout)
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban list failed')
    throw new Error(`Failed to list kanban tasks: ${err.message}`)
  }
}

export async function getTask(taskId: string, opts?: KanbanBoardOptions): Promise<KanbanTaskDetail | null> {
  try {
    const { stdout } = await execHermes([...boardArgs(opts?.board), 'show', taskId, '--json'], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    const detail = JSON.parse(stdout) as KanbanTaskDetail
    const resolvedTaskId = detail.task?.id || taskId
    detail.comments = (detail.comments || []).map((comment, index) => ({
      ...comment,
      id: comment.id ?? `${resolvedTaskId}:comment:${index}`,
      task_id: comment.task_id || resolvedTaskId,
    }))
    detail.events = (detail.events || []).map((event, index) => ({
      ...event,
      id: event.id ?? `${resolvedTaskId}:event:${index}`,
      task_id: event.task_id || resolvedTaskId,
    }))
    return detail
  } catch (err: any) {
    if (err.code === 1 || err.status === 1) return null
    logger.error(err, 'Hermes CLI: kanban show failed')
    throw new Error(`Failed to get kanban task: ${err.message}`)
  }
}

export async function createTask(
  title: string,
  opts?: {
    board?: string
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
    // HERMES_CUSTOM[v020] BEGIN: model/provider/reasoning pins on create
    model?: string
    provider?: string
    reasoning?: string
    // HERMES_CUSTOM[v020] END
  },
): Promise<KanbanTask> {
  const args = [...boardArgs(opts?.board), 'create', title, '--json']
  if (opts?.body) args.push('--body', opts.body)
  if (opts?.assignee) args.push('--assignee', opts.assignee)
  if (opts?.priority !== undefined) args.push('--priority', String(opts.priority))
  if (opts?.tenant) args.push('--tenant', opts.tenant)
  if (opts?.project) args.push('--project', opts.project)
  if (opts?.workspace) args.push('--workspace', opts.workspace)
  if (opts?.branch) args.push('--branch', opts.branch)
  if (opts?.triage) args.push('--triage')
  if (opts?.maxRuntime) args.push('--max-runtime', opts.maxRuntime)
  if (opts?.maxRetries !== undefined) args.push('--max-retries', String(opts.maxRetries))
  if (opts?.goalMode) args.push('--goal')
  if (opts?.goalMaxTurns !== undefined) args.push('--goal-max-turns', String(opts.goalMaxTurns))
  // HERMES_CUSTOM[v020] BEGIN: model/provider/reasoning pins on create
  pushOptional(args, '--model', opts?.model)
  pushOptional(args, '--provider', opts?.provider)
  pushOptional(args, '--reasoning', opts?.reasoning)
  // HERMES_CUSTOM[v020] END
  for (const skill of opts?.skills || []) {
    if (skill.trim()) args.push('--skill', skill.trim())
  }

  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    const created = JSON.parse(stdout) as KanbanTask
    // HERMES_CUSTOM[aipaydev] BEGIN: RACI 派发（best-effort，不阻断任务创建）
    try {
      await RACIDispatchService.dispatch(created)
    } catch (e) {
      logger.warn(`RACI dispatch failed for task ${created.id}: ${(e as Error).message}`)
    }
    // HERMES_CUSTOM[aipaydev] END
    return created
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban create failed')
    throw new Error(`Failed to create kanban task: ${err.message}`)
  }
}

export async function completeTasks(
  taskIds: string[],
  summary?: string,
  opts?: KanbanBoardOptions & { operatorOverride?: boolean },
): Promise<void> {
  const args = [...boardArgs(opts?.board), 'complete', ...taskIds]
  if (summary) args.push('--summary', summary)

  if (!opts?.operatorOverride) {
    await execKanbanMutation(args, 'Hermes CLI: kanban complete failed', 'Failed to complete kanban tasks')
    return
  }

  // The canonical dashboard treats a human completion as an explicit
  // operator override. The CLI applies the goal judge to every goal-mode
  // completion, so run it with an isolated config that disables only the
  // auxiliary judge while keeping the real shared kanban home.
  const isolatedHome = await mkdtemp(join(tmpdir(), 'hermes-kanban-operator-'))
  try {
    await writeFile(
      join(isolatedHome, 'config.yaml'),
      'auxiliary:\n  goal_judge:\n    provider: __operator_override_disabled__\n',
      'utf8',
    )
    const kanbanHome = process.env.HERMES_KANBAN_HOME?.trim() || detectHermesRootHome()
    await execKanbanMutation(
      args,
      'Hermes CLI: kanban operator completion failed',
      'Failed to complete kanban tasks',
      {
        env: {
          ...process.env,
          HERMES_HOME: isolatedHome,
          HERMES_KANBAN_HOME: kanbanHome,
        },
      },
    )
  } finally {
    await rm(isolatedHome, { recursive: true, force: true }).catch(err => {
      logger.error(err, 'Hermes CLI: failed to clean up operator completion config')
    })
  }
}

export async function blockTask(taskId: string, reason: string, opts?: KanbanBoardOptions): Promise<void> {
  await execKanbanMutation(
    [...boardArgs(opts?.board), 'block', taskId, reason],
    'Hermes CLI: kanban block failed',
    'Failed to block kanban task',
  )
}

export async function reopenReview(
  taskIds: string[],
  reason?: string,
  opts?: KanbanBoardOptions,
): Promise<void> {
  const args = [...boardArgs(opts?.board), 'reopen-review', ...taskIds]
  if (reason) args.push('--reason', reason)
  await execKanbanMutation(args, 'Hermes CLI: kanban reopen-review failed', 'Failed to reopen review')
}

export async function unblockTasks(taskIds: string[], opts?: KanbanBoardOptions): Promise<void> {
  await execKanbanMutation(
    [...boardArgs(opts?.board), 'unblock', ...taskIds],
    'Hermes CLI: kanban unblock failed',
    'Failed to unblock kanban tasks',
  )
}

export async function assignTask(taskId: string, profile: string, opts?: KanbanBoardOptions): Promise<void> {
  // HERMES_CUSTOM[aipaydev] BEGIN: 架构规则引擎派发前校验（规则熔断：报错阻断，升级人工）
  {
    const current = (await getTask(taskId, opts))?.task
    if (current) {
      const verdict = await evaluateRules(current, {
        // 依赖状态查询注入（规则 001 需要；custom 树禁 import upstream，只能由调用方提供）
        getTaskStatus: async (depId: string) => (await getTask(depId, opts))?.task?.status ?? null,
      })
      if (verdict && verdict.type === 'BLOCKED_BY_POLICY') {
        throw new Error(`BLOCKED_BY_POLICY: ${verdict.message}（rule=${verdict.ruleId ?? 'n/a'}）——派发熔断，解除规则违例后重试`)
      }
    }
  }
  // HERMES_CUSTOM[aipaydev] END
  await execKanbanMutation(
    [...boardArgs(opts?.board), 'assign', taskId, profile],
    'Hermes CLI: kanban assign failed',
    'Failed to assign kanban task',
  )
}

export async function archiveTasks(taskIds: string[], opts?: KanbanBoardOptions): Promise<void> {
  await execKanbanMutation(
    [...boardArgs(opts?.board), 'archive', ...taskIds],
    'Hermes CLI: kanban archive failed',
    'Failed to archive kanban tasks',
  )
}

// HERMES_CUSTOM[v126]: CLI schedule 动词（todo/ready/running/blocked → scheduled；
// review/done/archived 由 CLI 拒绝并报错）。
export async function scheduleTask(taskId: string, opts?: KanbanBoardOptions): Promise<void> {
  await execKanbanMutation(
    [...boardArgs(opts?.board), 'schedule', taskId],
    'Hermes CLI: kanban schedule failed',
    'Failed to schedule kanban task',
  )
}

// HERMES_CUSTOM[v126]: CLI 状态机没有任意写 status 的动词——todo/triage 是父子
// 门禁的落点（_landing_status_after_parents），只能按当前态组合既有动词。此前
// 这两态在 bulk 链 default 分支 throw 被吞成 results ok:false，单任务 PATCH 链
// 完全静默（装机轮记录的 "PATCH status:'todo' 静默无操作"）。显式化：能迁的迁
// （落点 ready/todo 由父子门禁决定），组合不了的抛清晰错误而非假成功。
async function returnTaskToBacklog(taskId: string, opts?: KanbanBoardOptions): Promise<void> {
  const current = (await getTask(taskId, opts))?.task
  const status = current?.status
  if (status === undefined || status === 'todo' || status === 'triage') return
  if (status === 'review') return reopenReview([taskId], undefined, opts)
  if (status === 'blocked' || status === 'scheduled') return unblockTasks([taskId], opts)
  throw new Error(
    `kanban CLI state machine has no path from '${status}' to 'todo' — complete/archive it, or request-review first`,
  )
}

async function applyBulkStatus(taskId: string, opts: KanbanBulkTaskUpdateOptions): Promise<void> {
  switch (opts.status) {
    case undefined:
      return
    case 'done':
      return completeTasks([taskId], opts.summary, opts)
    case 'blocked':
      return blockTask(taskId, opts.reason?.trim() || 'Bulk update', opts)
    case 'ready':
      return unblockTasks([taskId], opts)
    case 'archived':
      return archiveTasks([taskId], opts)
    case 'review': {
      // HERMES_CUSTOM[v121]: 同 patchTask——bulk 链此前对 review 直接 throw，
      // 看板拖拽/右栏动作静默失效（results ok:false 无消费）。
      await execKanbanMutation(
        [...boardArgs(opts.board), 'request-review', taskId, '--force'],
        'Hermes CLI: kanban request-review failed',
        'Failed to move task to review',
      )
      return
    }
    case 'scheduled':
      // HERMES_CUSTOM[v126]: 直连 CLI schedule 动词
      return scheduleTask(taskId, opts)
    case 'todo':
    case 'triage':
      // HERMES_CUSTOM[v126]: 按当前态组合动词；不可达组合抛清晰错误
      return returnTaskToBacklog(taskId, opts)
    default:
      throw new Error(`Bulk status ${opts.status} is not supported by the CLI bridge`)
  }
}

export async function bulkUpdateTasks(opts: KanbanBulkTaskUpdateOptions): Promise<KanbanBulkTaskUpdateResult> {
  const ids = opts.ids.map(id => id.trim()).filter(Boolean)
  const results: KanbanBulkTaskResult[] = []
  for (const id of ids) {
    try {
      if (opts.archive) await archiveTasks([id], opts)
      else await applyBulkStatus(id, opts)
      if (opts.assignee !== undefined) await assignTask(id, opts.assignee?.trim() || 'none', opts)
      results.push({ id, ok: true })
    } catch (err: any) {
      results.push({ id, ok: false, error: err?.message || String(err) })
    }
  }
  return { results }
}

export async function getStats(opts?: KanbanBoardOptions): Promise<KanbanStats> {
  try {
    const { stdout } = await execHermes([...boardArgs(opts?.board), 'stats', '--json'], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    const raw = JSON.parse(stdout) as {
      by_status?: Record<string, unknown>
      by_assignee?: Record<string, unknown>
    }
    const byStatus: Record<string, number> = {}
    for (const [status, value] of Object.entries(raw.by_status || {})) {
      const count = Number(value)
      if (Number.isFinite(count) && count >= 0) byStatus[status] = count
    }
    const byAssignee: Record<string, number> = {}
    for (const [assignee, value] of Object.entries(raw.by_assignee || {})) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        byAssignee[assignee] = value
        continue
      }
      if (value && typeof value === 'object') {
        byAssignee[assignee] = Object.values(value as Record<string, unknown>)
          .reduce<number>((total, count) => total + (Number.isFinite(Number(count)) ? Number(count) : 0), 0)
      }
    }
    const archivedTasks = await listTasks({ board: opts?.board, status: 'archived', includeArchived: true })
    byStatus.archived = archivedTasks.length
    for (const task of archivedTasks) {
      const assignee = task.assignee?.trim() || 'default'
      byAssignee[assignee] = (byAssignee[assignee] || 0) + 1
    }
    return {
      by_status: byStatus,
      by_assignee: byAssignee,
      total: Object.values(byStatus).reduce((total, count) => total + count, 0),
    }
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban stats failed')
    throw new Error(`Failed to get kanban stats: ${err.message}`)
  }
}

export async function listAttachments(taskId: string, opts?: KanbanBoardOptions): Promise<KanbanAttachment[]> {
  try {
    const { stdout } = await execHermes([...boardArgs(opts?.board), 'attachments', taskId, '--json'], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    const attachments = JSON.parse(stdout)
    return Array.isArray(attachments) ? attachments : []
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban attachments failed')
    throw new Error(`Failed to list kanban attachments: ${err.message}`)
  }
}

export async function getAssignees(opts?: KanbanBoardOptions): Promise<KanbanAssignee[]> {
  try {
    const { stdout } = await execHermes([...boardArgs(opts?.board), 'assignees', '--json'], {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    return JSON.parse(stdout)
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban assignees failed')
    throw new Error(`Failed to get kanban assignees: ${err.message}`)
  }
}

// HERMES_CUSTOM[v126]: CLI 无 `rm` 动词——此前 argv 直发 ['rm', taskId] 必然
// "unknown action" 退出 → 路由 500，对所有状态一视同仁（review 仅是装机走查
// 首撞场景）。CLI 的硬删语义 = archive（任意态→archived）+ archive --rm（仅
// 已归档可 purge，两段式防误删）。已归档任务跳过第一步直接 purge。
export async function deleteTask(taskId: string, opts?: KanbanBoardOptions): Promise<boolean> {
  const exec = () => ({ maxBuffer: 50 * 1024 * 1024, timeout: 30000, ...execOpts })
  const purgeArgs = [...boardArgs(opts?.board), 'archive', '--rm', taskId]
  const archiveArgs = [...boardArgs(opts?.board), 'archive', taskId]
  try {
    const current = (await getTask(taskId, opts))?.task
    if (current?.status !== 'archived') {
      await execHermes(archiveArgs, exec())
    }
    await execHermes(purgeArgs, exec())
    return true
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban delete task failed')
    throw new Error(`Failed to delete kanban task: ${err.message}`)
  }
}

export async function decomposeTask(taskId: string, opts?: KanbanBoardOptions & { author?: string }): Promise<unknown> {
  const args = [...boardArgs(opts?.board), 'decompose', taskId, '--json']
  pushOptional(args, '--author', opts?.author)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 120000,
      ...execOpts,
    })
    return parseJsonPayload(stdout)
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban decompose failed')
    throw new Error(`Failed to decompose kanban task: ${err.message}`)
  }
}

export interface KanbanEstimateOptions extends KanbanBoardOptions {
  days?: number  // direct person-day override; omit to run the LLM estimate
  persist?: boolean
}

// HERMES_CUSTOM[estimate-rest]（团队并行三期）：人日估算的 REST 面——days 直设
// 旁路（--days）或 LLM 估算（--persist），供看板/派发预演消费 workload 数据。
export async function estimateTask(taskId: string, opts?: KanbanEstimateOptions): Promise<unknown> {
  const args = [...boardArgs(opts?.board), 'estimate', taskId, '--json']
  if (opts?.days != null) {
    args.push('--days', String(opts.days))
  } else if (opts?.persist) {
    args.push('--persist')
  } else {
    throw new Error('estimateTask requires either days (direct set) or persist (LLM estimate)')
  }
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 50 * 1024 * 1024,
      timeout: 120000,
      ...execOpts,
    })
    return parseJsonPayload(stdout)
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban estimate failed')
    throw new Error(`Failed to estimate kanban task: ${err.message}`)
  }
}

export interface KanbanTaskPatchOptions extends KanbanBoardOptions {
  status?: string
  assignee?: string | null
  priority?: number
  title?: string
  body?: string
  result?: string
  block_reason?: string
  summary?: string
  // HERMES_CUSTOM[v020] BEGIN: model/provider/reasoning pins
  model_override?: string | null
  provider_override?: string | null
  clear_model_override?: boolean
  reasoning_effort?: string | null
  clear_reasoning_effort?: boolean
  // HERMES_CUSTOM[v020] END
}

export async function patchTask(taskId: string, patch: KanbanTaskPatchOptions): Promise<KanbanTask | null> {
  const board = patch.board
  // Map PATCH fields to existing CLI verbs (same approach as agent plugin_api.py)
  if (patch.status) {
    const s = patch.status
    if (s === 'done') {
      await completeTasks([taskId], patch.summary, { board })
    } else if (s === 'blocked') {
      await blockTask(taskId, patch.block_reason || '', { board })
    } else if (s === 'ready') {
      const task = await getTask(taskId, { board })
      if (task?.task.status === 'blocked' || task?.task.status === 'scheduled') {
        await unblockTasks([taskId], { board })
      } else {
        // Direct status set for todo->ready etc. via unblock (CLI treats as reopen)
        await unblockTasks([taskId], { board })
      }
    } else if (s === 'archived') {
      await archiveTasks([taskId], { board })
    } else if (s === 'todo' || s === 'triage' || s === 'scheduled') {
      // Use bulk update for direct status writes
      // HERMES_CUSTOM[v126]: bulk 对单条失败不再可能静默——回检 results 并把
      // 失败原因抛给路由层（此前 ok:false 被吞，PATCH 返回 200+旧任务）。
      const bulk = await bulkUpdateTasks({ ids: [taskId], status: s as KanbanTaskStatus, board })
      const failed = bulk.results.find(r => !r.ok)
      if (failed) throw new Error(failed.error || `Failed to set task status to ${s}`)
    } else if (s === 'review') {
      // HERMES_CUSTOM[v121]: request-review 桥——CLI 无通用 set-status 动词，
      // review 态此前在此分支表缺失（静默无操作，前端乐观更新假成功后回滚）。
      // --force 允许从 running/blocked 等任意态直入 review。
      await execKanbanMutation(
        [...boardArgs(board), 'request-review', taskId, '--force'],
        'Hermes CLI: kanban request-review failed',
        'Failed to move task to review',
      )
    }
  }
  if (patch.assignee !== undefined) {
    await assignTask(taskId, patch.assignee || 'none', { board })
  }
  if (patch.priority !== undefined) {
    await bulkUpdateTasks({ ids: [taskId], priority: patch.priority, board })
  }
  // HERMES_CUSTOM[v020] BEGIN: model/provider/reasoning pins via CLI verbs
  if (patch.clear_model_override || patch.model_override !== undefined) {
    const model = patch.clear_model_override ? 'none' : (patch.model_override || 'none')
    const args = [...boardArgs(board), 'set-model', taskId, model]
    pushOptional(args, '--provider', patch.provider_override)
    await execKanbanMutation(args, 'Hermes CLI: kanban set-model failed', 'Failed to set model override')
  }
  if (patch.clear_reasoning_effort || patch.reasoning_effort !== undefined) {
    const effort = patch.clear_reasoning_effort ? 'clear' : (patch.reasoning_effort || 'clear')
    await execKanbanMutation(
      [...boardArgs(board), 'set-reasoning', taskId, effort],
      'Hermes CLI: kanban set-reasoning failed',
      'Failed to set reasoning effort',
    )
  }
  // HERMES_CUSTOM[v020] END
  // For title/body edits, we don't have a direct CLI verb — use create+replace pattern
  // is not available, so title/body edits fall back to re-fetching.
  return (await getTask(taskId, { board }))?.task || null
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
  // Step 1: Build the list of configured home channels from config.yaml + env vars
  const homes = await listConfiguredHomeChannels()

  if (homes.length === 0) return []

  // Step 2: If a taskId is given, fetch existing subscriptions and mark matches
  let subs: Array<{ platform: string; chat_id: string; thread_id: string }> = []
  if (taskId) {
    try {
      const args = [...boardArgs(opts?.board), 'notify-list', taskId, '--json']
      const { stdout } = await execHermes(args, { maxBuffer: 1024 * 1024, ...execOpts })
      const parsed = JSON.parse(stdout.trim())
      subs = Array.isArray(parsed) ? parsed : []
    } catch {
      subs = []
    }
  }

  return homes.map(h => ({
    platform: h.platform,
    chat_id: h.chat_id,
    thread_id: h.thread_id,
    name: h.name,
    subscribed: subs.some(s =>
      s.platform === h.platform && String(s.chat_id) === String(h.chat_id) && String(s.thread_id || '') === String(h.thread_id || ''),
    ),
  }))
}

export async function subscribeHomeChannel(
  taskId: string,
  platform: string,
  chatId: string,
  opts?: KanbanBoardOptions & { threadId?: string; userId?: string; notifierProfile?: string },
): Promise<{ ok: boolean }> {
  const args = [...boardArgs(opts?.board), 'notify-subscribe', taskId, '--platform', platform, '--chat-id', chatId]
  pushOptional(args, '--thread-id', opts?.threadId)
  pushOptional(args, '--user-id', opts?.userId)
  pushOptional(args, '--notifier-profile', opts?.notifierProfile)
  await execKanbanMutation(args, 'Hermes CLI: kanban notify-subscribe failed', 'Failed to subscribe home channel')
  return { ok: true }
}

export async function unsubscribeHomeChannel(
  taskId: string,
  platform: string,
  chatId: string,
  opts?: KanbanBoardOptions & { threadId?: string },
): Promise<{ ok: boolean }> {
  const args = [...boardArgs(opts?.board), 'notify-unsubscribe', taskId, '--platform', platform, '--chat-id', chatId]
  pushOptional(args, '--thread-id', opts?.threadId)
  await execKanbanMutation(args, 'Hermes CLI: kanban notify-unsubscribe failed', 'Failed to unsubscribe home channel')
  return { ok: true }
}

// ─── Internal: read configured home channels from profile config + env vars ──

interface ConfiguredHomeChannel {
  platform: string
  chat_id: string
  thread_id: string
  name: string
}

/**
 * Per-platform env var name overrides for the home-channel chat_id.
 *
 * Most platforms follow the `<PLATFORM>_HOME_CHANNEL` convention, but a few
 * use platform-specific names that must match the Python gateway config
 * (see `load_gateway_config` in gateway/config.py):
 *   - Matrix  → MATRIX_HOME_ROOM / MATRIX_HOME_ROOM_NAME / MATRIX_HOME_ROOM_THREAD_ID
 *   - Email   → EMAIL_HOME_ADDRESS / EMAIL_HOME_ADDRESS_NAME / EMAIL_HOME_ADDRESS_THREAD_ID
 */
const HOME_ENV_OVERRIDES: Record<string, { chatId: string; name: string; threadId: string }> = {
  matrix: { chatId: 'MATRIX_HOME_ROOM', name: 'MATRIX_HOME_ROOM_NAME', threadId: 'MATRIX_HOME_ROOM_THREAD_ID' },
  email: { chatId: 'EMAIL_HOME_ADDRESS', name: 'EMAIL_HOME_ADDRESS_NAME', threadId: 'EMAIL_HOME_ADDRESS_THREAD_ID' },
}

function homeEnvNames(platform: string): { chatId: string; name: string; threadId: string } {
  if (HOME_ENV_OVERRIDES[platform]) return HOME_ENV_OVERRIDES[platform]
  const upper = platform.toUpperCase().replace(/-/g, '_')
  return {
    chatId: `${upper}_HOME_CHANNEL`,
    name: `${upper}_HOME_CHANNEL_NAME`,
    threadId: `${upper}_HOME_CHANNEL_THREAD_ID`,
  }
}

/**
 * Read configured home channels from the active profile's config.yaml + .env.
 * Mirrors the Python `_configured_home_channels()` logic in plugin_api.py.
 */
async function listConfiguredHomeChannels(): Promise<ConfiguredHomeChannel[]> {
  const { readFile } = await import('fs/promises')
  const profile = getActiveProfileName() || 'default'
  const profileDir = getProfileDir(profile)
  const configPath = join(profileDir, 'config.yaml')
  const envPath = join(profileDir, '.env')

  let config: Record<string, any> = {}
  try {
    config = await safeFileStore.readYaml(configPath)
  } catch (err: any) {
    logger.warn(`Failed to read config.yaml at ${configPath}: ${err?.message}`)
    return []
  }

  // Read .env file for env-var overrides (Python gateway loads these via dotenv)
  let envVars: Record<string, string> = {}
  try {
    const envRaw = await readFile(envPath, 'utf-8')
    envVars = parseDotEnv(envRaw)
  } catch { /* no .env is fine */ }

  // Merge both `gateway.platforms` and top-level `platforms` (same as Python)
  const gatewayPlatforms = config.gateway?.platforms || {}
  const topLevelPlatforms = config.platforms || {}
  const platforms = { ...gatewayPlatforms, ...topLevelPlatforms }

  const result: ConfiguredHomeChannel[] = []

  for (const [platformName, platformCfg] of Object.entries(platforms)) {
    if (!platformCfg || typeof platformCfg !== 'object') continue

    const hc = (platformCfg as Record<string, any>).home_channel
    const envNames = homeEnvNames(platformName)

    // Env var overrides: process.env first, then .env file (same as Python)
    const envChatId = process.env[envNames.chatId] || envVars[envNames.chatId]
    const envName = process.env[envNames.name] || envVars[envNames.name]
    const envThreadId = process.env[envNames.threadId] || envVars[envNames.threadId]

    // Determine final home channel: env override > yaml config
    const chatId = envChatId || (hc?.chat_id as string) || ''
    if (!chatId) continue

    const threadId = envThreadId || (hc?.thread_id as string) || ''
    const name = envName || (hc?.name as string) || 'Home'

    result.push({
      platform: platformName,
      chat_id: chatId,
      thread_id: threadId || '',
      name,
    })
  }

  // Stable alphabetical order (matching Python)
  result.sort((a, b) => a.platform.localeCompare(b.platform))
  return result
}

/**
 * Parse a .env file into a key→value map. Handles quoted values, comments,
 * and blank lines. Does NOT expand variable references.
 */
function parseDotEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key && val) env[key] = val
  }
  return env
}

// ─── HERMES_CUSTOM[v020] BEGIN: estimate / projects / board project ────────

export interface KanbanEstimateResult {
  ok: boolean
  est_tokens?: number
  complexity?: 'S' | 'M' | 'L' | null
  rationale?: string | null
  model?: string | null
  reason?: string
}


/**
 * Estimate from raw title/body — used by the create dialog before a task
 * exists yet (`hermes kanban estimate --title ... --json`).
 */
export async function estimateText(title: string, body?: string, opts?: KanbanBoardOptions): Promise<KanbanEstimateResult> {
  const args = [...boardArgs(opts?.board), 'estimate', '--title', title, '--json']
  pushOptional(args, '--body', body)
  try {
    const { stdout } = await execHermes(args, {
      maxBuffer: 1024 * 1024,
      timeout: 90000,
      ...execOpts,
    })
    return JSON.parse(stdout.trim())
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban estimate failed')
    return { ok: false, reason: `estimate unavailable: ${err.message}` }
  }
}

export interface KanbanProject {
  id: string
  slug: string
  name: string
  description?: string | null
  icon?: string | null
  color?: string | null
  board_slug?: string | null
  primary_path?: string | null
  archived: boolean
}

/** List first-class Hermes projects for board scoping (`hermes project list --json`, patch 179). */
export async function listProjects(): Promise<KanbanProject[]> {
  try {
    const { stdout } = await execHermes(['project', 'list', '--json'], {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
    const parsed = JSON.parse(stdout.trim() || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: project list failed')
    throw new Error(`Failed to list hermes projects: ${err.message}`)
  }
}

/** Scope a board to a project (or clear with null) via `kanban boards set-project` (patch 178). */
export async function setBoardProject(slugInput: string, projectRef: string | null): Promise<void> {
  const slug = normalizeBoardSlug(slugInput)
  const args = ['kanban', 'boards', 'set-project', slug]
  args.push(projectRef?.trim() ? projectRef.trim() : 'none')
  try {
    await execHermes(args, {
      maxBuffer: 1024 * 1024,
      timeout: 30000,
      ...execOpts,
    })
  } catch (err: any) {
    logger.error(err, 'Hermes CLI: kanban boards set-project failed')
    throw new Error(`Failed to set board project: ${err.message}`)
  }
}

// ─── HERMES_CUSTOM[v020] END ──────────────────────────────────
