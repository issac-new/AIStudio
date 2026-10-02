/**
 * 归档推进器（C1 核心）：把会话库压缩边界的变化推进到归档文件面。
 *
 * 边界源两档（遗留④根治 2026-10-03）：
 * 1) 边界史表 chat_compression_boundary_history（patch 546 起，压缩保存时追加式
 *    记录每一次边界）在档 → 按 (上次边界, b1] (b1, b2] … 逐次精确切窗——即使两次
 *    advance 之间发生了多次压缩也一窗不并；
 * 2) 史表缺席（patch 546 之前的库/未注入环境）→ 回落旧语义：扫 chat_compression_
 *    snapshots 主表（每会话只留最新边界，历史被覆盖），单窗推进。
 *
 * 首观察语义（残余数据面限制，如实声明）：patch 546 部署前的历史边界本就未记档，
 * 首次 advance 看到某会话仍只能从会话头到（最早的已知边界）整体作 window #1
 * （firstObservation 标记进 boundary，API/UI 如实呈现）。部署后的每次压缩都精确可切。
 *
 * 幂等：边界没推进就无新窗（重复 advance 零动作零写盘）。
 * 会话库只读打开（readOnly: true，红线）；库缺席/表缺席 → available:false
 * 不抛（fail-soft，桌面工具读旁路数据不崩主流程）。
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  MESSAGE_COLUMNS, readSessionIndex, writeSessionIndex, writeWindowFile,
  type ArchivedMessageRow, type ContextWindowFile,
} from './archive-store'
import { buildHandoffAnchor } from './anchor'
import { redactAnchorLines } from './redact'
import { recordAdvance, type AdvanceResult } from './rollover-state'

/** studio db 多候选探测——照抄 custom/server/controllers/ide/compaction-trace.ts:12-21
 * （该函数未导出无法复用，逐行照抄并注明出处）：env RUN_UNDO_DB > serve 子进程
 * cwd 锚 > __dirname 兜底。 */
