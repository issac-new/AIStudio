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
