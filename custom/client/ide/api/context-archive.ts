// overlay/custom/client/ide/api/context-archive.ts
// 上下文档案面板的 REST 客户端（/api/context-archive/* 与 /api/ctx-notes/*，
// server 见 custom/server/contextarchive/context-archive-controller.ts 与
// custom/server/ctxnotes/ctx-notes-controller.ts）。类型与服务端响应同构。
import { authFetch } from '../utils/auth-fetch'

// ---- 上下文档案（C1/C4） ----

export interface ArchivedSession {
  session: string
  windowCount: number
  lastArchivedMessageId: number
  lastArchivedAt: number
  lastFirstObservation: boolean
}

export interface WindowSummary {
  window: number
  fromMessageId: number
  toMessageId: number
  messageCount: number
  archivedAt: number
  firstObservation: boolean
  /** 机械交接锚点三行（服务端逐窗读文件附带的摘要；读取失败为 null） */
  anchor?: string[] | null
}

export interface ArchivedMessage {
  id: number
  role: string
  content: string
  display_role: string | null
  display_content: string | null
  tool_name: string | null
  timestamp: number
  token_count: number | null
}

export interface WindowDetail {
  session: string
  window: number
  boundary: { fromMessageId: number; toMessageId: number; messageCount: number; archivedAt: number; firstObservation: boolean; compressedThroughMessageId: number }
  anchor: string[]
  messages: ArchivedMessage[]
}

export interface SearchHit {
  window: number
  messageId: number
  role: string
  snippet: string
}

export interface RolloverState {
  lastAdvanceAt: number | null
  sessionsArchived: number
  windowCount: number
  unavailable: string[]
}

// ---- 跨窗工作笔记（C3） ----

export interface CtxNoteView {
  id: string
  text: string
  createdAt: number
  updatedAt: number
  stale: boolean
}

export async function listArchivedSessions(): Promise<{ available: boolean; sessions: ArchivedSession[] }> {
  const res = await authFetch('/api/context-archive/sessions')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function listWindows(session: string): Promise<{ windows: WindowSummary[] }> {
  const res = await authFetch(`/api/context-archive/windows?session=${encodeURIComponent(session)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getWindow(session: string, n: number): Promise<WindowDetail> {
  const res = await authFetch(`/api/context-archive/window?session=${encodeURIComponent(session)}&n=${n}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function searchWindows(session: string, q: string): Promise<SearchHit[]> {
  const res = await authFetch(`/api/context-archive/search?session=${encodeURIComponent(session)}&q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { hits: SearchHit[] }
  return body.hits
}

export async function getRolloverState(): Promise<RolloverState> {
  const res = await authFetch('/api/context-archive/state')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { state: RolloverState }
  return body.state
}

export async function listNotes(session: string): Promise<{ hasNotes: boolean; notes: CtxNoteView[] }> {
  const res = await authFetch(`/api/ctx-notes/?session=${encodeURIComponent(session)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function addNote(session: string, text: string): Promise<CtxNoteView> {
  const res = await authFetch('/api/ctx-notes/', {
    method: 'POST', body: JSON.stringify({ session, text }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { note: CtxNoteView }
  return body.note
}

export async function updateNote(session: string, id: string, text: string): Promise<CtxNoteView> {
  const res = await authFetch(`/api/ctx-notes/${encodeURIComponent(id)}`, {
    method: 'PUT', body: JSON.stringify({ session, text }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { note: CtxNoteView }
  return body.note
}

export async function deleteNote(session: string, id: string): Promise<void> {
  const res = await authFetch(`/api/ctx-notes/${encodeURIComponent(id)}?session=${encodeURIComponent(session)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
