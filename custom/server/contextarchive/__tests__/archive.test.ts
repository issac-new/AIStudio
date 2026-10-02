// overlay/custom/server/contextarchive/__tests__/archive.test.ts
// C1 守门：tmpdir fixture 库 → advance 产窗（边界推进两次=两窗）→ 幂等 →
// verbatim（窗内 messages 与库行逐字段相等）→ 首观察窗语义 → 库缺席/表缺席
// available:false（不抛，fail-soft）。红线复检：advance 只读开库。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeStudioDb, insertMessage, setSnapshot } from './fixture'
import {
  MESSAGE_COLUMNS, readSessionIndex, readWindowFile, listArchivedSessions, searchSessionWindows,
} from '../archive-store'
import { advanceSessionArchives } from '../advance'

let dir: string
let dbPath: string
let db: DatabaseSync

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ctxar-'))
  dbPath = join(dir, 'hermes-web-ui.db')
  process.env.CONTEXT_ARCHIVE_DIR = join(dir, 'archive')
  db = makeStudioDb(dbPath, [{ id: 'sess-a', title: '修复登录崩溃' }])
})

afterEach(() => {
  try { db?.close() } catch { /* 已关 */ }
  delete process.env.CONTEXT_ARCHIVE_DIR
  rmSync(dir, { recursive: true, force: true })
})

function rowOf(id: number): Record<string, unknown> {
  const cols = MESSAGE_COLUMNS.join(', ')
  return db.prepare(`SELECT ${cols} FROM messages WHERE id = ?`).get(id) as Record<string, unknown>
}

describe('advance：产窗 + 幂等 + verbatim', () => {
  it('边界推进两次=两窗；窗内 messages 与库行逐字段相等；重复 advance 零新窗', async () => {
    for (let i = 1; i <= 10; i++) {
      insertMessage(db, 'sess-a', {
        role: i % 2 ? 'user' : 'assistant',
        content: `消息正文第${i}条，含检索锚TOKEN${i}`,
        displayRole: i % 2 ? null : '助手',
        toolName: i === 4 ? 'terminal' : null,
      })
    }
    setSnapshot(db, 'sess-a', 5)
    const r1 = await advanceSessionArchives(dbPath)
    expect(r1.available).toBe(true)
    expect(r1.windowsCreated).toBe(1)
    expect(r1.windows[0]).toMatchObject({ session: 'sess-a', window: 1, messageCount: 5 })

    // 首观察窗语义：window #1 从会话头整体归档（历史边界被覆盖不可切分）
    const w1 = readWindowFile('sess-a', 1)!
    expect(w1.boundary.firstObservation).toBe(true)
    expect(w1.boundary.fromMessageId).toBe(1)
    expect(w1.boundary.toMessageId).toBe(5)
    expect(w1.messages.map((m) => m.id)).toEqual([1, 2, 3, 4, 5])
    // verbatim 红线：逐字段与库行相等（无摘要/无截断/无改写）
    for (const m of w1.messages) expect(m).toEqual(rowOf(m.id))

    // 边界推进 → window #2 精确增量（6..8），firstObservation=false
    setSnapshot(db, 'sess-a', 8)
    const r2 = await advanceSessionArchives(dbPath)
    expect(r2.windowsCreated).toBe(1)
    expect(r2.windows[0]).toMatchObject({ session: 'sess-a', window: 2, messageCount: 3 })
    const w2 = readWindowFile('sess-a', 2)!
    expect(w2.boundary.firstObservation).toBe(false)
    expect(w2.boundary.fromMessageId).toBe(6)
    expect(w2.boundary.toMessageId).toBe(8)
    for (const m of w2.messages) expect(m).toEqual(rowOf(m.id))

    // 幂等：边界未推进 → 零新窗
    const r3 = await advanceSessionArchives(dbPath)
    expect(r3.windowsCreated).toBe(0)
    expect(r3.sessionsArchived).toBe(0)

    // index 一致性：窗计数/已归档边界/窗清单
    const idx = readSessionIndex('sess-a')!
    expect(idx.windowCount).toBe(2)
    expect(idx.lastArchivedMessageId).toBe(8)
    expect(idx.windows.map((w) => w.window)).toEqual([1, 2])
    // 会话列表：窗数/首窗标记
    const sessions = listArchivedSessions()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ session: 'sess-a', windowCount: 2 })
  })

  it('锚点入库且三行格式（C2 集成面）；跨窗检索命中两窗（C1 召回面）', async () => {
    insertMessage(db, 'sess-a', { role: 'user', content: '任务一 TOKEN_A' })
    insertMessage(db, 'sess-a', { role: 'assistant', content: '已完成', toolName: 'edit_file' })
    setSnapshot(db, 'sess-a', 2)
    await advanceSessionArchives(dbPath)
    insertMessage(db, 'sess-a', { role: 'user', content: '任务二 TOKEN_B' })
    setSnapshot(db, 'sess-a', 3)
    await advanceSessionArchives(dbPath)

    const w2 = readWindowFile('sess-a', 2)!
    expect(w2.anchor).toHaveLength(3)
    expect(w2.anchor[0]).toBe('Context window #2 opened')
    expect(w2.anchor[1]).toBe('任务：修复登录崩溃') // 会话标题优先

    // 跨窗 substring 大小写不敏感 + snippet ±40 字符
    const hitsLower = searchSessionWindows('sess-a', 'token_a')
    expect(hitsLower).toHaveLength(1)
    expect(hitsLower[0]!.window).toBe(1)
    expect(hitsLower[0]!.snippet).toContain('TOKEN_A')
    const both = searchSessionWindows('sess-a', '任务')
    expect(both.map((h) => h.window).sort()).toEqual([1, 2])
    // role 过滤
    const onlyUser = searchSessionWindows('sess-a', '任务', 'user')
    expect(onlyUser.every((h) => h.role === 'user')).toBe(true)
  })
})

