// fleet API 守门（P3）：三代树金路径/会话不存在 fail-soft。夹具复用 tmpdir sqlite 模式。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Router from '@koa/router'

const dir = mkdtempSync(join(tmpdir(), 'fleet-'))
const dbFile = join(dir, 'fleet.db')
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
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, parent_session_id TEXT, title TEXT, agent TEXT, model TEXT,
    message_count INTEGER, tool_call_count INTEGER, input_tokens INTEGER, output_tokens INTEGER,
    cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER,
    estimated_cost_usd REAL, actual_cost_usd REAL, last_active INTEGER, is_archived INTEGER)`)
  const ins = db.prepare(`INSERT INTO sessions (id, parent_session_id, title, agent, model, message_count, tool_call_count,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, estimated_cost_usd, actual_cost_usd, last_active, is_archived)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  ins.run('root', null, '根会话', 'main', 'm', 5, 2, 100, 0, 0, 0, 0, 1, null, 1, 0)
  ins.run('cur', 'root', '当前会话', 'main', 'm', 3, 1, 200, 0, 0, 0, 0, 2, null, 2, 0)
  ins.run('kid', 'cur', '子会话', 'sub', 'm2', 1, 0, 300, 0, 0, 0, 0, 3, null, 3, 0)
  db.close()
})

import router from '../compaction-trace'

describe('GET /api/ide/fleet/:sessionId', () => {
  it('金路径：父/当前/子女卡 + 子树合计', async () => {
    const res = await run(router as unknown as Router, '/api/ide/fleet/cur')
    expect(res.status).toBe(200)
    const body = res.body as {
      ok: boolean; available: boolean; rootId: string
      parent: { sessionId: string } | null
      current: { sessionId: string; subtreeTokens: number }
      children: Array<{ sessionId: string }>
      totals: { sessions: number; billedTokens: number; costUsd: number }
    }
    expect(body.available).toBe(true)
    expect(body.rootId).toBe('root')
    expect(body.parent!.sessionId).toBe('root')
    expect(body.current.sessionId).toBe('cur')
    expect(body.current.subtreeTokens).toBe(500)
    expect(body.children.map(c => c.sessionId)).toEqual(['kid'])
    expect(body.totals).toEqual({ sessions: 3, billedTokens: 600, costUsd: 6 })
  })

  it('会话不存在 → available false', async () => {
    const res = await run(router as unknown as Router, '/api/ide/fleet/ghost')
    expect(res.body).toEqual({ ok: true, available: false, reason: 'session-not-found' })
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))
