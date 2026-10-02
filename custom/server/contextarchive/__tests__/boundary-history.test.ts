// 遗留④守门（2026-10-03）：边界史表按次切窗——patch 546 起压缩保存时追加式记录
// 每一次边界，advance 据此把两次推进之间的多次压缩切成多个精确窗（旧行为=并成
// 一窗）。缺表回落旧单窗语义；史表落后主表时防御性兜底不丢消息。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ctxbh-'))
  process.env.CONTEXT_ARCHIVE_DIR = join(dir, 'archive')
})
afterEach(() => {
  delete process.env.CONTEXT_ARCHIVE_DIR
  rmSync(dir, { recursive: true, force: true })
})

const dbPath = () => join(dir, 'studio.db')

function addHistoryTable(db: DatabaseSync): void {
  // 与 patch 546 同构的边界史表（读侧契约测试不依赖 upstream 打补丁）
  db.exec(`CREATE TABLE chat_compression_boundary_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    boundary_message_id INTEGER NOT NULL,
    protected_head_through_message_id INTEGER,
    history_revision INTEGER,
    recorded_at INTEGER NOT NULL
  )`)
}

function pushHistory(db: DatabaseSync, sessionId: string, boundaryMessageId: number): void {
  db.prepare(
    'INSERT INTO chat_compression_boundary_history (session_id, boundary_message_id, recorded_at) VALUES (?, ?, ?)',
  ).run(sessionId, boundaryMessageId, Date.now())
}

const windowFile = (session: string, n: number) =>
  JSON.parse(readFileSync(join(dir, 'archive', session, `window-${n}.json`), 'utf8'))

describe('遗留④：边界史表按次切窗', () => {
  it('两次压缩一次推进 → 两窗精确切分（不并窗），boundarySource=history', async () => {
    const { makeStudioDb, insertMessage, setSnapshot } = await import('./fixture')
    const db = makeStudioDb(dbPath(), [{ id: 's1', title: '史表切窗' }])
    for (let i = 0; i < 10; i++) insertMessage(db, 's1', { role: i % 2 ? 'assistant' : 'user', content: `m${i}` })
    addHistoryTable(db)
    pushHistory(db, 's1', 4)    // 第一次压缩：边界=4
    pushHistory(db, 's1', 8)    // 第二次压缩：边界=8（advance 未跑，两次都待归档）
    setSnapshot(db, 's1', 8)    // 主表=最新边界（与史表末条一致）
    db.close()

    const { advanceSessionArchives } = await import('../advance')
    const r = await advanceSessionArchives(dbPath())
    expect(r.windowsCreated).toBe(2)
    // 首窗=会话头→4（firstObservation，部署前存量语义）；次窗=4→8
    const w1 = windowFile('s1', 1)
    expect(w1.boundary.fromMessageId).toBe(1)
    expect(w1.boundary.toMessageId).toBe(4)
    expect(w1.boundary.firstObservation).toBe(true)
    expect(w1.boundary.boundarySource).toBe('history')
    const w2 = windowFile('s1', 2)
    expect(w2.boundary.fromMessageId).toBe(5)
    expect(w2.boundary.toMessageId).toBe(8)
    expect(w2.boundary.firstObservation).toBe(false)
    expect(w2.boundary.boundarySource).toBe('history')
    // verbatim：窗 2 恰含 m5..m8 四行
    expect(w2.messages.map((m: { content: string }) => m.content)).toEqual(['m4', 'm5', 'm6', 'm7'].map(x => `m${Number(x.slice(1))}`) ?? [])
    expect(w2.messages).toHaveLength(4)
    // 幂等：再推进零新窗
    const r2 = await advanceSessionArchives(dbPath())
    expect(r2.windowsCreated).toBe(0)
  })

  it('史表缺席 → 回落主表单窗（旧语义不变，boundarySource=snapshot）', async () => {
    const { makeStudioDb, insertMessage, setSnapshot } = await import('./fixture')
    const db = makeStudioDb(dbPath(), [{ id: 's2', title: '回落' }])
    for (let i = 0; i < 6; i++) insertMessage(db, 's2', { role: 'user', content: `m${i}` })
    setSnapshot(db, 's2', 6)
    db.close()

    const { advanceSessionArchives } = await import('../advance')
    const r = await advanceSessionArchives(dbPath())
    expect(r.windowsCreated).toBe(1)
    const w1 = windowFile('s2', 1)
    expect(w1.boundary.toMessageId).toBe(6)
    expect(w1.boundary.firstObservation).toBe(true)
    expect(w1.boundary.boundarySource).toBe('snapshot')
  })

  it('史表落后主表（防御路径）→ 末窗以主表边界兜底，消息零丢失', async () => {
    const { makeStudioDb, insertMessage, setSnapshot } = await import('./fixture')
    const db = makeStudioDb(dbPath(), [{ id: 's3', title: '兜底' }])
    for (let i = 0; i < 10; i++) insertMessage(db, 's3', { role: 'user', content: `m${i}` })
    addHistoryTable(db)
    pushHistory(db, 's3', 3)   // 史表只记到 3
    setSnapshot(db, 's3', 10)  // 主表=10（史表落后的异常态）
    db.close()

    const { advanceSessionArchives } = await import('../advance')
    const r = await advanceSessionArchives(dbPath())
    expect(r.windowsCreated).toBe(2)
    const w2 = windowFile('s3', 2)
    expect(w2.boundary.toMessageId).toBe(10)
    expect(w2.boundary.boundarySource).toBe('snapshot')  // 兜底窗标记来源
    expect(w2.messages).toHaveLength(7)                   // 4..10 全量在窗
    // index 推进到 10：幂等再跑零窗
    const r2 = await advanceSessionArchives(dbPath())
    expect(r2.windowsCreated).toBe(0)
    expect(existsSync(join(dir, 'archive', 's3', 'window-3.json'))).toBe(false)
  })
})
