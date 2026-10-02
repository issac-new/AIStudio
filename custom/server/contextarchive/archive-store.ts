/**
 * 上下文无损滚存——归档文件库（C1，DSH dsh-smart-compact「旧窗原文 verbatim 归档」落地）。
 *
 * 反「摘要幻觉」路线：压缩换窗发生时，旧窗 messages 原行逐字段 verbatim 落盘
 * （零摘要模型调用，100% 无损，随时可召回）。数据源是会话库
 * packages/server/data/hermes-web-ui.db 的 chat_compression_snapshots 压缩边界，
 * 本模块只负责文件面读写；边界推进逻辑见 advance.ts。
 *
 * 目录布局（CONTEXT_ARCHIVE_DIR env > ~/.hermes-web-ui/overlay/context-archive/）：
 *   <sessionId>/window-<N>.json  单窗全文（boundary + anchor + messages 逐行 verbatim）
 *   <sessionId>/index.json       该会话归档进度（已归档到哪条 message id / 窗计数）
 *   state.json                   换窗可观测性（rollover-state.ts 写，引擎探针对等物）
 *
 * 写入纪律：一切写走 tmp+rename（board-graph 先例）；读 fail-soft（坏文件跳过/空返回，
 * 不抛——桌面工具读旁路数据崩主流程不可接受）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** messages 表 verbatim 行（列清单=schemas.ts MESSAGES_SCHEMA 全列，逐字段保真，
 * 不做任何摘要/截断——红线）。 */
export interface ArchivedMessageRow {
  id: number
  session_id: string
  role: string
  content: string
  display_role: string | null
  display_content: string | null
  tool_call_id: string | null
  tool_calls: string | null
  tool_name: string | null
  run_marker: string | null
  timestamp: number
  token_count: number | null
  finish_reason: string | null
  reasoning: string | null
  reasoning_details: string | null
  reasoning_content: string | null
}

/** advance.ts 里 SELECT messages 用的显式列清单（与 ArchivedMessageRow 一一对应，
 * 不用 SELECT *：列集合固定才谈得上逐字段 verbatim 断言）。 */
export const MESSAGE_COLUMNS = [
  'id', 'session_id', 'role', 'content', 'display_role', 'display_content',
  'tool_call_id', 'tool_calls', 'tool_name', 'run_marker', 'timestamp',
  'token_count', 'finish_reason', 'reasoning', 'reasoning_details', 'reasoning_content',
] as const

/** 单窗压缩边界（全为机械事实，无模型产物）。 */
export interface WindowBoundary {
  fromMessageId: number
  toMessageId: number
  messageCount: number
  archivedAt: number
  historyRevision: number
  compressedThroughMessageId: number
  /** 首观察窗：advance 首次看到该会话时，从会话头到当前边界整体作 window #1。
   * 已知数据面限制——chat_compression_snapshots 每会话只留最新一份边界，历史
   * 边界被覆盖，无法按次切多窗；此标记让 API/UI 如实呈现首窗语义。 */
  firstObservation: boolean
}

/** window-<N>.json 文件体。 */
export interface ContextWindowFile {
  session: string
  window: number
  boundary: WindowBoundary
  /** 机械交接锚点（C2，三行字符串，已脱敏）。 */
  anchor: string[]
  /** 窗内 messages 逐行 verbatim（messages 表原行，与库行逐字段相等）。 */
  messages: ArchivedMessageRow[]
}

/** index.json 文件体（每会话归档进度）。 */
export interface SessionArchiveIndex {
  session: string
  windowCount: number
  /** 已归档到的 message id（含）。下次 advance 从它之后继续。 */
  lastArchivedMessageId: number
  windows: Array<{
    window: number
    fromMessageId: number
    toMessageId: number
    messageCount: number
    archivedAt: number
    firstObservation: boolean
  }>
}

/** 归档根目录（env 可重定向，测试用）。 */
export function contextArchiveDir(): string {
  const env = process.env.CONTEXT_ARCHIVE_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return resolve(homedir(), '.hermes-web-ui', 'overlay', 'context-archive')
}

/** sessionId 路径净化（board-graph boardKgPath 同款）：防路径穿越，异 id 撞同
 * 净化名的概率对本域（uuid 形态会话 id）可忽略。 */
export function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9._-]/g, '_') || 'unknown'
}

function sessionDir(sessionId: string): string {
  return join(contextArchiveDir(), safeSessionId(sessionId))
}

function windowFilePath(sessionId: string, n: number): string {
  return join(sessionDir(sessionId), `window-${n}.json`)
}

function indexPath(sessionId: string): string {
  return join(sessionDir(sessionId), 'index.json')
}

