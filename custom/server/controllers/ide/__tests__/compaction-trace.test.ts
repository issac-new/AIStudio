// compaction 留痕卡 API 守门（UI-2 v1：有快照/无快照/表空三态）。
import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Router from '@koa/router'

const dir = mkdtempSync(join(tmpdir(), 'compaction-trace-'))
const dbFile = join(dir, 'trace.db')
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
  db.exec('CREATE TABLE chat_compression_snapshots (session_id TEXT, compressed_through_message_id TEXT, message_count_at_time INTEGER, summary TEXT)')
  db.prepare('INSERT INTO chat_compression_snapshots VALUES (?,?,?,?)').run('s1', 'msg-42', 37, '摘要内容'.repeat(10))
  db.prepare('INSERT INTO chat_compression_snapshots VALUES (?,?,?,?)').run('s2', null, null, null)
  db.close()
})

import router from '../compaction-trace'

describe('GET /api/ide/compaction-trace/:sessionId', () => {
  it('有快照→返回压点/折叠数/摘要规模', async () => {
    const res = await run(router as unknown as Router, '/api/ide/compaction-trace/s1')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      snapshot: { compressedThroughMessageId: 'msg-42', foldedMessages: 37, summaryChars: 40, reason: 'threshold' },
    })
  })
  it('未压缩会话→snapshot null', async () => {
    const res = await run(router as unknown as Router, '/api/ide/compaction-trace/s2')
    expect(res.body).toEqual({ ok: true, snapshot: null })
  })
})
