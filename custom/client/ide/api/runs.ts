// overlay/custom/client/ide/api/runs.ts
// 轮级 workspace 变更 REST 客户端（R3：任务结果卡 + per-turn 变更卡数据源）。
// 复用 upstream 既有 fetchWorkspaceRunChangesForSession（workspace_run_changes
// 表；hermes 在 agent 每轮工具写盘后落一行）。R3 只做聚合展示，零新写。
import {
  fetchWorkspaceRunChangesForSession,
  type WorkspaceRunChangeFileSummary,
} from '@/api/studio/sessions'

export interface RunChangesDigest {
  runId: string
  fileCount: number
  additions: number
  deletions: number
  files: Array<{ path: string; additions: number; deletions: number; changeType: string }>
}

/** 按 run_id 聚合成结果卡可用的 digest（新→旧排序） */
export function digestRunChanges(rows: WorkspaceRunChangeFileSummary[]): RunChangesDigest[] {
  const byRun = new Map<string, RunChangesDigest>()
  for (const row of rows) {
    const key = row.change_id || 'unknown'
    let digest = byRun.get(key)
    if (!digest) {
      digest = { runId: key, fileCount: 0, additions: 0, deletions: 0, files: [] }
      byRun.set(key, digest)
    }
    digest.fileCount += 1
    digest.additions += row.additions ?? 0
    digest.deletions += row.deletions ?? 0
    digest.files.push({
      path: row.path,
      additions: row.additions ?? 0,
      deletions: row.deletions ?? 0,
      changeType: row.change_type,
    })
  }
  return [...byRun.values()].sort((a, b) => b.runId.localeCompare(a.runId))
}

export const ideRunsApi = {
  async changes(sessionId: string): Promise<WorkspaceRunChangeFileSummary[]> {
    return fetchWorkspaceRunChangesForSession(sessionId)
  },
}
