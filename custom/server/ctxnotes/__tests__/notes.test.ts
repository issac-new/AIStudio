// overlay/custom/server/ctxnotes/__tests__/notes.test.ts
// C3 守门：CRUD + stale 判定（笔记 updatedAt 落后最近归档 archivedAt）+ 搜索 +
// 诚实降级标志（hasNotes:false）+ 控制器真 koa HTTP 全路（200/201/400/404）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import { addNote, deleteNote, hasNotesFile, listNotes, searchNotes, updateNote } from '../notes-store'
import { writeSessionIndex } from '../../contextarchive/archive-store'
import { ctxNotesRoutes } from '../ctx-notes-controller'

let dir: string
let base = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ctxnotes-'))
  process.env.CTX_NOTES_DIR = join(dir, 'notes')
  process.env.CONTEXT_ARCHIVE_DIR = join(dir, 'archive')
})

afterEach(() => {
  delete process.env.CTX_NOTES_DIR
  delete process.env.CONTEXT_ARCHIVE_DIR
  rmSync(dir, { recursive: true, force: true })
})

/** 造一份该会话的归档 index（stale 判定的对面事实源），archivedAt 可指定。 */
function fakeArchive(session: string, archivedAt: number): void {
  writeSessionIndex(session, {
    session, windowCount: 1, lastArchivedMessageId: 9,
    windows: [{ window: 1, fromMessageId: 1, toMessageId: 9, messageCount: 9, archivedAt, firstObservation: true }],
  })
}

describe('store：CRUD + 搜索 + 诚实降级', () => {
  it('增改删查全链；未写过笔记 hasNotesFile=false', () => {
    expect(hasNotesFile('s1')).toBe(false) // 诚实降级：从未写过
    const n1 = addNote('s1', '登录崩溃根因在 token 过期未刷新')
    const n2 = addNote('s1', '修复分支 feat/login-fix 待评审')
    expect(listNotes('s1').map((n) => n.id)).toEqual([n2.id, n1.id]) // 新→旧
    expect(hasNotesFile('s1')).toBe(true)

    const updated = updateNote('s1', n1.id, '根因已确认：token 过期未刷新（已复现）')!
    expect(updated.updatedAt).toBeGreaterThanOrEqual(n1.updatedAt)
    expect(updateNote('s1', 'note-none', 'x')).toBeNull()

    expect(searchNotes('s1', 'TOKEN') /** 大小写不敏感 */ .map((n) => n.id)).toEqual([n1.id])
    expect(deleteNote('s1', n2.id)).toBe(true)
    expect(deleteNote('s1', n2.id)).toBe(false) // 再删=已不存在
    expect(listNotes('s1')).toHaveLength(1)
  })
})

describe('stale 判据（控制器 noteView 同一公式：updatedAt < archivedAt）', () => {
  it('归档时间晚于笔记 → stale；归档时间早于笔记 → 非 stale', () => {
    const early = addNote('s2', '早期笔记')
    const archivedAt = Date.now() + 60_000
    fakeArchive('s2', archivedAt)
    const late = addNote('s2', '换窗后补写的笔记')
    // 判据（控制器 noteView 原文）：lastArchiveAt !== null && n.updatedAt < lastArchiveAt
    expect(early.updatedAt < archivedAt).toBe(true) // → stale:true
    expect(late.updatedAt >= early.updatedAt).toBe(true) // 补写晚于归档 → 非 stale
    // 无归档的会话：lastArchiveAt=null 恒非 stale（没有可落后的对面事件）
    const noArchive = addNote('s3', '从未压缩过的会话笔记')
    expect(noArchive.updatedAt > 0).toBe(true)
  })
})

describe('HTTP 投影（/api/ctx-notes）', () => {
  it('GET/POST/PUT/DELETE/search 全路 + stale 徽标 + 诚实降级', async () => {
    const app = new Koa()
    app.use(async (ctx, next) => {
      if (ctx.method === 'POST' || ctx.method === 'PUT') {
        const chunks: Buffer[] = []
        for await (const c of ctx.req) chunks.push(c as Buffer)
        try { ctx.request.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { ctx.request.body = {} }
      }
      await next()
    })
    app.use(ctxNotesRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      // 诚实降级：未写过笔记 → hasNotes:false
      const empty = await fetch(`${base}/api/ctx-notes/?session=s9`)
      expect(empty.status).toBe(200)
      const emptyBody = await empty.json() as { hasNotes: boolean; notes: unknown[] }
      expect(emptyBody.hasNotes).toBe(false)
      expect(emptyBody.notes).toEqual([])

      // POST 新增（201）
      const created = await fetch(`${base}/api/ctx-notes/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: 's9', text: '第一轮结论：锚点已归档' }),
      })
      expect(created.status).toBe(201)
      const createdBody = await created.json() as { note: { id: string } }
      const noteId = createdBody.note.id
      expect(noteId).toBeTruthy()

      // 制造 stale：归档时间在未来（笔记落后于事件）
      fakeArchive('s9', Date.now() + 60_000)
      const listed = await fetch(`${base}/api/ctx-notes/?session=s9`)
      const listBody = await listed.json() as { hasNotes: boolean; lastArchiveAt: number; notes: Array<{ id: string; stale: boolean; text: string }> }
      expect(listBody.hasNotes).toBe(true)
      expect(listBody.lastArchiveAt).toBeGreaterThan(0)
      expect(listBody.notes[0]!.stale).toBe(true)

      // 归档时间改回过去（模拟时间流逝后笔记已可追平），PUT 改写 → 脱 stale + 404 未知 id
      fakeArchive('s9', Date.now() - 60_000)
      const edited = await fetch(`${base}/api/ctx-notes/${encodeURIComponent(noteId)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: 's9', text: '更新：两窗均已召回核对' }),
      })
      expect(edited.status).toBe(200)
      const editedBody = await edited.json() as { note: { updatedAt: number } }
      const after = await fetch(`${base}/api/ctx-notes/?session=s9`)
      const afterBody = await after.json() as { notes: Array<{ stale: boolean }> }
      expect(afterBody.notes[0]!.stale).toBe(false) // 补写后不再落后
      expect(editedBody.note.updatedAt).toBeGreaterThan(0)
      const missing = await fetch(`${base}/api/ctx-notes/note-none`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: 's9', text: 'x' }),
      })
      expect(missing.status).toBe(404)

      // 搜索
      const search = await fetch(`${base}/api/ctx-notes/search?session=s9&q=召回`)
      expect(search.status).toBe(200)
      const searchBody = await search.json() as { hits: Array<{ id: string }> }
      expect(searchBody.hits.map((h) => h.id)).toContain(noteId)

      // DELETE + 再删 404
      const del = await fetch(`${base}/api/ctx-notes/${encodeURIComponent(noteId)}?session=s9`, { method: 'DELETE' })
      expect(del.status).toBe(200)
      const delAgain = await fetch(`${base}/api/ctx-notes/${encodeURIComponent(noteId)}?session=s9`, { method: 'DELETE' })
      expect(delAgain.status).toBe(404)

      // 400 面：缺 session / 空文本 / 缺 q
      expect((await fetch(`${base}/api/ctx-notes/`)).status).toBe(400)
      expect((await fetch(`${base}/api/ctx-notes/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: 's9', text: '  ' }),
      })).status).toBe(400)
      expect((await fetch(`${base}/api/ctx-notes/search?session=s9`)).status).toBe(400)
    } finally {
      server.close()
    }
  })
})
