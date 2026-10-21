// context-trend API 守门（P2）：run 对齐金路径/无消息 fail-soft/db 缺席 fail-soft。
// 夹具复用 compaction-trace.test 的 tmpdir sqlite + RUN_UNDO_DB 注入模式。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Router from '@koa/router'

const dir = mkdtempSync(join(tmpdir(), 'context-trend-'))
const dbFile = join(dir, 'trend.db')
process.env.RUN_UNDO_DB = dbFile

interface CtxShape { params: Record<string, string>; status: number; body: unknown }
async function run(router: Router, path: string): Promise<CtxShape> {
  const full: CtxShape = { params: {}, status: 200, body: undefined }
  const layer = router.stack.find((l) => l.methods.includes('GET') && l.match(path))
  expect(layer, 'route exists').toBeTruthy()
  const parts = path.split('/').filter(Boolean)
  const layerParts = layer!.path.split('/').filter(Boolean)
  layerParts.forEach((seg, i) => { if (seg.startsWith(':')) full.params[seg.slice(1)] = parts[i] ?? '' })
  for (const mw of (layer as unknown as { stack: Array<(c: CtxShape, next?: () => Promise<void>) => Promise<void>> }).stack) {
    await mw(full, async () => {})
  }
  return full
}

beforeAll(() => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(dbFile)
  db.exec(`CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, role TEXT, content TEXT,
    display_role TEXT, display_content TEXT, tool_call_id TEXT, tool_calls TEXT, tool_name TEXT, run_marker TEXT,
    timestamp INTEGER, token_count INTEGER, finish_reason TEXT, reasoning TEXT, reasoning_details TEXT, reasoning_content TEXT)`)
  db.exec(`CREATE TABLE session_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT, run_id TEXT, source TEXT,
    agent TEXT, api_calls INTEGER, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
    cache_write_tokens INTEGER, reasoning_tokens INTEGER, model TEXT, provider TEXT, created_at INTEGER)`)
  db.exec('CREATE TABLE chat_compression_snapshots (session_id TEXT, compressed_through_message_id TEXT, message_count_at_time INTEGER, summary TEXT)')

  // s1：两个 run + usage + 压缩快照（压到消息 2）
  const insMsg = db.prepare('INSERT INTO messages (session_id, role, content, run_marker, token_count) VALUES (?,?,?,?,?)')
  insMsg.run('s1', 'system', 'sys', 'run-a', 100)
  insMsg.run('s1', 'user', 'q', 'run-a', 200)
  insMsg.run('s1', 'assistant', 'a', 'run-a', 300)
  insMsg.run('s1', 'tool', 't', 'run-b', 400)
  insMsg.run('s1', 'assistant', 'a2', 'run-b', 100)
  const insUsage = db.prepare('INSERT INTO session_usage (session_id, run_id, source, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, model, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
  insUsage.run('s1', 'run-a', '', 300, 300, 100, 0, 'm1', 1)
  insUsage.run('s1', 'run-b', '', 700, 100, 0, 0, 'm2', 3)
  db.prepare('INSERT INTO chat_compression_snapshots VALUES (?,?,?,?)').run('s1', '2', 2, 'summ')

  // s2：有消息无 usage 无快照
  insMsg.run('s2', 'user', 'q', null, 10)
  insMsg.run('s2', 'assistant', 'a', null, 20)
  db.close()
})

import router from '../compaction-trace'

describe('GET /api/ide/context-trend/:sessionId', () => {
  it('金路径：run 对齐两柱 + usage 挂柱 + 压缩事件', async () => {
    const res = await run(router as unknown as Router, '/api/ide/context-trend/s1')
    expect(res.status).toBe(200)
    const body = res.body as {
      ok: boolean; available: boolean; usageAligned: string; charsPerToken: number
      steps: Array<{ turn: number; runId: string | null; total: number; usage: { input: number } | null }>
      events: Array<{ kind: string; throughMessageId: number }>
      isEstimate: boolean
    }
    expect(body.ok).toBe(true)
    expect(body.available).toBe(true)
    expect(body.usageAligned).toBe('run') // s1 夹具带 run_marker → run 精确对齐
    expect(body.steps).toHaveLength(2)
    expect(body.steps[0]!.total).toBe(600)
    expect(body.steps[0]!.usage?.input).toBe(300)
    expect(body.events).toEqual([{ kind: 'compaction', throughMessageId: 2, foldedMessages: 2 }])
    expect(body.charsPerToken).toBe(4)
    expect(body.isEstimate).toBe(false)
  })

  it('无 usage/无快照：柱照开，usage null，事件空', async () => {
    const res = await run(router as unknown as Router, '/api/ide/context-trend/s2')
    const body = res.body as { available: boolean; usageAligned: string; steps: Array<{ usage: unknown }>; events: unknown[] }
    expect(body.available).toBe(true)
    expect(body.usageAligned).toBe('order-approx') // s2 无 run_marker → assistant 逐条
    expect(body.steps).toHaveLength(1)
    expect(body.steps[0]!.usage).toBeNull()
    expect(body.events).toEqual([])
  })

  it('无消息：available false 不编造', async () => {
    const res = await run(router as unknown as Router, '/api/ide/context-trend/s-none')
    expect(res.body).toEqual({ ok: true, available: false, reason: 'no-messages' })
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))
