// custom/server/approval-inbox/human-gate.ts
// HumanGate 发布批准前置请求：store 是审批权威，审计/事件只是可告警投影。
// 任务 grant 在同一 store 上以 additive scope 扩展；既有 runId/cardId 发布接口不变。
import Router from '@koa/router'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { appendApprovalLog } from './approval-log'
import {
  computeTaskRevision, decisionTierForTask, normalizeDecisionBoard,
  type DecisionGrant, type DecisionTask, type DecisionTier,
} from './decision-grant'
import type { PendingItem } from './pending-controller'
import { atomicWriteJson } from '../lib/fs-store'
import { hermesHome } from '../lib/paths'

export interface AuthenticatedActor {
  id: string
  username: string
  role: string
}

interface ActorContext {
  state?: unknown
  status?: number
  body?: unknown
}

/**
 * 需要人责证据的写入口只信上游认证的 ctx.state.user。
 * 显式无鉴权单机部署以 AISTUDIO_LOCAL_OPERATOR 提供本机操作者；不编造 anonymous/studio-ui。
 */
export function requireAuthenticatedActor(ctx: ActorContext): AuthenticatedActor {
  const user = (ctx.state as {
    user?: { id?: unknown; username?: unknown; role?: unknown } | undefined
  } | undefined)?.user
  const username = typeof user?.username === 'string'
    ? user.username.trim()
    : typeof user?.id === 'string' ? user.id.trim() : ''
  if (user && username) {
    return {
      id: typeof user.id === 'string' && user.id.trim() ? user.id.trim() : username,
      username,
      role: typeof user.role === 'string' && user.role.trim() ? user.role.trim() : 'user',
    }
  }
  const local = process.env.AISTUDIO_LOCAL_OPERATOR?.trim()
  if (local) return { id: local, username: local, role: 'local_operator' }
  const error = new Error('关键决策需要认证用户；显式单机部署须设置 AISTUDIO_LOCAL_OPERATOR') as Error & {
    status?: number
    code?: string
  }
  error.status = 401
  error.code = 'authenticated_actor_required'
  throw error
}

function actorOrReply(ctx: ActorContext): AuthenticatedActor | null {
  try {
    return requireAuthenticatedActor(ctx)
  } catch (error) {
    const e = error as Error & { status?: number; code?: string }
    ctx.status = e.status ?? 401
    ctx.body = { ok: false, code: e.code ?? 'authenticated_actor_required', detail: e.message }
    return null
  }
}

export interface HumanGateRequest {
  id: string                       // hgate:<runId>:<cardId>
  runId: string
  cardId: string
  title: string
  detail?: string
  requestedBy: string
  createdAt: number
  status: 'pending' | 'approved' | 'rejected'
  decidedBy?: string
  decidedAt?: number
  note?: string
  /** 仅本次裁决响应：审计/事件投影失败；不当作审批权威字段持久化。 */
  warnings?: string[]
  /** task 为新增授权范围；缺省保持既有发布审批语义。 */
  scope?: 'release' | 'task'
  taskId?: string
  board?: string
  tier?: DecisionTier
  taskRevision?: string
  expiresAt?: number
  grant?: DecisionGrant
}

const store = new Map<string, HumanGateRequest>()
let loadedStoreFile: string | null = null

export function humanGateStoreFile(): string {
  const override = process.env.HUMAN_GATE_STORE?.trim()
  if (override) return resolve(override)
  const home = process.env.HERMES_HOME?.trim() || hermesHome()
  return resolve(home, 'approvals', 'human-gate.json')
}

function isRequest(value: unknown): value is HumanGateRequest {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return typeof r.id === 'string' && typeof r.runId === 'string' && typeof r.cardId === 'string'
    && typeof r.title === 'string' && typeof r.requestedBy === 'string'
    && typeof r.createdAt === 'number'
    && (r.status === 'pending' || r.status === 'approved' || r.status === 'rejected')
}

