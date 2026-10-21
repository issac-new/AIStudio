// usage-insights 会话卡端点守门（P4）：金路径投影/空库/字段口径（命中率分母含 cacheWrite）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Router from '@koa/router'

const dir = mkdtempSync(join(tmpdir(), 'usage-insights-'))
const dbFile = join(dir, 'ui.db')
process.env.RUN_UNDO_DB = dbFile

interface CtxShape { params: Record<string, string>; status: number; body: unknown }
async function run(router: Router, path: string): Promise<CtxShape> {
  const full: CtxShape = { params: {}, status: 200, body: undefined }
  const layer = router.stack.find((l) => l.methods.includes('GET') && l.match(path))
  expect(layer, 'route exists').toBeTruthy()
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
  // 命中率 = 300/(300+300+0)=50%；计费=300+100+300+0=700
  ins.run('a', null, 'A', 'main', 'm', 3, 2, 300, 100, 300, 0, 0, 1, null, 2, 0)
  ins.run('b', 'a', null, 'sub', 'm2', 1, 0, 0, 0, 0, 0, 0, 0.5, 9, 1, 1)
  db.close()
})

import router from '../compaction-trace'

describe('GET /api/ide/usage-insights/sessions', () => {
  it('金路径：按 last_active 倒序，命中率/计费/成本/父子/归档口径', async () => {
    const res = await run(router as unknown as Router, '/api/ide/usage-insights/sessions')
    expect(res.status).toBe(200)
    const body = res.body as { ok: boolean; available: boolean; cards: Array<Record<string, unknown>> }
    expect(body.available).toBe(true)
    expect(body.cards.map(c => c.sessionId)).toEqual(['a', 'b'])
    expect(body.cards[0]).toMatchObject({
      title: 'A', billedTokens: 700, cacheHitPercent: 50, costUsd: 1, hasParent: false, isArchived: false,
    })
    // 无 title 用 id 截断；actual 9 优先于 estimated 0.5；归档/子标记
    expect(body.cards[1]).toMatchObject({ title: 'b', costUsd: 9, hasParent: true, isArchived: true, cacheHitPercent: null })
  })
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))