describe('fail-soft：库缺席/表缺席 available:false（不抛）', () => {
  it('库文件缺席', async () => {
    const r = await advanceSessionArchives(join(dir, 'nope.db'))
    expect(r.available).toBe(false)
    expect(r.reasons.join(' ')).toContain('db_missing')
  })

  it('压缩快照表缺席（老库形态）', async () => {
    const old = new DatabaseSync(join(dir, 'old.db'))
    old.exec('CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT)')
    old.close()
    const r = await advanceSessionArchives(join(dir, 'old.db'))
    expect(r.available).toBe(false)
    expect(r.reasons.join(' ')).toContain('table_missing:chat_compression_snapshots')
  })
})

describe('红线复检：只读开库 + tmp+rename 落盘形态', () => {
  it('advance 源码 readOnly 打开；写文件不残留 .tmp', async () => {
    const src = readFileSync(join(__dirname, '../advance.ts'), 'utf8')
    expect(src).toContain("readOnly: true")
    expect(src).not.toMatch(/readOnly:\s*false/)
    // 动一笔可归档数据后查目录：只有 window/index/state 三类 json，无 tmp 残留
    insertMessage(db, 'sess-a', { role: 'user', content: 'x' })
    setSnapshot(db, 'sess-a', 1)
    await advanceSessionArchives(dbPath)
    const { readdirSync } = await import('node:fs')
    const files = readdirSync(join(dir, 'archive'), { recursive: true }).map(String)
    expect(files.some((f) => f.includes('window-1.json'))).toBe(true)
    expect(files.some((f) => f.endsWith('index.json'))).toBe(true)
    expect(files.some((f) => f.endsWith('state.json'))).toBe(true)
    expect(files.some((f) => f.includes('.tmp'))).toBe(false)
    expect(existsSync(join(dir, 'archive', 'sess-a', 'window-1.json'))).toBe(true)
  })
})
