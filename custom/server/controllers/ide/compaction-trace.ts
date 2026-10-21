/**
 * IDE 会话透视数据面。
 * GET /api/ide/compaction-trace/:sessionId → 压缩快照单点元数据
 *   （压到哪条消息/折叠时消息数/摘要规模）。历史序列 v2（表只存最新快照）。
 * GET /api/ide/context-trend/:sessionId → 逐轮组成趋势（context-insights P2，
 *   fold 见 tokens/context-trend.ts；messages+session_usage+快照三源，fail-soft）。
 * 挂载：patch 484（routes.ts 两行）。
 */
import Router from '@koa/router'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { foldContextTrend, type TrendMessage, type TrendUsageRow } from '../../tokens/context-trend'
import { foldFleetTree, type FleetSessionRow } from '../../tokens/fleet-tree'


/** studio db 多候选探测（symlink/物理 __dirname 双形态+cwd 兜底）。 */
function resolveStudioDb(): string {
  const env = process.env.RUN_UNDO_DB?.trim()
  if (env) return resolve(env)
  const candidates = [
    // serve 子进程 cwd 恒=hermes-studio 根（serve-server.mjs spawn cwd）——最可靠锚。
    resolve(process.cwd(), 'packages/server/data/hermes-web-ui.db'),
    resolve(__dirname, '../../../../data/hermes-web-ui.db'),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

const router = new Router({ prefix: '/api/ide' })

router.get('/compaction-trace/:sessionId', (ctx) => {
  const sessionId = String(ctx.params.sessionId ?? '')
  if (!sessionId) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'sessionId 必填' }
    return
  }
  const dbPath = resolveStudioDb()
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

router.get('/context-trend/:sessionId', (ctx) => {
  const sessionId = String(ctx.params.sessionId ?? '')
  if (!sessionId) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'sessionId 必填' }
    return
  }
  const dbPath = resolveStudioDb()
  if (!existsSync(dbPath)) {
    ctx.body = { ok: true, available: false, reason: 'db-unavailable' }
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    const messages = db.prepare(
      'SELECT id, role, content, tool_calls, token_count, reasoning, run_marker FROM messages WHERE session_id = ? ORDER BY id',
    ).all(sessionId) as TrendMessage[]
    if (!messages.length) {
      db.close()
      ctx.body = { ok: true, available: false, reason: 'no-messages' }
      return
    }
    const usageRows = db.prepare(
      `SELECT run_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, model, created_at
       FROM session_usage WHERE session_id = ? AND run_id <> ''`,
    ).all(sessionId) as TrendUsageRow[]
    const snap = db.prepare(
      'SELECT compressed_through_message_id, message_count_at_time FROM chat_compression_snapshots WHERE session_id = ?',
    ).get(sessionId) as Record<string, unknown> | undefined
    db.close()
    const through = Number(snap?.compressed_through_message_id)
    const result = foldContextTrend(messages, usageRows, snap && Number.isFinite(through)
      ? { throughMessageId: through, foldedMessages: Number(snap.message_count_at_time ?? 0) }
      : null)
    ctx.body = {
      ok: true,
      available: true,
      sessionId,
      charsPerToken: 4,
      ...result,
    }
  } catch (err) {
    ctx.status = 503
    ctx.body = { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }
  }
})

router.get('/fleet/:sessionId', (ctx) => {
  const sessionId = String(ctx.params.sessionId ?? '')
  if (!sessionId) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'sessionId 必填' }
    return
  }
  const dbPath = resolveStudioDb()
  if (!existsSync(dbPath)) {
    ctx.body = { ok: true, available: false, reason: 'db-unavailable' }
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    const rows = db.prepare(
      `SELECT id, parent_session_id, title, agent, model, message_count, tool_call_count,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
              estimated_cost_usd, actual_cost_usd, last_active, is_archived
       FROM sessions`,
    ).all() as FleetSessionRow[]
    db.close()
    const fleet = foldFleetTree(rows, sessionId)
    if (!fleet) {
      ctx.body = { ok: true, available: false, reason: 'session-not-found' }
      return
    }
    ctx.body = { ok: true, available: true, sessionId, ...fleet }
  } catch (err) {
    ctx.status = 503
    ctx.body = { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }
  }
})

router.get('/usage-insights/sessions', (ctx) => {
  const dbPath = resolveStudioDb()
  if (!existsSync(dbPath)) {
    ctx.body = { ok: true, available: false, reason: 'db-unavailable' }
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(dbPath, { readOnly: true })
    const rows = db.prepare(
      `SELECT id, title, agent, model, parent_session_id, message_count, tool_call_count,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
              estimated_cost_usd, actual_cost_usd, last_active, is_archived
       FROM sessions ORDER BY last_active DESC LIMIT 12`,
    ).all() as Array<Record<string, unknown>>
    db.close()
    const cards = rows.map(r => {
      const input = Number(r.input_tokens ?? 0)
      const cacheRead = Number(r.cache_read_tokens ?? 0)
      const cacheWrite = Number(r.cache_write_tokens ?? 0)
      const denom = input + cacheRead + cacheWrite
      return {
        sessionId: String(r.id),
        title: typeof r.title === 'string' && r.title ? r.title : String(r.id).slice(0, 12),
        agent: String(r.agent ?? ''),
        model: String(r.model ?? ''),
        hasParent: typeof r.parent_session_id === 'string' && r.parent_session_id !== '',
        messageCount: Number(r.message_count ?? 0),
        toolCallCount: Number(r.tool_call_count ?? 0),
        billedTokens: input + Number(r.output_tokens ?? 0) + cacheRead + cacheWrite,
        cacheHitPercent: denom > 0 ? Math.round((cacheRead / denom) * 100) : null,
        costUsd: typeof r.actual_cost_usd === 'number' ? r.actual_cost_usd : Number(r.estimated_cost_usd ?? 0),
        lastActive: Number(r.last_active ?? 0),
        isArchived: r.is_archived === 1,
      }
    })
    ctx.body = { ok: true, available: true, cards }
  } catch (err) {
    ctx.status = 503
    ctx.body = { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : String(err) }
  }
})

export default router
