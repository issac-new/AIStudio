/**
 * 上下文无损滚存 REST（/api/context-archive/*）——C1 召回面 + C4 可观测面。
 *
 *   GET  /sessions                 → 有归档的会话列表（窗数/最近归档时间/首窗标记）
 *   GET  /windows?session=         → 窗列表（window/boundary/anchor 摘要）
 *   GET  /window?session=&n=       → 整窗 verbatim（boundary+anchor+messages 全文）
 *   GET  /search?session=&q=&role= → 跨窗 substring 大小写不敏感检索（snippet ±40 字符）
 *   GET  /state                    → 换窗可观测性（最近 advance 结果/原因/盘面汇总）
 *   POST /advance                  → 显式推进（无需后台轮询）
 *
 * 触发模型=懒推进：GET /sessions、GET /windows 先 advance 再返回（压缩边界变化
 * 在读取时收敛到归档面，零后台任务）；/window /search /state 读已落盘事实不再推进。
 * 挂载：patch 544（bootstrap/routes.ts 两 hunk，403 token-meter 同款模式）。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import {
  listArchivedSessions, readSessionIndex, readWindowFile, searchSessionWindows,
} from './archive-store'
import { advanceSessionArchives } from './advance'
import { getRolloverState } from './rollover-state'

const router = new Router({ prefix: '/api/context-archive' })

/** 缺参统一 400（approval 域同款口径）。 */
function bad(ctx: Context, detail: string): void {
  ctx.status = 400
  ctx.body = { ok: false, detail }
}

router.get('/sessions', async (ctx) => {
  const advance = await advanceSessionArchives()
  ctx.body = {
    ok: true,
    available: advance.available,
    reasons: advance.reasons,
    sessions: listArchivedSessions().map((s) => ({
      session: s.session,
      windowCount: s.windowCount,
      lastArchivedMessageId: s.lastArchivedMessageId,
      lastArchivedAt: s.lastArchivedAt,
      /** 首窗语义标记：最近一窗仍是首观察窗（从会话头整体归档，历史边界不可切分）。 */
      lastFirstObservation: s.lastFirstObservation,
    })),
  }
})

router.get('/windows', async (ctx) => {
  const session = String(ctx.query.session ?? '')
  if (!session) return bad(ctx, 'session 必填')
  const advance = await advanceSessionArchives()
  const idx = readSessionIndex(session)
  // 窗列表=boundary 摘要 + anchor 三行（逐窗读文件取锚——窗数量级小，读得起）
  const windows = (idx?.windows ?? []).map((w) => ({
    ...w,
    anchor: readWindowFile(session, w.window)?.anchor ?? null,
  }))
  ctx.body = {
    ok: true,
    session,
    available: advance.available,
    windows,
  }
})

router.get('/window', (ctx) => {
  const session = String(ctx.query.session ?? '')
  const n = Number(ctx.query.n)
  if (!session) return bad(ctx, 'session 必填')
  if (!Number.isInteger(n) || n < 1) return bad(ctx, 'n 必填（≥1 的窗号）')
  const file = readWindowFile(session, n)
  if (!file) {
    ctx.status = 404
    ctx.body = { ok: false, detail: `窗口不存在：session=${session} n=${n}` }
    return
  }
  ctx.body = { ok: true, ...file }
})

router.get('/search', (ctx) => {
  const session = String(ctx.query.session ?? '')
  const q = String(ctx.query.q ?? '')
  const role = ctx.query.role === undefined ? undefined : String(ctx.query.role)
  if (!session) return bad(ctx, 'session 必填')
  if (!q) return bad(ctx, 'q 必填（检索词）')
  ctx.body = { ok: true, session, q, hits: searchSessionWindows(session, q, role) }
})

router.get('/state', (ctx) => {
  ctx.body = { ok: true, state: getRolloverState() }
})

router.post('/advance', async (ctx) => {
  const result = await advanceSessionArchives()
  ctx.body = { ok: true, result }
})

export const contextArchiveRoutes = router
