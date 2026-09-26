// overlay/custom/client/ide/api/runs.ts
// 轮级 workspace 变更 REST 客户端（R3：任务结果卡 + per-turn 变更卡数据源）。
// 复用 upstream 既有 fetchWorkspaceRunChangesForSession（workspace_run_changes
// 表；hermes 在 agent 每轮工具写盘后落一行）。R3 只做聚合展示，零新写。
import {
  fetchWorkspaceRunChangesForSession,
  type WorkspaceRunChangeSummary,
} from '@/api/studio/sessions'

export interface RunChangesDigest {
  runId: string
  changeId: string
  fileCount: number
  additions: number
  deletions: number
  files: Array<{ id: number; changeId: string; path: string; additions: number; deletions: number; changeType: string }>
}

/** 将 upstream 按 run 聚合的 summary 摊平为结果卡 digest（新→旧排序）。
 *  契约注意：fetchWorkspaceRunChangesForSession 返回 WorkspaceRunChangeSummary[]——
 *  每 run 一项，自身携带 run 级汇总（files_changed/additions/deletions）与 files
 *  子数组，不是扁平文件行；排序按 finished_at 降序（run_id 字典序会有 run-10 <
 *  run-9 的错序）。 */
export function digestRunChanges(summaries: WorkspaceRunChangeSummary[]): RunChangesDigest[] {
  return summaries
    .map((s) => ({
      runId: s.run_id || s.change_id || 'unknown',
      changeId: s.change_id,
      fileCount: s.files_changed ?? s.files?.length ?? 0,
      additions: s.additions ?? 0,
      deletions: s.deletions ?? 0,
      files: (s.files ?? []).map((f) => ({
        id: f.id,
        changeId: f.change_id,
        path: f.path,
        additions: f.additions ?? 0,
        deletions: f.deletions ?? 0,
        changeType: f.change_type,
      })),
      sortKey: s.finished_at ?? s.started_at ?? s.created_at ?? 0,
    }))
    .sort((a, b) => b.sortKey - a.sortKey || (a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0))
    .map(({ sortKey: _sortKey, ...digest }) => digest)
}

export const ideRunsApi = {
  async changes(sessionId: string): Promise<WorkspaceRunChangeSummary[]> {
    return fetchWorkspaceRunChangesForSession(sessionId)
  },

  /** 逐文件 Undo（UI-5）：反向应用该文件本轮 patch，恢复到 run 前内容。 */
  async undo(input: { sessionId: string; changeId: string; fileId: number; workspace: string }): Promise<{ ok: boolean; restoredPath?: string; detail?: string }> {
    const res = await fetch('/api/ide/run-undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; restoredPath?: string; detail?: string }
    if (!res.ok) throw new Error(body.detail || `run-undo ${res.status}`)
    return body as { ok: boolean; restoredPath?: string }
  },
}
