// overlay/custom/server/contextarchive/__tests__/fixture.ts
// 测试共用的会话库 fixture（node:sqlite）：sessions/messages/chat_compression_snapshots
// 三表 + 假数据。列清单与 upstream schemas.ts 对齐（messages 全 16 列——verbatim
// 断言按显式列逐字段比对）。
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export interface FixtureMsg {
  role: string
  content: string
  displayRole?: string | null
  displayContent?: string | null
  toolName?: string | null
}

export function makeStudioDb(dbPath: string, sessions: Array<{ id: string; title: string | null }>): DatabaseSync {
  mkdirSync(join(dbPath, '..'), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      display_role TEXT,
      display_content TEXT,
      tool_call_id TEXT,
      tool_calls TEXT,
      tool_name TEXT,
      run_marker TEXT,
      timestamp INTEGER NOT NULL,
      token_count INTEGER,
      finish_reason TEXT,
      reasoning TEXT,
      reasoning_details TEXT,
      reasoning_content TEXT
    );
    CREATE TABLE chat_compression_snapshots (
      session_id TEXT PRIMARY KEY,
      summary TEXT NOT NULL DEFAULT '',
      last_message_index INTEGER NOT NULL DEFAULT 0,
      message_count_at_time INTEGER NOT NULL DEFAULT 0,
      compressed_through_message_id INTEGER,
      protected_head_through_message_id INTEGER,
      history_revision INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `)
  for (const s of sessions) db.prepare('INSERT INTO sessions VALUES (?, ?)').run(s.id, s.title)
  return db
}

/** 插一条消息，返回自增 id。 */
export function insertMessage(db: DatabaseSync, sessionId: string, m: FixtureMsg): number {
  const r = db.prepare(
    'INSERT INTO messages (session_id, role, content, display_role, display_content, tool_name, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(sessionId, m.role, m.content, m.displayRole ?? null, m.displayContent ?? null, m.toolName ?? null, 1)
  return Number(r.lastInsertRowid)
}

/** 设/改该会话压缩边界（模拟一次换窗推进）。 */
export function setSnapshot(db: DatabaseSync, sessionId: string, throughMessageId: number | null): void {
  db.prepare(
    `INSERT INTO chat_compression_snapshots (session_id, compressed_through_message_id, history_revision, updated_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(session_id) DO UPDATE SET compressed_through_message_id = excluded.compressed_through_message_id, updated_at = excluded.updated_at`,
  ).run(sessionId, throughMessageId, Date.now())
}
