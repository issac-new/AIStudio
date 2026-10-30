// overlay/custom/client/ide/api/taskWorkspace.ts
// 任务 workspace 解析客户端（Ycode 工作区↔kanban 任务关联轮，2026-10-18）。
// server 侧 patch 658：GET /api/ide/task-workspace?task=<id>&board=<slug>——
// task.workspace_path 可能是绝对路径或相对板 workspaces 根的路径，根目录是
// 服务端约定，客户端不拼；materialized=false（scratch 未派发/已完成回收）
// 如实呈现，调用侧不切换工作区只展示。
import { request } from '@/api/client'

export interface TaskWorkspaceInfo {
  taskId: string
  board: string
  kind: string | null
  path: string | null
  materialized: boolean
  branch: string | null
  status: string | null
  note: 'ok' | 'predicted_scratch' | 'no_workspace' | 'escape_refused'
}

export const ideTaskWorkspaceApi = {
  get(taskId: string, board?: string): Promise<TaskWorkspaceInfo> {
    const q = new URLSearchParams({ task: taskId })
    if (board && board !== 'default') q.set('board', board)
    return request(`/api/ide/task-workspace?${q.toString()}`)
  },
}

// ── 任务工作区文件树（只读兜底视图）──
// 复用上游既有端点 GET /api/hermes/kanban/workspace-files（无需新增后端契约）：
// 按 task_id 解析 workspace_path 并列出目录树，路径被沙箱限定在任务工作区内。
// 与 /api/studio/files/list 的差别：后者带 root 参数要求 super_admin，本端点
// 只认任务工作区，普通用户也能只读浏览自己的任务目录。
export interface TaskWorkspaceFileEntry {
  name: string
  isDir: boolean
  size: number
  modified: number
  children?: TaskWorkspaceFileEntry[]
}

export interface TaskWorkspaceFileList {
  /** 服务端返回的相对路径（''=任务工作区根）。 */
  path: string
  entries: TaskWorkspaceFileEntry[]
}

export const ideTaskFilesApi = {
  list(taskId: string, board?: string, depth = 2): Promise<TaskWorkspaceFileList> {
    const q = new URLSearchParams({ task_id: taskId, depth: String(depth) })
    if (board) q.set('board', board)
    return request(`/api/hermes/kanban/workspace-files?${q.toString()}`)
  },
}
