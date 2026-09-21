// overlay/custom/client/ide/utils/sessionBuckets.ts
// 会话三段分桶（用户截图理念「进行中 / 已完成 / 工作空间」落地）。
// 与既有 organize（分组/项目/时间线）正交：bucket 先分桶，桶内再按当前 organize 排。
// 状态推导（诚实口径，全部可从 Session 现有字段推导）：
//   active（进行中）= 正在流式 || 非归档且最近活跃 ≤ ACTIVE_WINDOW（默认 24h）
//   done（已完成）  = 非归档且非 active（含从未活跃的老会话；归档区另在底部，不进桶）
// workspace（工作空间）= 不按状态分，改按 workspace 分桶（与 organize='project' 同族，
//   但作为独立视图入口，弱化 organize 概念、强化「工作空间」一词）。
import type { Session } from '@/stores/hermes/chat'

export type SessionBucket = 'active' | 'done' | 'workspace'

export const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000

export interface BucketedSessions {
  active: Session[]
  done: Session[]
  byWorkspace: Array<{ workspace: string; sessions: Session[] }>
}

function isLive(s: Session): boolean {
  return Boolean((s as { isStreaming?: boolean }).isStreaming)
}

export function isActiveSession(s: Session, nowMs: number): boolean {
  if (s.isArchived) return false
  if (isLive(s)) return true
  const last = s.lastActiveAt ?? s.updatedAt ?? s.createdAt ?? 0
  return last > 0 && nowMs - last <= ACTIVE_WINDOW_MS
}

export function bucketSessions(sessions: Session[], nowMs: number): BucketedSessions {
  const active: Session[] = []
  const done: Session[] = []
  const byWorkspaceMap = new Map<string, Session[]>()
  for (const s of sessions) {
    if (s.isArchived) continue
    if (isActiveSession(s, nowMs)) active.push(s)
    else done.push(s)
    const key = (s.workspace || '').trim()
    const list = byWorkspaceMap.get(key) ?? []
    list.push(s)
    byWorkspaceMap.set(key, list)
  }
  const byUpdated = (a: Session, b: Session) => (b.updatedAt || 0) - (a.updatedAt || 0)
  active.sort(byUpdated)
  done.sort(byUpdated)
  const byWorkspace = [...byWorkspaceMap.entries()]
    .map(([workspace, list]) => ({ workspace, sessions: list.slice().sort(byUpdated) }))
    .sort((a, b) => (b.sessions[0]?.updatedAt || 0) - (a.sessions[0]?.updatedAt || 0))
  return { active, done, byWorkspace }
}
