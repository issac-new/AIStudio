/**
 * 统一身份聊天 REST（/api/ia2/identity-chat）——2026-10-23 五轮用户裁定：
 * 「在一个聊天窗口中统一，可以和所有身份进行聊天会话」。身份=本机网关 50 个
 * profile（经网关 api_server peer dm 协议）+（批2）Matrix/远程网关账号。
 *
 * 协议正本 = hermes-agent `hermes peer dm`（hermes_cli/subcommands/peer.py：
 * ensure Bot Chat → POST /api/sessions/{id}/chat 同步等回；超时=turn 已入队
 * 不重发；bot_chat_unbound 属 profile 一次性绑定态）。2026-10-23 实测闭环：
 * 干净 profile mint→chat 同步回执（worker-coder「收到」）。
 *
 * - GET  /api/ia2/identities                    身份清单（网关 served_profiles+平台在线态）
 * - GET  /api/ia2/identity-chat/:profile/messages?sid=  会话历史（无 sid 时先 ensure）
 * - POST /api/ia2/identity-chat/:profile/chat   {message, sid?} → {reply|queued, sessionId}
 *
 * 鉴权/目标：与 upstream /agent-health 代理同源——API_SERVER_KEY（env 优先，
 * ~/.hermes/.env 回读），base 默认 http://127.0.0.1:8650（IDENTITY_GATEWAY_BASE
 * 覆盖），多 profile 走 /p/<profile>/ 前缀。挂载：patch 678（477 同款两行）。
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// 注：真进程 koa-router 新增路由不生效（routes.ts 404 缺陷注释同源，engine-models
// 先例）——出口用原生中间件精确匹配（identityChatNativeRoutes），router 定义退役。
type Ctx = { method?: string; path?: string; query?: Record<string, string>; params?: Record<string, string>; request?: { body?: unknown }; status?: number; body?: unknown; set(k: string, v: string): void }
type Next = () => Promise<void>

const BOT_CHAT_TITLE = 'Bot Chat'
/** 与 peer.py DM_TIMEOUT_S 同量级；超时≠失败——turn 已入队，客户端转轮询。 */
const CHAT_TIMEOUT_MS = 60_000

function gatewayBase(): string {
  return process.env.IDENTITY_GATEWAY_BASE?.trim() || 'http://127.0.0.1:8650'
}

