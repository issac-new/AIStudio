/**
 * IDE compaction 留痕卡数据面（UI 融合 UI-2 v1，dsh 压缩不静默吸收落地）。
 * GET /api/ide/compaction-trace/:sessionId → 压缩快照单点元数据
 *   （压到哪条消息/折叠时消息数/摘要规模）。历史序列 v2（表只存最新快照）。
 * 挂载：patch 484（routes.ts 两行）。
 */
import Router from '@koa/router'
import { existsSync } from 'fs'
import { resolve } from 'path'

const router = new Router({ prefix: '/api/ide' })

router.get('/compaction-trace/:sessionId', (ctx) => {
  const sessionId = String(ctx.params.sessionId ?? '')
  if (!sessionId) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'sessionId 必填' }
    return
  }
  const dbPath = process.env.RUN_UNDO_DB?.trim()
    ? resolve(process.env.RUN_UNDO_DB)
    : resolve(__dirname, '../../../../data/hermes-web-ui.db')
  if (!existsSync(dbPath)) {
    ctx.body = { ok: true, snapshot: null, detail: 'db 不可用' }
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    const row = db.prepare(
      'SELECT compressed_through_message_id, message_count_at_time, summary FROM chat_compression_snapshots WHERE session_id = ?',
    ).get(sessionId) as Record<string, unknown> | undefined
    db.close()
    if (!row || row.compressed_through_message_id == null) {
      ctx.body = { ok: true, snapshot: null }
      return
    }
    ctx.body = {
      ok: true,
      snapshot: {
        compressedThroughMessageId: String(row.compressed_through_message_id),
        foldedMessages: Number(row.message_count_at_time ?? 0),
        summaryChars: typeof row.summary === 'string' ? row.summary.length : 0,
        reason: 'threshold',
      },
    }
  } catch (err) {
    ctx.status = 503
    ctx.body = { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }
  }
})

export default router
