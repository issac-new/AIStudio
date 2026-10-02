/**
 * 跨窗工作笔记存储（C3，DSH dsh-smart-compact ctx_notes 落地）。
 *
 * 压缩换窗后仍保留的人工笔记（写/增/改/删/检索）：旧窗原文已 verbatim 归档可
 * 召回，但"这轮工作到哪了"的主动笔记比机械原文更省召回成本。新鲜度门见
 * ctx-notes-controller（笔记落后于最近归档即 STALE）。
 *
 * 布局：CTX_NOTES_DIR env > ~/.hermes-web-ui/overlay/ctx-notes/<sessionId>.json，
 * { notes: [{ id, text, createdAt, updatedAt }] }，CRUD 全 tmp+rename
 * （archive-store 同款纪律）。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface CtxNote {
  id: string
  text: string
  createdAt: number
  updatedAt: number
}

interface SessionNotesFile {
  session: string
  notes: CtxNote[]
}

/** 笔记根目录（env 可重定向，测试用）。 */
export function ctxNotesDir(): string {
  const env = process.env.CTX_NOTES_DIR?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return resolve(homedir(), '.hermes-web-ui', 'overlay', 'ctx-notes')
}

/** sessionId 路径净化（archive-store safeSessionId 同款）：防路径穿越。 */
function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9._-]/g, '_') || 'unknown'
}

function notesFilePath(sessionId: string): string {
  return join(ctxNotesDir(), `${safeSessionId(sessionId)}.json`)
}

function readNotesFile(sessionId: string): SessionNotesFile {
  try {
    const j = JSON.parse(readFileSync(notesFilePath(sessionId), 'utf8')) as SessionNotesFile
    if (j && Array.isArray(j.notes)) return { session: j.session ?? sessionId, notes: j.notes }
  } catch { /* 无文件/坏文件=空笔记，诚实空态 */ }
  return { session: sessionId, notes: [] }
}

function writeNotesFile(file: SessionNotesFile): void {
  const path = notesFilePath(file.session)
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(file, null, 2))
  renameSync(tmp, path)
}

function newNoteId(): string {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 列表（新→旧；同毫秒创建按后插入在前——Date.now 毫秒粒度下的稳定排序）。 */
export function listNotes(sessionId: string): CtxNote[] {
  return readNotesFile(sessionId).notes
    .map((n, idx) => ({ n, idx }))
    .sort((a, b) => (b.n.createdAt - a.n.createdAt) || (b.idx - a.idx))
    .map((e) => e.n)
}

export function addNote(sessionId: string, text: string): CtxNote {
  const now = Date.now()
  const note: CtxNote = { id: newNoteId(), text, createdAt: now, updatedAt: now }
  const file = readNotesFile(sessionId)
  file.notes.push(note)
  writeNotesFile(file)
  return note
}

/** 改写（updatedAt 前移——新鲜度门按 updatedAt 判）。不存在返回 null。 */
export function updateNote(sessionId: string, id: string, text: string): CtxNote | null {
  const file = readNotesFile(sessionId)
  const note = file.notes.find((n) => n.id === id)
  if (!note) return null
  note.text = text
  note.updatedAt = Date.now()
  writeNotesFile(file)
  return note
}

export function deleteNote(sessionId: string, id: string): boolean {
  const file = readNotesFile(sessionId)
  const before = file.notes.length
  file.notes = file.notes.filter((n) => n.id !== id)
  if (file.notes.length === before) return false
  writeNotesFile(file)
  return true
}

/** substring 大小写不敏感检索（跨条目线性扫，笔记数量级小）。 */
export function searchNotes(sessionId: string, q: string): CtxNote[] {
  const needle = q.toLowerCase()
  return listNotes(sessionId).filter((n) => n.text.toLowerCase().includes(needle))
}

/** 笔记文件存在性（诚实降级信号：hasNotes=false → UI 提示从档案召回）。 */
export function hasNotesFile(sessionId: string): boolean {
  return existsSync(notesFilePath(sessionId)) && readNotesFile(sessionId).notes.length > 0
}
