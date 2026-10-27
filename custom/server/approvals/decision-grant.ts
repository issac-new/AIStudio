// 任务关键决策授权契约：grant 不是正文标记，而是绑定认证人、任务版本与期限的持久化记录。
// 修订序列化与 runtime/tools/kanban_tools.py 共用 fixtures/decision-grant-revision.json 守门。
import { createHash } from 'node:crypto'

export type DecisionTier = 'T1' | 'T2' | 'T3'

export interface DecisionTask {
  id: string
  board: string
  title: string
  body?: string | null
  assignee?: string | null
  status?: string | null
  updated_at?: string | number | null
  workspace_kind?: string | null
  workspace_path?: string | null
  branch_name?: string | null
}

export interface DecisionGrant {
  taskId: string
  board: string
  tier: DecisionTier
  decision: 'approved' | 'rejected'
  actor: string
  taskRevision: string
  issuedAt: number
  decidedAt: number
  choice?: string
  expiresAt?: number
}

export type DecisionGrantReason =
  | 'ok'
  | 'missing_grant'
  | 'not_approved'
  | 'task_mismatch'
  | 'board_mismatch'
  | 'tier_mismatch'
  | 'invalid_actor'
  | 'invalid_time'
  | 'expired'
  | 'choice_required'
  | 'revision_unavailable'
  | 'revision_mismatch'
  | 'store_unreadable'

export interface DecisionGrantCheck {
  ok: boolean
  reason: DecisionGrantReason
}

export function normalizeDecisionBoard(board: string): string {
  return board.trim().toLowerCase() || 'default'
}

/** 与决策分层注册表一致：只认 body 首行 routed 标记或紧随其后一行的 tier=T1/T2/T3。 */
export function decisionTierForTask(task: Pick<DecisionTask, 'body'>): DecisionTier {
  const marker = (task.body ?? '').split('\n').slice(0, 2).join('\n')
  const hit = /(?:^|[\s:])tier=(T1|T2|T3)(?=\s|$)/im.exec(marker)
  return (hit?.[1]?.toUpperCase() ?? 'T1') as DecisionTier
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`任务修订字段 ${field} 必须为非空字符串`)
  return value
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error(`任务修订字段 ${field} 必须为字符串或 null`)
  return value
}

function nullableUpdatedAt(value: unknown): string | number | null {
  if (value === null || value === undefined || typeof value === 'string') return value ?? null
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) return value === 0 ? 0 : value
  throw new Error('任务修订字段 updated_at 必须为整数、字符串或 null')
}

function revisionPayload(task: DecisionTask): Record<string, string | number | null> {
  return {
    id: requiredText(task.id, 'id'),
    board: normalizeDecisionBoard(requiredText(task.board, 'board')),
    title: requiredText(task.title, 'title'),
    body: nullableText(task.body, 'body'),
    assignee: nullableText(task.assignee, 'assignee'),
    status: nullableText(task.status, 'status'),
    updated_at: nullableUpdatedAt(task.updated_at),
    workspace_kind: nullableText(task.workspace_kind, 'workspace_kind'),
    workspace_path: nullableText(task.workspace_path, 'workspace_path'),
    branch_name: nullableText(task.branch_name, 'branch_name'),
  }
}

/** 固定键序、UTF-8、无多余空白；Python json.dumps(..., separators=(',', ':')) 同形。 */
export function serializeTaskRevision(task: DecisionTask): string {
  return JSON.stringify(revisionPayload(task))
}

export function computeTaskRevision(task: DecisionTask): string {
  return createHash('sha256').update(serializeTaskRevision(task), 'utf8').digest('hex')
}

function invalid(reason: DecisionGrantReason): DecisionGrantCheck {
  return { ok: false, reason }
}

export function checkDecisionGrant(
  grant: DecisionGrant | null | undefined,
  task: DecisionTask,
  tier: DecisionTier,
  nowMs = Date.now(),
): DecisionGrantCheck {
  if (tier === 'T1') return { ok: true, reason: 'ok' }
  if (!grant) return invalid('missing_grant')
  if (grant.taskId !== task.id) return invalid('task_mismatch')
  if (grant.board !== normalizeDecisionBoard(task.board)) return invalid('board_mismatch')
  if (grant.tier !== tier) return invalid('tier_mismatch')
  if (grant.decision !== 'approved') return invalid('not_approved')
  if (typeof grant.actor !== 'string' || !grant.actor.trim()) return invalid('invalid_actor')
  if (!Number.isFinite(grant.issuedAt) || !Number.isFinite(grant.decidedAt)
    || grant.issuedAt < 0 || grant.decidedAt < 0 || !Number.isFinite(nowMs)) return invalid('invalid_time')
  if (grant.expiresAt !== undefined) {
    if (!Number.isFinite(grant.expiresAt)) return invalid('invalid_time')
    if (nowMs >= grant.expiresAt) return invalid('expired')
  }
  if (tier === 'T2' && (typeof grant.choice !== 'string' || !grant.choice.trim())) return invalid('choice_required')
  let actualRevision: string
  try {
    actualRevision = computeTaskRevision(task)
  } catch {
    return invalid('revision_unavailable')
  }
  if (grant.taskRevision !== actualRevision) return invalid('revision_mismatch')
  return { ok: true, reason: 'ok' }
}

export function grantAllows(
  grant: DecisionGrant | null | undefined,
  task: DecisionTask,
  tier: DecisionTier,
  nowMs = Date.now(),
): boolean {
  return checkDecisionGrant(grant, task, tier, nowMs).ok
}
