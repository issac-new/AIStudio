import type { CockpitTask } from '@/custom/cockpit/store/cockpit'

export interface MatrixRoomSearchData {
  roomId: string
  name?: string
  topic?: string
}

export interface SessionSearchResult {
  id: string
  title?: string
  snippet?: string
}

/**
 * 检查单个 kanban 任务是否被关键词命中（title / id / boardSlug / tenant / assignee）。
 */
export function matchLocalTask(t: CockpitTask, q: string): boolean {
  if (!q) return false
  const lq = q.toLowerCase()
  const fields = [
    t.title,
    t.id,
    t.boardSlug,
    t.tenant ?? '',
    t.assignee,
  ]
  return fields.some(f => f.toLowerCase().includes(lq))
}

/**
 * 检查单个 matrix 房间是否命中。命中则返回 roomId，否则返回 null。
 */
export function matchMatrixRoom(room: MatrixRoomSearchData, q: string): string | null {
  if (!q) return null
  const lq = q.toLowerCase()
  const fields = [room.name, room.topic].filter(Boolean) as string[]
  if (fields.some(f => f.toLowerCase().includes(lq))) return room.roomId
  return null
}

/**
 * 从 tenant 字符串提取 session id（格式 session:<sessionId>[@<profile>]:<name>）。
 */
export function extractSessionIdFromTenant(tenant: string): string | null {
  if (!tenant.startsWith('session:')) return null
  const rest = tenant.slice('session:'.length)
  const firstColon = rest.indexOf(':')
  const idPart = firstColon >= 0 ? rest.slice(0, firstColon) : rest
  const atIdx = idPart.indexOf('@')
  return atIdx > 0 ? idPart.slice(0, atIdx) : idPart
}

/**
 * 从 tenant 字符串提取 matrix room id（格式 matrix:<roomId>:<name>，roomId 可含冒号）。
 */
export function extractRoomIdFromTenant(tenant: string): string | null {
  if (!tenant.startsWith('matrix:')) return null
  const rest = tenant.slice('matrix:'.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon < 0) return null
  return rest.slice(0, lastColon)
}

/**
 * 核心：将搜索命中映射回 kanban 任务 id 集合。
 *
 * @param tasks       kanban 全部任务
 * @param matrixRooms 本地 matrix 房间列表
 * @param sessionResults hermes 会话全文检索结果（含 session id）
 * @param q           搜索关键词（非空，已 trim）
 * @returns 入选任务的 id 集合
 */
export function mapSearchToTaskIds(
  tasks: CockpitTask[],
  matrixRooms: MatrixRoomSearchData[],
  sessionResults: SessionSearchResult[],
  q: string,
): Set<string> {
  const result = new Set<string>()

  // ① 直接命中任务
  for (const t of tasks) {
    if (matchLocalTask(t, q)) result.add(t.id)
  }

  // ② matrix 房间命中 → 反查 tenant=matrix:<roomId>:*
  const matchedRoomIds = new Set<string>()
  for (const r of matrixRooms) {
    const roomId = matchMatrixRoom(r, q)
    if (roomId) matchedRoomIds.add(roomId)
  }
  if (matchedRoomIds.size > 0) {
    for (const t of tasks) {
      if (!t.tenant) continue
      const rid = extractRoomIdFromTenant(t.tenant)
      if (rid && matchedRoomIds.has(rid)) result.add(t.id)
    }
  }

  // ③ 会话命中 → 反查 tenant=session:<sessionId>@*:*
  const matchedSessionIds = new Set(sessionResults.map(s => s.id))
  if (matchedSessionIds.size > 0) {
    for (const t of tasks) {
      if (!t.tenant) continue
      const sid = extractSessionIdFromTenant(t.tenant)
      if (sid && matchedSessionIds.has(sid)) result.add(t.id)
    }
  }

  return result
}
