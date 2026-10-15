/**
 * humansim 通道（PR-0①）——人类角色模拟的受控发送面。
 *
 * 定位：推演程序模拟人类角色（审批/退回/需求提交）不再散落直调 synapse API
 * （curl+token 14 处），统一走本端点：以人类账号通道代发+全量审计留痕。
 * 方案条款=《2026-10-15-swarmstudio-resilience-and-humansim-design.md》PR-0。
 *
 * POST /api/hermes/humansim/send  { as, room, body, kind } → { eventId, auditId }
 *   as=人类账号 localpart（须在 creds 目录有 <as>.token）；room=!xxx:server；
 *   kind=approval|reject|request|notice（审计分类）；body 非空 ≤4000 字符。
 * GET  /api/hermes/humansim/audit?limit=50 → 最近审计行（新→旧）
 *
 * 配置（env）：HUMANSIM_HOMESERVER（缺省 http://127.0.0.1:8008）、
 *   HUMANSIM_CREDS_DIR（token 目录）、HUMANSIM_AUDIT（审计文件，缺省
 *   <credsDir>/humansim-audit.ndjson）。creds 目录未配置=端点显式 503（fail-closed，
 *   不静默空转）——推演环境专用能力，生产部署不开 env 即关。
 *
 * 挂载：B 类 patch（bootstrap/routes.ts，同 402 approval 模式）；run20 在跑期间
 * 禁 inject——挂载待部署窗口（spec §四 清偿门口径）。
 */
import type { Context } from 'koa'
import Router from '@koa/router'
import { readFileSync, existsSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

const router = new Router({ prefix: '/api/hermes/humansim' })

export interface HumansimSendRequest {
  as: string
  room: string
  body: string
  kind: string
}

export const HUMANSIM_KINDS = ['approval', 'reject', 'request', 'notice'] as const

/** 请求校验（纯函数，测试面）：账号 localpart/房间 ID/正文长度/类型枚举。 */
export function validateSend(req: unknown): { ok: true; value: HumansimSendRequest } | { ok: false; error: string } {
  const r = req as Partial<HumansimSendRequest> | null
  if (!r || typeof r !== 'object') return { ok: false, error: 'body 须为对象' }
  if (typeof r.as !== 'string' || !/^[a-z0-9_.=-]{1,64}$/i.test(r.as)) return { ok: false, error: 'as 须为账号 localpart' }
  if (typeof r.room !== 'string' || !/^![^:\s]+:\S+$/.test(r.room)) return { ok: false, error: 'room 须为完整房间 ID（!local:server）' }
  if (typeof r.body !== 'string' || r.body.trim().length === 0) return { ok: false, error: 'body 非空' }
  if (r.body.length > 4000) return { ok: false, error: 'body ≤4000 字符' }
  if (typeof r.kind !== 'string' || !(HUMANSIM_KINDS as readonly string[]).includes(r.kind)) {
    return { ok: false, error: `kind ∈ ${HUMANSIM_KINDS.join('|')}` }
  }
  return { ok: true, value: { as: r.as, room: r.room, body: r.body, kind: r.kind } }
}

/** 审计行构造（纯函数）：ndjson 单行，含时刻/账号/房间/类型/正文摘要/eventId。 */
export function auditLine(v: HumansimSendRequest, eventId: string, ts = new Date().toISOString()): string {
  return JSON.stringify({ ts, as: v.as, room: v.room, kind: v.kind, eventId, head: v.body.slice(0, 80) })
}

function credsDir(): string | null {
  const d = process.env.HUMANSIM_CREDS_DIR
  return d && existsSync(d) ? d : null
}

router.post('/send', async (ctx: Context) => {
  const dir = credsDir()
  if (!dir) { ctx.status = 503; ctx.body = { error: 'humansim 未配置（HUMANSIM_CREDS_DIR 缺席=fail-closed）' }; return }
  const parsed = validateSend(ctx.request.body)
  if (!parsed.ok) { ctx.status = 400; ctx.body = { error: parsed.error }; return }
  const v = parsed.value
  const tokenFile = resolve(dir, `${v.as}.token`)
  if (!existsSync(tokenFile)) { ctx.status = 404; ctx.body = { error: `账号 ${v.as} 无 token 文件` }; return }
  const token = readFileSync(tokenFile, 'utf-8').trim().split('\n')[0]
  const hs = process.env.HUMANSIM_HOMESERVER ?? 'http://127.0.0.1:8008'
  const res = await fetch(`${hs}/_matrix/client/v3/rooms/${encodeURIComponent(v.room)}/send/m.room.message?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'm.text', body: `[${v.kind}] ${v.body}` }),
  })
  if (!res.ok) { ctx.status = 502; ctx.body = { error: `homeserver ${res.status}` }; return }
  const out = (await res.json()) as { event_id?: string }
  const eventId = out.event_id ?? ''
  const auditFile = process.env.HUMANSIM_AUDIT ?? resolve(dir, 'humansim-audit.ndjson')
  appendFileSync(auditFile, auditLine(v, eventId) + '\n', 'utf-8')
  ctx.body = { eventId, audit: auditFile }
})

router.get('/audit', (ctx: Context) => {
  const dir = credsDir()
  if (!dir) { ctx.status = 503; ctx.body = { error: 'humansim 未配置' }; return }
  const auditFile = process.env.HUMANSIM_AUDIT ?? resolve(dir, 'humansim-audit.ndjson')
  const limit = Math.max(1, Math.min(200, Number(ctx.query.limit ?? 50) || 50))
  if (!existsSync(auditFile)) { ctx.body = { lines: [] }; return }
  const lines = readFileSync(auditFile, 'utf-8').trim().split('\n').filter(Boolean)
  ctx.body = { lines: lines.slice(-limit).reverse() }
})

export { router as humansimRouter }
