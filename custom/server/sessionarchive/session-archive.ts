// overlay/sessionarchive 域：会话搜索/归档（minimax §六 C 表 P2 吸收，矩阵 §3.4 P2）。
//
// minimax 语义（会话搜索/归档/重命名：Recent/Archived × workspace/all 筛选）：
// 会话管理两轴筛选——**时间轴**（Recent 最近 / Archived 已归档）× **范围轴**
// （workspace 本工作区 / all 全部）。搜索=标题/摘要子串过滤。纯筛选模型。
export type TimeAxis = 'recent' | 'archived'
export type ScopeAxis = 'workspace' | 'all'

export interface SessionEntry {
  sessionId: string
  title: string
  summary: string
  workspacePath: string
  archived: boolean
  lastActiveAt: number
}

export interface SessionFilter {
  time: TimeAxis
  scope: ScopeAxis
  /** 子串搜索（标题/摘要）；空=不过滤。 */
  query?: string
  workspacePath?: string
  /** recent 截止（默认 7 天内）。 */
  recentDays?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 两轴筛选+搜索（minimax 语义；recent=7 天内未归档，archived=归档档）。 */
export function filterSessions(sessions: readonly SessionEntry[], filter: SessionFilter, now: number = Date.now()): SessionEntry[] {
  const recentDays = filter.recentDays ?? 7
  return sessions.filter((s) => {
    // 时间轴
    if (filter.time === 'recent') {
      if (s.archived || now - s.lastActiveAt > recentDays * DAY_MS) return false
    } else if (!s.archived) {
      return false
    }
    // 范围轴
    if (filter.scope === 'workspace' && s.workspacePath !== filter.workspacePath) return false
    // 子串搜索
    if (filter.query) {
      const q = filter.query.toLowerCase()
      if (!s.title.toLowerCase().includes(q) && !s.summary.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => b.lastActiveAt - a.lastActiveAt)  // 新在前
}