function ensureLoaded(): void {
  const file = humanGateStoreFile()
  if (loadedStoreFile === file) return
  store.clear()
  let parsed: unknown = []
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      loadedStoreFile = file
      return
    }
    // 权威记录不可读/损坏必须 fail-closed，不能以空表覆盖。
    throw error
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { requests?: unknown }).requests)
      ? (parsed as { requests: unknown[] }).requests
      : null
  if (!rows || rows.some(r => !isRequest(r))) {
    throw new Error(`HumanGate store 格式无效：${file}`)
  }
  for (const row of rows) store.set(row.id, row)
  loadedStoreFile = file
}

function persist(rows: HumanGateRequest[]): void {
  const file = humanGateStoreFile()
  mkdirSync(dirname(file), { recursive: true })
  // 2026-10-28 收敛：原子写单一实现（lib/fs-store，失败时内部已清理 tmp）
  atomicWriteJson(file, rows, { indent: 1 })
}

/** 仅测试使用：丢弃进程内加载标记；各测试负责提供独立临时 store。 */
export function resetHumanGateForTests(): void {
  store.clear()
  loadedStoreFile = null
}

export function mkId(runId: string, cardId: string): string {
  return `hgate:${runId}:${cardId}`
}

export function createRequest(input: {
  runId: string; cardId: string; title: string; detail?: string; requestedBy: string
  id?: string; scope?: 'release' | 'task'; taskId?: string; board?: string; tier?: DecisionTier
  taskRevision?: string; expiresAt?: number
}): { req: HumanGateRequest; existed: boolean } {
  ensureLoaded()
  const id = input.id ?? mkId(input.runId, input.cardId)
  const existed = store.get(id)
  if (existed) return { req: existed, existed: true }
  const req: HumanGateRequest = {
    id, runId: input.runId, cardId: input.cardId, title: input.title,
    detail: input.detail, requestedBy: input.requestedBy,
    createdAt: Date.now(), status: 'pending',
    scope: input.scope, taskId: input.taskId, board: input.board, tier: input.tier,
    taskRevision: input.taskRevision, expiresAt: input.expiresAt,
  }
  // 先持久化再进入内存权威集，失败不会留下假 pending。
  persist([...store.values(), req])
  store.set(id, req)
  return { req, existed: false }
}

function createTaskRequest(input: {
  task: DecisionTask; requestedBy: string; detail?: string; expiresAt?: number
}): { req: HumanGateRequest; existed: boolean } {
  ensureLoaded()
  const task = { ...input.task, board: normalizeDecisionBoard(input.task.board) }
  const tier = decisionTierForTask(task)
  if (tier === 'T1') {
    const error = new Error('T1 无需任务 grant') as Error & { code?: string }
    error.code = 'grant_not_required'
    throw error
  }
  const taskRevision = computeTaskRevision(task)
  const baseId = `hgate:task:${task.board}:${task.id}:${taskRevision}`
  const previous = store.get(baseId)
  if (previous?.status === 'pending') return { req: previous, existed: true }
  if (previous?.status === 'approved' && previous.grant
    && (previous.grant.expiresAt === undefined || previous.grant.expiresAt > Date.now())) {
    return { req: previous, existed: true }
  }
  // 驳回或过期后可对同一修订重新人审；发布审批的 runId/cardId 幂等规则不受影响。
  const id = previous ? `${baseId}:${Date.now()}` : baseId
  return createRequest({
    id, runId: `task:${task.board}`, cardId: task.id, title: task.title,
    detail: input.detail, requestedBy: input.requestedBy,
    scope: 'task', taskId: task.id, board: task.board, tier, taskRevision,
    expiresAt: input.expiresAt,
  })
}

async function fetchTaskDetailForGrant(
  ctx: { get?: (key: string) => string },
  taskId: string,
  board: string,
): Promise<DecisionTask | null> {
  const token = typeof ctx.get === 'function' ? ctx.get('authorization') : ''
  const port = process.env.PORT || '8647'
  const query = board !== 'default' ? `?board=${encodeURIComponent(board)}` : ''
  const res = await fetch(
    `http://127.0.0.1:${port}/api/hermes/kanban/${encodeURIComponent(taskId)}${query}`,
    { headers: token ? { authorization: token } : {}, signal: AbortSignal.timeout(45_000) },
  )
  if (!res.ok) return null
  const detail = await res.json() as { task?: DecisionTask }
  return detail.task ?? null
}