export function resolveStudioDb(): string {
  const env = process.env.RUN_UNDO_DB?.trim()
  if (env) return resolve(env)
  const candidates = [
    // serve 子进程 cwd 恒=hermes-studio 根（serve-server.mjs spawn cwd）——最可靠锚。
    resolve(process.cwd(), 'packages/server/data/hermes-web-ui.db'),
    resolve(__dirname, '../../../../data/hermes-web-ui.db'),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

async function openReadonly(dbPath: string): Promise<DatabaseSync> {
  const { DatabaseSync } = await import('node:sqlite')
  return new DatabaseSync(dbPath, { open: true, readOnly: true })
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name) as { name: string } | undefined
  return row !== undefined
}

/**
 * 推进所有会话的归档。dbPath 可显式传入（测试 fixture）；缺省走 resolveStudioDb。
 * 任何一步失败都收敛成结构化结果（不抛）——调用方是 HTTP 控制器。
 */
export async function advanceSessionArchives(dbPath?: string): Promise<AdvanceResult> {
  const result: AdvanceResult = {
    available: true, reasons: [], sessionsScanned: 0,
    sessionsArchived: 0, windowsCreated: 0, windows: [],
  }
  const path = dbPath ?? resolveStudioDb()
  if (!existsSync(path)) {
    result.available = false
    result.reasons.push(`db_missing:${path}`)
    recordAdvance(result)
    return result
  }
  let db: DatabaseSync | undefined
  try {
    db = await openReadonly(path)
    // 三表前置检查：sessions/messages/chat_compression_snapshots 任一缺席→
    // available:false（老库/异构库不硬扫）。
    for (const t of ['sessions', 'messages', 'chat_compression_snapshots']) {
      if (!tableExists(db, t)) result.reasons.push(`table_missing:${t}`)
    }
    if (result.reasons.length > 0) {
      result.available = false
      recordAdvance(result)
      return result
    }
    const snapshots = db.prepare(
      'SELECT session_id, compressed_through_message_id, history_revision FROM chat_compression_snapshots WHERE compressed_through_message_id IS NOT NULL',
    ).all() as Array<{ session_id: string; compressed_through_message_id: number; history_revision: number }>
    result.sessionsScanned = snapshots.length
    // 边界史表在档 → 按次切窗（遗留④）；缺席 → 主表单窗回落（旧语义）
    const useHistory = tableExists(db, 'chat_compression_boundary_history')
    for (const snap of snapshots) {
      try {
        advanceOneSession(db, snap.session_id, snap.compressed_through_message_id, snap.history_revision, result, useHistory)
      } catch (err) {
        // 单会话失败不拖垮整轮（fail-soft），但原因入列可观测
        result.reasons.push(`session_error:${snap.session_id}:${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } catch (err) {
    result.available = false
    result.reasons.push(`db_error:${err instanceof Error ? err.message : String(err)}`)
  } finally {
    try { db?.close() } catch { /* 已关 */ }
  }
  recordAdvance(result)
  return result
}

/** 单会话推进（advanceSessionArchives 内部）：读边界序列→逐窗补齐→更新 index。 */
function advanceOneSession(
  db: DatabaseSync,
  sessionId: string,
  compressedThrough: number,
  historyRevision: number,
  result: AdvanceResult,
  useHistory: boolean,
): void {
  const index = readSessionIndex(sessionId)
  const lastArchived = index?.lastArchivedMessageId ?? 0
  // 边界序列：史表逐次边界（>lastArchived）优先；主表边界兜底追加（史表落后主表
  // 的防御路径——理论上 546 后每次压缩都追加，仍不丢消息为准）
  const boundaries: Array<{ to: number; source: 'history' | 'snapshot' }> = []
  if (useHistory) {
    try {
      const rows = db.prepare(
        'SELECT boundary_message_id FROM chat_compression_boundary_history WHERE session_id = ? AND boundary_message_id > ? ORDER BY id ASC',
      ).all(sessionId, lastArchived) as Array<{ boundary_message_id: number }>
      for (const r of rows) boundaries.push({ to: Number(r.boundary_message_id), source: 'history' })
    } catch { /* 史表读失败 → 回落主表单窗 */ }
  }
  if (compressedThrough > (boundaries[boundaries.length - 1]?.to ?? 0)) {
    boundaries.push({ to: compressedThrough, source: 'snapshot' })
  }
  if (boundaries.length === 0) return // 幂等：边界未推进

  const cols = MESSAGE_COLUMNS.join(', ')
  const titleRow = db.prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as { title: string | null } | undefined
  let cursor = lastArchived
  let windowNumber = index?.windowCount ?? 0
  let firstOfRun = index === null  // 本轮首窗若也是会话首档 → firstObservation
  const windowsLite: Array<{ window: number; fromMessageId: number; toMessageId: number; messageCount: number; archivedAt: number; firstObservation: boolean }> = []
  for (const b of boundaries) {
    if (b.to <= cursor) continue
    const rows = db.prepare(
      `SELECT ${cols} FROM messages WHERE session_id = ? AND id > ? AND id <= ? ORDER BY id ASC`,
    ).all(sessionId, cursor, b.to) as unknown as ArchivedMessageRow[]
    cursor = b.to // 空区间也推进游标（边界推进了，即使区间无消息也不反复重扫）
    if (rows.length === 0) continue // 不建空窗
    windowNumber += 1
    const boundary = {
      fromMessageId: rows[0]!.id,
      toMessageId: rows[rows.length - 1]!.id,
      messageCount: rows.length,
      archivedAt: Date.now(),
      historyRevision,
      compressedThroughMessageId: b.to,
      // 首观察窗：从会话头整体归档（部署前历史边界未记档，无法按次切窗——见文件头注释）
      firstObservation: firstOfRun,
      // 边界源（遗留④）：history=史表逐次精确切窗；snapshot=主表单窗（含部署前语义）
      boundarySource: b.source,
    }
    const windowFile: ContextWindowFile = {
      session: sessionId,
      window: windowNumber,
      boundary,
      // 锚点行一律脱敏（保守策略，见 redact.ts 文件头）
      anchor: redactAnchorLines(buildHandoffAnchor({ windowNumber, sessionTitle: titleRow?.title ?? null, messages: rows })),
      messages: rows,
    }
    writeWindowFile(windowFile)
    windowsLite.push({ window: windowNumber, ...pickBoundaryLite(boundary) })
    result.windowsCreated++
    result.windows.push({ session: sessionId, window: windowNumber, messageCount: rows.length })
    firstOfRun = false
  }
  if (cursor > lastArchived) {
    writeSessionIndex(sessionId, {
      session: sessionId,
      windowCount: windowNumber,
      lastArchivedMessageId: cursor,
      windows: [...(index?.windows ?? []), ...windowsLite],
    })
    result.sessionsArchived++
  }
}

/** index.windows 条目瘦身（boundary 里 archivedAt/historyRevision 等保留摘要字段）。 */
function pickBoundaryLite(b: { fromMessageId: number; toMessageId: number; messageCount: number; archivedAt: number; firstObservation: boolean }): {
  fromMessageId: number; toMessageId: number; messageCount: number; archivedAt: number; firstObservation: boolean
} {
  return {
    fromMessageId: b.fromMessageId, toMessageId: b.toMessageId,
    messageCount: b.messageCount, archivedAt: b.archivedAt, firstObservation: b.firstObservation,
  }
}
