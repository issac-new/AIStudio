// overlay/wsgroups 域：工作区分组管理（dsh-TUI §四 P1 吸收，矩阵 §3.8 dsh P2）。
//
// dsh 语义（工作区分组管理：目录登记台账+会话清单+pin）：多工作区管理不靠记忆——
// **登记台账**（目录注册+标签）、**会话清单**（每工作区的会话数）、**pin**（钉住
// 常用工作区置顶）。纯管理模型：登记/pin/清单视图。
export interface WorkspaceEntry {
  path: string
  label: string
  pinned: boolean
  sessionCount: number
  registeredAt: number
}

export interface WorkspaceGroups {
  /** pinned 置顶（注册序）；其余按最近注册在前。 */
  entries: WorkspaceEntry[]
  totalSessions: number
}

/** 登记/更新（幂等 path；重登记更新 label/会话数，保留 pin 态）。 */
export function registerWorkspace(
  current: readonly WorkspaceEntry[],
  entry: { path: string; label?: string; sessionCount?: number },
  now: number = Date.now(),
): WorkspaceGroups {
  const existing = current.find((e) => e.path === entry.path)
  const next: WorkspaceEntry = existing
    ? { ...existing, label: entry.label ?? existing.label, sessionCount: entry.sessionCount ?? existing.sessionCount }
    : { path: entry.path, label: entry.label ?? entry.path.split('/').pop() ?? entry.path, pinned: false, sessionCount: entry.sessionCount ?? 0, registeredAt: now }
  const entries = existing
    ? current.map((e) => (e.path === entry.path ? next : e))
    : [...current, next]
  return finalizeGroups(entries)
}

/** pin 置顶（toggle）。 */
export function togglePin(current: readonly WorkspaceEntry[], path: string): WorkspaceGroups {
  return finalizeGroups(current.map((e) => (e.path === path ? { ...e, pinned: !e.pinned } : e)))
}

function finalizeGroups(entries: readonly WorkspaceEntry[]): WorkspaceGroups {
  const sorted = [...entries].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1   // pin 置顶
    return b.registeredAt - a.registeredAt                 // 其余最近注册在前
  })
  return { entries: sorted, totalSessions: entries.reduce((s, e) => s + e.sessionCount, 0) }
}
