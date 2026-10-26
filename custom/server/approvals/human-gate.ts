// custom/server/approvals/human-gate.ts
// HumanGate 发布批准前置请求：store 是审批权威，审计/事件只是可告警投影。
// 任务 grant 在同一 store 上以 additive scope 扩展；既有 runId/cardId 发布接口不变。
import Router from '@koa/router'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { appendApprovalLog } from './approval-log'
import type { PendingItem } from './pending-controller'

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
}

const store = new Map<string, HumanGateRequest>()
let loadedStoreFile: string | null = null

export function humanGateStoreFile(): string {
  const override = process.env.HUMAN_GATE_STORE?.trim()
  if (override) return resolve(override)
  const home = process.env.HERMES_HOME?.trim() || resolve(homedir(), '.hermes')
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
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  try {
    writeFileSync(tmp, JSON.stringify(rows, null, 1), 'utf8')
    renameSync(tmp, file)
  } catch (error) {
    try { rmSync(tmp, { force: true }) } catch { /* 保留原始写盘异常 */ }
    throw error
  }
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
}): { req: HumanGateRequest; existed: boolean } {
  ensureLoaded()
  const id = mkId(input.runId, input.cardId)
  const existed = store.get(id)
  if (existed) return { req: existed, existed: true }
  const req: HumanGateRequest = {
    id, runId: input.runId, cardId: input.cardId, title: input.title,
    detail: input.detail, requestedBy: input.requestedBy,
    createdAt: Date.now(), status: 'pending',
  }
  // 先持久化再进入内存权威集，失败不会留下假 pending。
  persist([...store.values(), req])
  store.set(id, req)
  return { req, existed: false }
}

function projectionError(kind: string, error: unknown): string {
  return `${kind} projection failed: ${error instanceof Error ? error.message : String(error)}`
}

export function decide(
  id: string,
  decision: 'approve' | 'reject',
  actor: string,
  note?: string,
): HumanGateRequest | null {
  ensureLoaded()
  const req = store.get(id)
  if (!req || req.status !== 'pending') return null
  const next: HumanGateRequest = {
    ...req,
    status: decision === 'approve' ? 'approved' : 'rejected',
    decidedBy: actor,
    decidedAt: Date.now(),
    note,
  }
  // 决定先落权威 store；写失败时不改变状态，也不写“已批准”审计。
  persist([...store.values()].map(r => r.id === id ? next : r))
  store.set(id, next)

  const warnings: string[] = []
  try {
    appendApprovalLog({
      id: `hgate-${req.cardId}-${next.decidedAt}`,
      actor, targetKind: 'harness', targetId: req.cardId,
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
      title: `发布 HumanGate：${r.title}`,
      detail: r.detail ?? `run=${r.runId} card=${r.cardId}（前置批准请求——run22 复盘②）`,
      createdAt: r.createdAt, risk: 'high' as const,
    }))
}

// 子路由不带前缀，由 approvals 父路由挂载为 /api/approvals/human-gate/*。
export const humanGateRouter = new Router()

humanGateRouter.post('/', async ctx => {
  const actor = actorOrReply(ctx)
  if (!actor) return
  const b = (ctx.request.body ?? {}) as Record<string, unknown>
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

humanGateRouter.get('/', async ctx => {
  ctx.body = { ok: true, requests: listHumanGateRequests() }
})

humanGateRouter.post('/:id/decide', async ctx => {
  const actor = actorOrReply(ctx)
  if (!actor) return
  const body = (ctx.request.body ?? {}) as Record<string, unknown>
  const decision = String(body.decision ?? '')
  if (decision !== 'approve' && decision !== 'reject') {
    ctx.status = 400; ctx.body = { ok: false, detail: 'decision 须为 approve|reject' }; return
  }
  let req: HumanGateRequest | null
  try {
    req = decide(
      String(ctx.params.id ?? ''), decision, actor.username,
      typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
    )
  } catch (error) {
    ctx.status = 500
    ctx.body = { ok: false, detail: `HumanGate store 写入失败：${error instanceof Error ? error.message : String(error)}` }
    return
  }
  if (!req) { ctx.status = 404; ctx.body = { ok: false, detail: '批准单不存在或已裁决' }; return }
  ctx.body = { ok: true, request: req, ...(req.warnings ? { warnings: req.warnings } : {}) }
})
