/**
 * 归档推进器（C1 核心）：把会话库压缩边界的变化推进到归档文件面。
 *
 * 扫 chat_compression_snapshots，对每会话：若 compressed_through_message_id
 * 超过 index 记录的上次归档边界 → 读取 (上次边界, 本边界] 区间 messages
 * verbatim → 写 window-<N>.json（编号递增）→ 更新 index。幂等：边界没推进
 * 就无新窗（重复 advance 零动作零写盘）。
 *
 * 首观察语义（已知数据面限制，如实声明）：chat_compression_snapshots 每会话
 * 只留最新一份边界（历史边界被覆盖），首次 advance 看到某会话时无法还原历史
 * 切窗——从会话头（id > 0）到当前边界整体作 window #1（firstObservation 标记
 * 进 boundary，API/UI 如实呈现）。此后的每次边界推进都是精确的单窗增量。
 *
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
    for (const snap of snapshots) {
      try {
        advanceOneSession(db, snap.session_id, snap.compressed_through_message_id, snap.history_revision, result)
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

/** 单会话推进（advanceSessionArchives 内部）：读边界→缺窗补窗→更新 index。 */
function advanceOneSession(
  db: DatabaseSync,
  sessionId: string,
  compressedThrough: number,
  historyRevision: number,
  result: AdvanceResult,
): void {
  const index = readSessionIndex(sessionId)
  const lastArchived = index?.lastArchivedMessageId ?? 0
  if (compressedThrough <= lastArchived) return // 幂等：边界未推进
  const cols = MESSAGE_COLUMNS.join(', ')
  const rows = db.prepare(
    `SELECT ${cols} FROM messages WHERE session_id = ? AND id > ? AND id <= ? ORDER BY id ASC`,
  ).all(sessionId, lastArchived, compressedThrough) as unknown as ArchivedMessageRow[]
  if (rows.length === 0) return // 区间空（边界指向的消息非本会话/已删）：不建空窗
  const titleRow = db.prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as { title: string | null } | undefined
  const windowNumber = (index?.windowCount ?? 0) + 1
  const boundary = {
    fromMessageId: rows[0]!.id,
    toMessageId: rows[rows.length - 1]!.id,
    messageCount: rows.length,
    archivedAt: Date.now(),
    historyRevision,
    compressedThroughMessageId: compressedThrough,
    // 首观察窗：从会话头整体归档（历史边界已被覆盖，无法按次切窗——见文件头注释）
    firstObservation: index === null,
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
  writeSessionIndex(sessionId, {
    session: sessionId,
    windowCount: windowNumber,
    lastArchivedMessageId: compressedThrough,
    windows: [
      ...(index?.windows ?? []),
      { window: windowNumber, ...pickBoundaryLite(boundary) },
    ],
  })
  result.windowsCreated++
  result.sessionsArchived++
  result.windows.push({ session: sessionId, window: windowNumber, messageCount: rows.length })
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