function apiKey(): string {
  const fromEnv = process.env.API_SERVER_KEY?.trim()
  if (fromEnv) return fromEnv
  try {
    const m = readFileSync(join(homedir(), '.hermes', '.env'), 'utf8').match(/^API_SERVER_KEY=(.+)$/m)
    return m?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

function profileBase(profile: string): string {
  return `${gatewayBase()}/p/${encodeURIComponent(profile)}`
}

async function gatewayJson(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<unknown> {
  const key = apiKey()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 10_000)
  try {
    const res = await fetch(path.startsWith('http') ? path : `${gatewayBase()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: ctrl.signal,
    })
    const text = await res.text()
    let body: unknown = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    if (!res.ok) {
      const message = (body as { error?: { message?: string } })?.error?.message ?? text.slice(0, 200)
      const err = new Error(message) as Error & { status?: number; body?: unknown }
      err.status = res.status
      err.body = body
      throw err
    }
    return body
  } finally {
    clearTimeout(timer)
  }
}

/** peer.py _find_bot_chat 同款：title 精确找回（含 hidden）。 */
async function findBotChat(profile: string): Promise<string | null> {
  const listing = (await gatewayJson(
    `${profileBase(profile)}/api/sessions?limit=200&title=${encodeURIComponent(BOT_CHAT_TITLE)}&include_hidden=1`,
  )) as { data?: Array<{ id?: string; title?: string }> } | null
  for (const s of listing?.data ?? []) {
    if ((s.title ?? '').trim() === BOT_CHAT_TITLE && s.id) return s.id
  }
  return null
}

/** peer.py _ensure_bot_chat 同款：找回→mint（冲突再找一次兜竞态）。 */
async function ensureBotChat(profile: string): Promise<string> {
  const existing = await findBotChat(profile)
  if (existing) return existing
  try {
    const created = (await gatewayJson(`${profileBase(profile)}/api/sessions`, {
      method: 'POST',
      body: JSON.stringify({ title: BOT_CHAT_TITLE, source: 'bot_peer_dm' }),
    })) as { session?: { id?: string } } | { id?: string } | null
    const sid = (created as { session?: { id?: string } })?.session?.id ?? (created as { id?: string })?.id
    if (sid) return sid
  } catch (err) {
    // 标题冲突（UNIQUE guard）= 已存在但列表不可见，再找一次
    if ((err as { status?: number }).status === 400) {
      const again = await findBotChat(profile)
      if (again) return again
    }
    throw err
  }
  throw new Error('网关未返回新 Bot Chat 会话 id')
}

/** 身份清单：目录枚举 ~/.hermes/profiles/*（排除 _shared/_archive）为全集；
 * 在线态取 /health/detailed platforms 键的 <profile>:<platform> 前缀（无前缀
 * 键=default profile）。/health/detailed 不含 served_profiles（实测），目录
 * 才是网关 Cron tick 的同一份 profile 全集。 */
async function handleIdentities(ctx: Ctx): Promise<void> {
  ctx.set('Cache-Control', 'no-store')
  try {
    const profileDir = join(homedir(), '.hermes', 'profiles')
    let served: string[] = []
    try {
      served = readdirSync(profileDir)
        .filter((d) => !d.startsWith('_') && !d.startsWith('.'))
        .filter((d) => statSync(join(profileDir, d)).isDirectory())
        .sort()
    } catch { /* 目录缺失 → 空清单 */ }
    const online = new Map<string, boolean>()
    try {
      const detailed = (await gatewayJson('/health/detailed', { timeoutMs: 6_000 })) as {
        platforms?: Record<string, { state?: string }>
      } | null
      for (const [key, info] of Object.entries(detailed?.platforms ?? {})) {
        const sep = key.indexOf(':')
        const profile = sep > 0 ? key.slice(0, sep) : 'default'
        if (info?.state === 'connected') online.set(profile, true)
      }
    } catch { /* 网关不在 → 全部离线态 */ }
    ctx.body = {
      ok: true,
      identities: served.map((profile) => ({
        kind: 'gateway' as const,
        id: profile,
        label: profile,
        online: online.get(profile) === true,
      })),
      gatewayBase: gatewayBase(),
    }
  } catch (err) {
    ctx.status = 502
    ctx.body = { ok: false, identities: [], error: `网关不可达：${(err as Error).message.slice(0, 120)}` }
  }
}

async function handleMessages(ctx: Ctx, profile: string): Promise<void> {
  ctx.set('Cache-Control', 'no-store')
  try {
    const sid = String(ctx.query?.sid ?? '') || (await ensureBotChat(profile))
    const data = (await gatewayJson(`${profileBase(profile)}/api/sessions/${encodeURIComponent(sid)}/messages`)) as
      | { messages?: Array<Record<string, unknown>> }
      | null
    ctx.body = {
      ok: true,
      sessionId: sid,
      messages: (data?.messages ?? []).map((m) => ({
        role: typeof m.role === 'string' ? m.role : 'unknown',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
        at: typeof m.created_at === 'number' ? m.created_at : null,
      })),
    }
  } catch (err) {
    ctx.status = (err as { status?: number }).status ?? 502
    ctx.body = { ok: false, error: (err as Error).message.slice(0, 300), hint: botChatHint(err) }
  }
}

async function handleChat(ctx: Ctx, profile: string): Promise<void> {
  ctx.set('Cache-Control', 'no-store')
  const message = String((ctx.request?.body as { message?: unknown })?.message ?? '').trim()
  if (!message) { ctx.status = 400; ctx.body = { ok: false, error: 'message 必填' }; return }
  try {
    const sid = String((ctx.request?.body as { sid?: unknown })?.sid ?? '') || (await ensureBotChat(profile))
    try {
      const result = (await gatewayJson(`${profileBase(profile)}/api/sessions/${encodeURIComponent(sid)}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message }),
        timeoutMs: CHAT_TIMEOUT_MS,
      })) as { object?: string; message?: { content?: string }; status?: string } | null
      const queued = result?.object === 'hermes.session.chat.queued'
      ctx.body = {
        ok: true,
        sessionId: sid,
        queued,
        reply: queued ? '' : (result?.message?.content ?? ''),
      }
    } catch (err) {
      // 超时（AbortError）：消息已入队（peer.py 同语义——不重发），转客户端轮询
      if ((err as Error).name === 'AbortError') {
        ctx.body = { ok: true, sessionId: sid, queued: true, reply: '', note: 'turn 仍在运行：消息已进入该身份的 Bot Chat，稍后自动拉取回复' }
        return
      }
      throw err
    }
  } catch (err) {
    ctx.status = (err as { status?: number }).status ?? 502
    ctx.body = { ok: false, error: (err as Error).message.slice(0, 300), hint: botChatHint(err) }
  }
}

/** bot_chat_unbound 的可行动提示（网关原文已含操作指引，原样透传）。 */
function botChatHint(err: unknown): string | undefined {
  const body = (err as { body?: { error?: { code?: string; message?: string } } }).body
  if (body?.error?.code === 'bot_chat_unbound') return body.error.message
  return undefined
}

/** 原生 koa 中间件：精确匹配方法+路径（非匹配 next 放行；ideNativeRoutes 同款）。 */
export function identityChatNativeRoutes(): (ctx: Ctx, next: Next) => Promise<void> {
  return async (ctx: Ctx, next: Next): Promise<void> => {
    const path = String(ctx.path ?? '')
    const method = String(ctx.method ?? '').toUpperCase()
    if (method === 'GET' && path === '/api/ia2/identities') {
      await handleIdentities(ctx)
      return
    }
    const mChat = path.match(/^\/api\/ia2\/identity-chat\/([^/]+)\/chat$/)
    if (method === 'POST' && mChat) {
      await handleChat(ctx, decodeURIComponent(mChat[1]))
      return
    }
    const mMsg = path.match(/^\/api\/ia2\/identity-chat\/([^/]+)\/messages$/)
    if (method === 'GET' && mMsg) {
      await handleMessages(ctx, decodeURIComponent(mMsg[1]))
      return
    }
    await next()
  }
}

export default identityChatNativeRoutes
export { ensureBotChat }