function projectionError(kind: string, error: unknown): string {
  return `${kind} projection failed: ${error instanceof Error ? error.message : String(error)}`
}

export function decide(
  id: string,
  decision: 'approve' | 'reject',
  actor: string,
  note?: string,
  choice?: string,
): HumanGateRequest | null {
  ensureLoaded()
  const req = store.get(id)
  if (!req || req.status !== 'pending') return null
  if (req.scope === 'task' && req.tier === 'T2' && decision === 'approve'
    && (typeof choice !== 'string' || !choice.trim())) {
    const error = new Error('T2 批准必须由人选择非空 choice') as Error & { code?: string; status?: number }
    error.code = 'choice_required'
    error.status = 400
    throw error
  }
  const decidedAt = Date.now()
  let grant: DecisionGrant | undefined
  if (req.scope === 'task' && decision === 'approve') {
    if (!req.taskId || !req.board || !req.tier || !req.taskRevision) {
      throw new Error('任务批准单缺少 grant 绑定字段')
    }
    grant = {
      taskId: req.taskId, board: req.board, tier: req.tier, decision: 'approved', actor,
      taskRevision: req.taskRevision, issuedAt: decidedAt, decidedAt,
      ...(choice?.trim() ? { choice: choice.trim() } : {}),
      ...(req.expiresAt !== undefined ? { expiresAt: req.expiresAt } : {}),
    }
  }
  const next: HumanGateRequest = {
    ...req,
    status: decision === 'approve' ? 'approved' : 'rejected',
    decidedBy: actor,
    decidedAt,
    note,
    ...(grant ? { grant } : {}),
  }
  // 决定先落权威 store；写失败时不改变状态，也不写“已批准”审计。
  persist([...store.values()].map(r => r.id === id ? next : r))
  store.set(id, next)

  const warnings: string[] = []
  try {
    appendApprovalLog({
      id: `hgate-${req.cardId}-${next.decidedAt}`,
      actor, targetKind: req.scope === 'task' ? 'kanban' : 'harness', targetId: req.cardId,
      targetTitle: `HumanGate ${req.runId}/${req.cardId}`,
      decision: next.status, note: req.title,
    })
  } catch (error) {
    warnings.push(projectionError('approval audit', error))
  }
  const events = process.env.HUMAN_GATE_EVENTS?.trim()
  if (events) {
    try {
      mkdirSync(dirname(resolve(events)), { recursive: true })
      appendFileSync(events,
        `humangate:${req.cardId} HUMAN-GATE-${next.status.toUpperCase()} ${actor} ${Math.floor(next.decidedAt! / 1000)}\n`,
        'utf8')
    } catch (error) {
      warnings.push(projectionError('event', error))
    }
  }
  return warnings.length ? { ...next, warnings } : next
}

export function listHumanGateRequests(): HumanGateRequest[] {
  ensureLoaded()
  return [...store.values()]
}

/** 收件箱聚合出口（pending-controller.collectPendingItems 消费）。 */
export function listHumanGatePending(): PendingItem[] {
  ensureLoaded()
  return [...store.values()]
    .filter(r => r.status === 'pending')
    .map(r => ({
      id: r.id, kind: 'review' as const,
      title: `${r.scope === 'task' ? '任务' : '发布'} HumanGate：${r.title}`,
      detail: r.detail ?? (r.scope === 'task'
        ? `board=${r.board} task=${r.taskId} tier=${r.tier}（执行前授权）`
        : `run=${r.runId} card=${r.cardId}（前置批准请求——run22 复盘②）`),
      taskId: r.scope === 'task' ? r.taskId : undefined,
      createdAt: r.createdAt, risk: 'high' as const,
    }))
}

