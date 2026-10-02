/**
 * 跨窗工作笔记 REST（/api/ctx-notes/*）——C3。
 *
 *   GET    /?session=           → 笔记列表（附每条 freshness：落后于最近归档即
 *                                 stale:true）+ hasNotes 诚实降级标志 + lastArchiveAt
 *   POST   /  { session, text }  → 新增
 *   PUT    /:id { session, text }→ 改写（updatedAt 前移）
 *   DELETE /:id?session=         → 删除
 *   GET    /search?session=&q=   → substring 大小写不敏感检索
 *
 * 新鲜度门：笔记 updatedAt < 该会话最近一次归档 archivedAt → stale:true
 * （DSH「笔记落后于事件即 STALE」）。从未写笔记：hasNotes:false，UI 诚实降级
 * 提示"未写过笔记，可从上下文档案召回"（词条在面板组件）。
 * 挂载：patch 545（bootstrap/routes.ts 两 hunk，544 同款模式）。
 */
import Router from '@koa/router'
import type { Context } from 'koa'
import { lastArchiveTime } from '../contextarchive/archive-store'
import { addNote, deleteNote, hasNotesFile, listNotes, searchNotes, updateNote, type CtxNote } from './notes-store'

const router = new Router({ prefix: '/api/ctx-notes' })

function bad(ctx: Context, detail: string): void {
  ctx.status = 400
  ctx.body = { ok: false, detail }
}

function bodyOf(ctx: Context): Record<string, unknown> {
  // koa 核心类型无 body（bodyparser 增广）；与 inbox/approvals 控制器同款窄化转型
  return ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
}

/** 单条笔记视图：附新鲜度（无归档=不可能 stale，恒 false）。 */
function noteView(session: string, lastArchiveAt: number | null, n: CtxNote): CtxNote & { stale: boolean } {
  return { ...n, stale: lastArchiveAt !== null && n.updatedAt < lastArchiveAt }
}

router.get('/', (ctx) => {
  const session = String(ctx.query.session ?? '')
  if (!session) return bad(ctx, 'session 必填')
  const lastArchiveAt = lastArchiveTime(session)
  const notes = listNotes(session)
  ctx.body = {
    ok: true,
    session,
    hasNotes: hasNotesFile(session),
    lastArchiveAt,
    notes: notes.map((n) => noteView(session, lastArchiveAt, n)),
  }
})

router.post('/', (ctx) => {
  const body = bodyOf(ctx)
  const session = typeof body.session === 'string' ? body.session : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!session) return bad(ctx, 'session 必填')
  if (!text) return bad(ctx, 'text 必填（非空）')
  const note = addNote(session, text)
  ctx.status = 201
  ctx.body = { ok: true, note }
})

router.put('/:id', (ctx) => {
  const id = String(ctx.params.id ?? '')
  const body = bodyOf(ctx)
  const session = typeof body.session === 'string' ? body.session : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!session || !id) return bad(ctx, 'session/id 必填')
  if (!text) return bad(ctx, 'text 必填（非空）')
  const note = updateNote(session, id, text)
  if (!note) {
    ctx.status = 404
    ctx.body = { ok: false, detail: `笔记不存在：${id}` }
    return
  }
  ctx.body = { ok: true, note }
})

router.delete('/:id', (ctx) => {
  const id = String(ctx.params.id ?? '')
  const session = String(ctx.query.session ?? '')
  if (!session || !id) return bad(ctx, 'session/id 必填')
  const removed = deleteNote(session, id)
  if (!removed) {
    ctx.status = 404
    ctx.body = { ok: false, detail: `笔记不存在：${id}` }
    return
  }
  ctx.body = { ok: true }
})

router.get('/search', (ctx) => {
  const session = String(ctx.query.session ?? '')
  const q = String(ctx.query.q ?? '')
  if (!session) return bad(ctx, 'session 必填')
  if (!q) return bad(ctx, 'q 必填（检索词）')
  ctx.body = { ok: true, session, q, hits: searchNotes(session, q) }
})

export const ctxNotesRoutes = router
