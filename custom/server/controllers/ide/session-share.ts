/**
 * IDE 共享会话控制器（/api/ide/session-share/*）——多人共驾 agent 会话。
 *
 * R6 共享会话（routa shared-session/types.ts:1-58 语义）：
 *   POST /api/ide/session-share/create  { sessionId, mode }
 *     → 发 invite token（host 创建；mode 四档：view/comment/approve/prompt）
 *   GET  /api/ide/session-share/:token
 *     → 按 token 读会话投影（role 判定：host/collaborator/viewer × mode）
 *   POST /api/ide/session-share/:token/prompt  { text }
 *     → collaborator 提 prompt（approve 模式待人审，prompt 模式直接入队）
 * 存储：MVP 进程内 Map（重启即失忆、上限 200 条；不落库——接入真实通道时
 * 迁移到 hermes-web-ui.db shared-state 表）。
 * 叠在 matrix 账号之上：host 用 matrix 账号发链接，collaborator 免登按 token 访问。
 */
import Router from '@koa/router'
import { randomBytes } from 'crypto'

export type ShareMode = 'view' | 'comment' | 'approve' | 'prompt'
export type ShareRole = 'host' | 'collaborator' | 'viewer'

export interface ShareRecord {
  token: string
  sessionId: string
  mode: ShareMode
  hostUserId: string
  createdAt: number
}

interface ShareStore {
  get(key: string): ShareRecord | null
  set(key: string, value: ShareRecord): void
}

// 进程内 kv（MVP 内存实现：重启即失忆、无 TTL——与头注旧版「生产读库」的说法
// 不同，实际从不读 hermes-web-ui.db；见下 stub 说明）。上限 200 条 FIFO 防无界增长。
const SHARE_STORE_CAP = 200
const shareStore: ShareStore = (() => {
  const mem = new Map<string, ShareRecord>()
  return {
    get: (k) => mem.get(k) ?? null,
    set: (k, v) => {
      if (mem.size >= SHARE_STORE_CAP) {
        const oldest = mem.keys().next().value
        if (oldest !== undefined) mem.delete(oldest)
      }
      mem.set(k, v)
    },
  }
})()

/** ⚠️ 诚实声明（2026-09-23 审计）：prompt 通道是 REST 形状骨架——approve 模式
 * 的「待人审」没有待审存储，prompt 模式的「直接入队」没有入队副作用（协作者
 * 输入会被静默丢弃）。所有响应带 stub: true，任何调用方不得把它当可用通道；
 * 接线到真实通道（会话消息队列 / Matrix mention-bus）前不接入 UI。 */

const MODE_ROLE: Record<ShareMode, ShareRole[]> = {
  view: ['viewer'],
  comment: ['viewer', 'collaborator'],
  approve: ['viewer', 'collaborator'],
  prompt: ['collaborator'],
}

function roleFor(record: ShareRecord, userId?: string | null): ShareRole {
  if (userId && userId === record.hostUserId) return 'host'
  const roles = MODE_ROLE[record.mode]
  return roles.includes('collaborator') ? 'collaborator' : 'viewer'
}

function canPrompt(record: ShareRecord, role: ShareRole): boolean {
  return role !== 'viewer' && (record.mode === 'approve' || record.mode === 'prompt')
}

const ideSessionShareRouter = new Router()

ideSessionShareRouter.post('/api/ide/session-share/create', async (ctx) => {
  const { sessionId, mode } = ctx.request.body as { sessionId?: string; mode?: ShareMode }
  if (!sessionId || !mode || !MODE_ROLE[mode]) {
    ctx.status = 400
    ctx.body = { error: 'sessionId and mode (view/comment/approve/prompt) are required' }
    return
  }
  const hostUserId = (ctx.state as { user?: { username?: string } }).user?.username ?? 'host'
  const token = randomBytes(18).toString('base64url')
  const record: ShareRecord = { token, sessionId, mode, hostUserId, createdAt: Date.now() }
  shareStore.set(token, record)
  ctx.body = { ok: true, stub: true, token, url: `/share/${token}`, mode, role: 'host' }
})

ideSessionShareRouter.get('/api/ide/session-share/:token', async (ctx) => {
  const record = shareStore.get(ctx.params.token)
  if (!record) {
    ctx.status = 404
    ctx.body = { error: 'share not found' }
    return
  }
  const userId = (ctx.state as { user?: { username?: string } }).user?.username ?? null
  const role = roleFor(record, userId)
  ctx.body = {
    sessionId: record.sessionId,
    mode: record.mode,
    role,
    canPrompt: canPrompt(record, role),
    createdAt: record.createdAt,
  }
})

ideSessionShareRouter.post('/api/ide/session-share/:token/prompt', async (ctx) => {
  const record = shareStore.get(ctx.params.token)
  if (!record) {
    ctx.status = 404
    ctx.body = { error: 'share not found' }
    return
  }
  const userId = (ctx.state as { user?: { username?: string } }).user?.username ?? null
  const role = roleFor(record, userId)
  if (!canPrompt(record, role)) {
    ctx.status = 403
    ctx.body = { error: 'viewer cannot prompt; mode requires collaborator' }
    return
  }
  const { text } = ctx.request.body as { text?: string }
  if (!text || typeof text !== 'string' || !text.trim()) {
    ctx.status = 400
    ctx.body = { error: 'text is required' }
    return
  }
  // approve 模式：prompt 待人审（multica 人审门语义）；prompt 模式：直接入队。
  // ⚠️ 两者目前均为形状语义（见 shareStore 上方诚实声明），无真实副作用。
  ctx.body = {
    ok: true,
    stub: true,
    queued: record.mode === 'prompt',
    pendingApproval: record.mode === 'approve',
    sessionId: record.sessionId,
  }
})

export default ideSessionShareRouter