/** tmp+rename 写 JSON（board-graph writeMarker 同款纪律）。 */
function writeJsonAtomic(file: string, data: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return null
  }
}

/** 归档目录内原子写 JSON（rollover-state 写 state.json 复用同款 tmp+rename 纪律，
 * 写纪律单一入口）。 */
export function writeArchiveJson(relPath: string, data: unknown): void {
  writeJsonAtomic(join(contextArchiveDir(), relPath), data)
}

/** 归档目录内 fail-soft 读 JSON（rollover-state 读 state.json 用）。 */
export function readArchiveJson<T>(relPath: string): T | null {
  return readJson<T>(join(contextArchiveDir(), relPath))
}

// ---- 写面（advance.ts 调用） ----

export function readSessionIndex(sessionId: string): SessionArchiveIndex | null {
  if (!existsSync(indexPath(sessionId))) return null
  const idx = readJson<SessionArchiveIndex>(indexPath(sessionId))
  return idx && typeof idx.windowCount === 'number' ? idx : null
}

export function writeSessionIndex(sessionId: string, index: SessionArchiveIndex): void {
  writeJsonAtomic(indexPath(sessionId), index)
}

export function writeWindowFile(file: ContextWindowFile): void {
  writeJsonAtomic(windowFilePath(file.session, file.window), file)
}

// ---- 读面（控制器调用，全 fail-soft） ----

export function readWindowFile(sessionId: string, n: number): ContextWindowFile | null {
  const f = readJson<ContextWindowFile>(windowFilePath(sessionId, n))
  return f && f.session === sessionId && f.window === n ? f : null
}

export interface ArchivedSessionSummary {
  session: string
  windowCount: number
  lastArchivedMessageId: number
  lastArchivedAt: number
  lastFirstObservation: boolean
}

/** 有归档的会话列表（扫目录读 index，坏目录跳过）。 */
export function listArchivedSessions(): ArchivedSessionSummary[] {
  const root = contextArchiveDir()
  if (!existsSync(root)) return []
  const out: ArchivedSessionSummary[] = []
  let entries: string[] = []
  try {
    entries = readdirSync(root)
  } catch {
    return []
  }
  for (const name of entries) {
    // 目录名是净化后的 sessionId——index 里存原样 session 字段（净化不改字符集内的 id 原文）
    const idx = readJson<SessionArchiveIndex>(join(root, name, 'index.json'))
    if (!idx || typeof idx.windowCount !== 'number') continue
    const lastWin = idx.windows[idx.windows.length - 1]
    out.push({
      session: idx.session ?? name,
      windowCount: idx.windowCount,
      lastArchivedMessageId: idx.lastArchivedMessageId ?? 0,
      lastArchivedAt: lastWin?.archivedAt ?? 0,
      lastFirstObservation: lastWin?.firstObservation ?? false,
    })
  }
  out.sort((a, b) => b.lastArchivedAt - a.lastArchivedAt)
  return out
}

/** 该会话最近一次归档时间（ctxnotes 新鲜度门用；无归档返回 null=笔记不可能 stale）。 */
export function lastArchiveTime(sessionId: string): number | null {
  const idx = readSessionIndex(sessionId)
  if (!idx || !idx.windows.length) return null
  return Math.max(...idx.windows.map((w) => w.archivedAt))
}

export interface WindowHit {
  window: number
  messageId: number
  role: string
  snippet: string
}

/** 跨窗 substring 检索（大小写不敏感；命中 content/display_content，前后各 40 字符
 * snippet；role 过滤可选）。跨窗逐文件线性扫——桌面单会话窗数量级（个位数~几十）够用，
 * 不引入索引。 */
export function searchSessionWindows(sessionId: string, q: string, role?: string): WindowHit[] {
  const needle = q.toLowerCase()
  const roleWant = role?.trim().toLowerCase() ?? ''
  const idx = readSessionIndex(sessionId)
  if (!idx) return []
  const hits: WindowHit[] = []
  for (const w of idx.windows) {
    const file = readWindowFile(sessionId, w.window)
    if (!file) continue
    for (const m of file.messages) {
      if (roleWant && m.role.toLowerCase() !== roleWant) continue
      const haystacks = [m.content, m.display_content ?? '']
      for (const text of haystacks) {
        const at = text.toLowerCase().indexOf(needle)
        if (at >= 0) {
          hits.push({
            window: w.window,
            messageId: m.id,
            role: m.role,
            snippet: text.slice(Math.max(0, at - 40), at + needle.length + 40),
          })
          break // 同一条消息 content/display_content 双命中只记一次
        }
      }
    }
  }
  return hits
}
