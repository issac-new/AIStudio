// overlay/custom/client/ide/api/worktree.ts
// worktree 编排客户端（R5，codex-product + Qoder 任务级隔离语义）。
// server 侧 patch 348：POST /api/ide/worktree/{create,remove}（loop
// WorktreeManager detached-HEAD 建/回收 + 会话 workspace 绑定复用）+
// GET /api/ide/worktree/list。
import { request } from '@/api/client'

export interface WorktreeInfo {
  id: string
  path: string
}

export const ideWorktreeApi = {
  create(sessionId: string, repoRoot: string): Promise<{ ok: boolean; worktreeId: string; path: string }> {
    return request('/api/ide/worktree/create', {
      method: 'POST',
      body: JSON.stringify({ sessionId, repoRoot }),
    })
  },
  remove(sessionId: string, repoRoot: string): Promise<{ ok: boolean; worktreeId: string }> {
    return request('/api/ide/worktree/remove', {
      method: 'POST',
      body: JSON.stringify({ sessionId, repoRoot }),
    })
  },
  list(repoRoot: string): Promise<{ worktrees: WorktreeInfo[] }> {
    return request(`/api/ide/worktree/list?repoRoot=${encodeURIComponent(repoRoot)}`)
  },
}
