import { request } from '@/api/client'

/** kanban 端点无封装，参考 KanbanTaskDrawer.vue:104-106 自建 */
export interface SessionSearchResult {
  id: string
  title?: string
  [k: string]: unknown
}

export async function searchSessions(taskId: string, profile: string): Promise<SessionSearchResult[]> {
  const q = new URLSearchParams({ task_id: taskId, profile })
  const res = await request<{ results: SessionSearchResult[] }>(
    `/api/hermes/kanban/search-sessions?${q}`,
  )
  return res.results ?? []
}

// ── workspace-files（patch 078）──
interface RawFileEntry {
  name: string
  isDir: boolean
  size: number
  modified: number
  children?: RawFileEntry[]
}
export interface FileNode {
  id: string       // 相对根的路径
  name: string
  isDir: boolean
  size: number
  modified: number
  children?: FileNode[]
}

function mapEntries(entries: RawFileEntry[], parentPath: string): FileNode[] {
  return entries.map(e => {
    const id = parentPath ? `${parentPath}/${e.name}` : e.name
    const node: FileNode = { id, name: e.name, isDir: e.isDir, size: e.size ?? 0, modified: e.modified ?? 0 }
    if (e.isDir && e.children) node.children = mapEntries(e.children, id)
    return node
  })
}

export async function listWorkspaceFiles(taskId: string, board?: string, sub = '', depth = 2): Promise<FileNode[]> {
  const q = new URLSearchParams({ task_id: taskId, depth: String(depth) })
  if (sub) q.set('path', sub)
  if (board) q.set('board', board)
  const res = await request<{ path: string; entries: RawFileEntry[] }>(
    `/api/hermes/kanban/workspace-files?${q}`,
  )
  return mapEntries(res.entries ?? [], sub)
}

// ── timeline 聚合（patch 079）──
export interface TimelineItem {
  source: 'event' | 'comment'
  id: string
  taskId: string
  taskTitle: string
  taskArchived: boolean
  ts: number
  kind?: string
  payload?: Record<string, unknown> | null
  author?: string
  body?: string
}

export async function getTimeline(opts: { limit?: number; since?: number } = {}): Promise<{ items: TimelineItem[]; total: number }> {
  const q = new URLSearchParams()
  if (opts.limit != null) q.set('limit', String(opts.limit))
  if (opts.since != null) q.set('since', String(opts.since))
  const qs = q.toString()
  const path = `/api/hermes/kanban/timeline${qs ? `?${qs}` : ''}`
  return request<{ items: TimelineItem[]; total: number }>(path)
}
