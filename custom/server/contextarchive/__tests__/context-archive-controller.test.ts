// overlay/custom/server/contextarchive/__tests__/context-archive-controller.test.ts
// 控制器守门：真 koa HTTP 投影——懒推进（GET /sessions、GET /windows 先 advance）、
// /window verbatim、/search、/state 可观测、POST /advance 幂等；400/404 面。
// 库经 env RUN_UNDO_DB 重定向到 fixture（resolveStudioDb 探测链第一优先级）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Koa from 'koa'
import { makeStudioDb, insertMessage, setSnapshot } from './fixture'
import { contextArchiveRoutes } from '../context-archive-controller'

let dir: string
let dbPath: string
let db: DatabaseSync
let base = ''
let server: ReturnType<typeof createServer>

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ctxarc-'))
  dbPath = join(dir, 'hermes-web-ui.db')
  process.env.RUN_UNDO_DB = dbPath
  process.env.CONTEXT_ARCHIVE_DIR = join(dir, 'archive')
  db = makeStudioDb(dbPath, [
    { id: 'sess-a', title: '会话A' },
    { id: 'sess-b', title: '会话B' },
  ])
  const app = new Koa()
  app.use(contextArchiveRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(() => {
  server.close()
  try { db?.close() } catch { /* 已关 */ }
  delete process.env.RUN_UNDO_DB
  delete process.env.CONTEXT_ARCHIVE_DIR
  rmSync(dir, { recursive: true, force: true })
})

function seed(): { bLastId: number } {
  for (let i = 1; i <= 10; i++) {
    insertMessage(db, 'sess-a', { role: i % 2 ? 'user' : 'assistant', content: `A消息${i} NEEDLE_${i}` })
  }
  insertMessage(db, 'sess-b', { role: 'user', content: 'B消息1' })
  const bLastId = insertMessage(db, 'sess-b', { role: 'assistant', content: 'B回复1', toolName: 'edit_file' })
  return { bLastId }
}

describe('GET /sessions：懒推进 + 列表', () => {
  it('无压缩快照时空列表（available:true）；有快照即产窗', async () => {
    const { bLastId } = seed()
    const empty = await (await fetch(`${base}/api/context-archive/sessions`)).json() as { sessions: unknown[] }
    expect(empty.sessions).toEqual([])
    setSnapshot(db, 'sess-a', 5)
    // 注意：compressed_through_message_id 是 messages 全局自增 id（非会话内序号）
    setSnapshot(db, 'sess-b', bLastId)
    const body = await (await fetch(`${base}/api/context-archive/sessions`)).json() as {
      available: boolean
      sessions: Array<{ session: string; windowCount: number; lastArchivedAt: number }>
    }
    expect(body.available).toBe(true)
    expect(body.sessions).toHaveLength(2)
    expect(body.sessions.map((s) => s.session).sort()).toEqual(['sess-a', 'sess-b'])
    expect(body.sessions.every((s) => s.windowCount === 1 && s.lastArchivedAt > 0)).toBe(true)
  })
})

describe('GET /windows + /window + /search：召回面', () => {
  it('窗列表（boundary 摘要）→ 单窗 verbatim → 跨窗检索；边界再推进懒收敛', async () => {
    seed()
    setSnapshot(db, 'sess-a', 5)
    await fetch(`${base}/api/context-archive/sessions`)
    // 边界推进在 /windows 读取时懒收敛（无需 POST /advance）
    setSnapshot(db, 'sess-a', 8)
    const wl = await (await fetch(`${base}/api/context-archive/windows?session=sess-a`)).json() as {
      windows: Array<{ window: number; fromMessageId: number; toMessageId: number; messageCount: number; firstObservation: boolean; anchor: string[] | null }>
    }
    expect(wl.windows.map((w) => w.window)).toEqual([1, 2])
    expect(wl.windows[0]!.firstObservation).toBe(true)
    expect(wl.windows[1]).toMatchObject({ fromMessageId: 6, toMessageId: 8, messageCount: 3, firstObservation: false })
    // 窗列表含 anchor 三行摘要（C2 派生面随窗可见）
    expect(wl.windows[1]!.anchor).toHaveLength(3)
    expect(wl.windows[1]!.anchor![0]).toBe('Context window #2 opened')

    const w2 = await (await fetch(`${base}/api/context-archive/window?session=sess-a&n=2`)).json() as {
      session: string; window: number; anchor: string[]; messages: Array<{ id: number; content: string }> ; boundary: { compressedThroughMessageId: number }
    }
    expect(w2.session).toBe('sess-a')
    expect(w2.messages.map((m) => m.id)).toEqual([6, 7, 8])
    expect(w2.messages.map((m) => m.content)).toEqual(['A消息6 NEEDLE_6', 'A消息7 NEEDLE_7', 'A消息8 NEEDLE_8'])
    expect(w2.anchor).toHaveLength(3)
    expect(w2.boundary.compressedThroughMessageId).toBe(8)

    // 跨窗检索：NEEDLE 在两窗各命中
    const sr = await (await fetch(`${base}/api/context-archive/search?session=sess-a&q=needle_3`)).json() as { hits: Array<{ window: number; messageId: number; role: string; snippet: string }> }
    expect(sr.hits).toHaveLength(1)
    expect(sr.hits[0]).toMatchObject({ window: 1, messageId: 3 })
    expect(sr.hits[0]!.snippet.toLowerCase()).toContain('needle_3')
    // role 过滤
    const userOnly = await (await fetch(`${base}/api/context-archive/search?session=sess-a&q=NEEDLE&role=user`)).json() as { hits: Array<{ role: string }> }
    expect(userOnly.hits.length).toBeGreaterThan(0)
    expect(userOnly.hits.every((h) => h.role === 'user')).toBe(true)
  })

  it('400/404 面：缺参 400；未知窗 404', async () => {
    expect((await fetch(`${base}/api/context-archive/windows`)).status).toBe(400)
    expect((await fetch(`${base}/api/context-archive/window?session=sess-a&n=0`)).status).toBe(400)
    expect((await fetch(`${base}/api/context-archive/window?session=sess-a&n=99`)).status).toBe(404)
    expect((await fetch(`${base}/api/context-archive/search?session=sess-a&q=`)).status).toBe(400)
  })
})

describe('GET /state + POST /advance：换窗可观测（C4）', () => {
  it('state 报最近 advance 结果/原因/盘面汇总；POST /advance 幂等复测', async () => {
    seed()
    setSnapshot(db, 'sess-a', 5)
    const adv = await (await fetch(`${base}/api/context-archive/advance`, { method: 'POST' })).json() as {
      result: { available: boolean; windowsCreated: number; sessionsArchived: number }
    }
    expect(adv.result).toMatchObject({ available: true, windowsCreated: 1, sessionsArchived: 1 })
    // 幂等：再推进零新窗
    const again = await (await fetch(`${base}/api/context-archive/advance`, { method: 'POST' })).json() as { result: { windowsCreated: number } }
    expect(again.result.windowsCreated).toBe(0)

    const state = await (await fetch(`${base}/api/context-archive/state`)).json() as {
      state: { lastAdvanceAt: number | null; sessionsArchived: number; windowCount: number; unavailable: string[]; lastResult: { windowsCreated: number } | null }
    }
    expect(state.state.lastAdvanceAt).not.toBeNull()
    expect(state.state.sessionsArchived).toBe(1)
    expect(state.state.windowCount).toBe(1)
    expect(state.state.unavailable).toEqual([])
    expect(state.state.lastResult!.windowsCreated).toBe(0) // 最近一次=幂等轮
  })
})
