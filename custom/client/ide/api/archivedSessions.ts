// overlay/custom/client/ide/api/archivedSessions.ts
// IDE 侧栏归档区数据源：GET /api/studio/sessions/conversations?archived=1
//（server 端为 patch 307 注入的过滤分支；默认行为不变）。
import { request } from '@/api/client'

export interface ArchivedSessionItem {
  id: string
  profile?: string | null
  title: string | null
  /** 秒级时间戳（服务端 Unix epoch 秒） */
  last_active: number
  started_at: number
  workspace?: string | null
  is_archived?: number | boolean
}

export interface FetchArchivedSessionsOptions {
  profile?: string | null
  limit?: number
}

/** 拉取已归档会话（按 last_active 降序由服务端保证；这里再保险排一次） */
export async function fetchArchivedSessions(
  options: FetchArchivedSessionsOptions = {},
): Promise<ArchivedSessionItem[]> {
  const params = new URLSearchParams({ archived: '1' })
  if (options.profile) params.set('profile', options.profile)
  if (options.limit) params.set('limit', String(options.limit))
  const res = await request<{ sessions: ArchivedSessionItem[] }>(
    `/api/studio/sessions/conversations?${params}`,
  )
  return (res.sessions || []).slice().sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
}