// 子路由不带前缀，由 approvals 父路由挂载为 /api/approvals/human-gate/*。
export const humanGateRouter = new Router()

humanGateRouter.post('/', async ctx => {
  const actor = actorOrReply(ctx)
  if (!actor) return
  const b = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const runId = String(b.runId ?? '').trim()
  const cardId = String(b.cardId ?? '').trim()
  const title = String(b.title ?? '').trim()
  if (!runId || !cardId || !title) {
    ctx.status = 400; ctx.body = { ok: false, detail: 'runId/cardId/title 必填' }; return
  }
  try {
    const { req, existed } = createRequest({
      runId, cardId, title,
      detail: typeof b.detail === 'string' ? b.detail.slice(0, 500) : undefined,
      requestedBy: actor.username,
    })
    ctx.status = existed ? 200 : 201
    ctx.body = { ok: true, request: req, existed }
  } catch (error) {
    ctx.status = 500
    ctx.body = { ok: false, detail: `HumanGate store 写入失败：${error instanceof Error ? error.message : String(error)}` }
  }
})

humanGateRouter.post('/task', async ctx => {
  const actor = actorOrReply(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const taskId = String(body.taskId ?? '').trim()
  const board = normalizeDecisionBoard(String(body.board ?? 'default'))
  if (!taskId) {
    ctx.status = 400; ctx.body = { ok: false, detail: 'taskId 必填' }; return
  }
  if (body.expiresAt !== undefined && (typeof body.expiresAt !== 'number'
    || !Number.isFinite(body.expiresAt) || body.expiresAt <= Date.now())) {
    ctx.status = 400; ctx.body = { ok: false, detail: 'expiresAt 须为未来 epoch ms' }; return
  }
  let task: DecisionTask | null
  try {
    task = await fetchTaskDetailForGrant(ctx, taskId, board)
  } catch (error) {
    ctx.status = 502
    ctx.body = { ok: false, detail: `任务详情读取失败：${error instanceof Error ? error.message : String(error)}` }
    return
  }
  if (!task) {
    ctx.status = 404; ctx.body = { ok: false, detail: 'task not found' }; return
  }
  if (task.id !== taskId) {
    ctx.status = 502; ctx.body = { ok: false, detail: '任务详情 id 与请求不一致' }; return
  }
  try {
    const { req, existed } = createTaskRequest({
      task: { ...task, board }, requestedBy: actor.username,
      detail: typeof body.detail === 'string' ? body.detail.slice(0, 500) : undefined,
      expiresAt: body.expiresAt as number | undefined,
    })
    ctx.status = existed ? 200 : 201
    ctx.body = { ok: true, request: req, existed }
  } catch (error) {
    const e = error as Error & { code?: string }
    ctx.status = e.code === 'grant_not_required' ? 400 : 500
    ctx.body = { ok: false, code: e.code, detail: e.message }
  }
})

humanGateRouter.get('/', async ctx => {
  ctx.body = { ok: true, requests: listHumanGateRequests() }
})

humanGateRouter.post('/:id/decide', async ctx => {
  const actor = actorOrReply(ctx)
  if (!actor) return
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const decision = String(body.decision ?? '')
  if (decision !== 'approve' && decision !== 'reject') {
    ctx.status = 400; ctx.body = { ok: false, detail: 'decision 须为 approve|reject' }; return
  }
  let req: HumanGateRequest | null
  try {
    req = decide(
      String(ctx.params.id ?? ''), decision, actor.username,
      typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
      typeof body.choice === 'string' ? body.choice : undefined,
    )
  } catch (error) {
    const e = error as Error & { status?: number; code?: string }
    ctx.status = e.status ?? 500
    ctx.body = {
      ok: false, code: e.code,
      detail: e.status === 400
        ? e.message
        : `HumanGate store 写入失败：${e.message}`,
    }
    return
  }
  if (!req) { ctx.status = 404; ctx.body = { ok: false, detail: '批准单不存在或已裁决' }; return }
  ctx.body = { ok: true, request: req, ...(req.warnings ? { warnings: req.warnings } : {}) }
})
