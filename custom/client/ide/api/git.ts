// overlay/custom/client/ide/api/git.ts
// IDE Git 面板的 REST 客户端（/api/ide/git/*，server 见
// custom/server/controllers/ide/git.ts）。类型与服务端响应同构。
import { request } from '@/api/client'

export type GitChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'conflicted' | 'untracked'

export interface GitChange {
  file: string
  renamedFrom: string | null
  indexStatus: string
  worktreeStatus: string
  kind: GitChangeKind
}

export interface GitStatus {
  repoRoot: string
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  detached: boolean
  changes: GitChange[]
}

export interface GitDiff {
  file: string
  staged: boolean
  diff: string
}

export interface GitChangeGroup {
  key: 'staged' | 'unstaged' | 'untracked'
  labelKey: string
  changes: GitChange[]
}

/** 纯函数：status 变更列表 → 三组（untracked 单列，其余按 index 侧分组） */
export function toGroups(changes: GitChange[]): GitChangeGroup[] {
  const staged: GitChange[] = []
  const unstaged: GitChange[] = []
  const untracked: GitChange[] = []
  for (const change of changes) {
    if (change.kind === 'untracked') {
      untracked.push(change)
    } else if (change.indexStatus !== ' ') {
      staged.push(change)
    } else {
      unstaged.push(change)
    }
  }
  const groups: GitChangeGroup[] = []
  if (staged.length) groups.push({ key: 'staged', labelKey: 'ide.gitStaged', changes: staged })
  if (unstaged.length) groups.push({ key: 'unstaged', labelKey: 'ide.gitUnstaged', changes: unstaged })
  if (untracked.length) groups.push({ key: 'untracked', labelKey: 'ide.gitUntracked', changes: untracked })
  return groups
}

export class GitApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function qs(params: Record<string, string>): string {
  const search = new URLSearchParams(params)
  return `?${search.toString()}`
}

export const ideGitApi = {
  status: async (root: string): Promise<GitStatus> => {
    try {
      return await request<GitStatus>(`/api/ide/git/status${qs({ root })}`)
    } catch (err) {
      throw toGitError(err)
    }
  },

  diff: async (root: string, file: string, staged: boolean): Promise<GitDiff> => {
    try {
      return await request<GitDiff>(`/api/ide/git/diff${qs({ root, file, staged: staged ? '1' : '0' })}`)
    } catch (err) {
      throw toGitError(err)
    }
  },

  stage: async (root: string, files: string[], staged: boolean): Promise<void> => {
    try {
      await request<{ ok: boolean }>('/api/ide/git/stage', {
        method: 'POST',
        body: JSON.stringify({ root, files, staged }),
      })
    } catch (err) {
      throw toGitError(err)
    }
  },

  commit: async (root: string, message: string): Promise<string> => {
    try {
      const res = await request<{ ok: boolean; output: string }>('/api/ide/git/commit', {
        method: 'POST',
        body: JSON.stringify({ root, message }),
      })
      return res.output
    } catch (err) {
      throw toGitError(err)
    }
  },
}

function toGitError(err: unknown): GitApiError {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    const e = err as { code?: unknown; message?: unknown }
    if (typeof e.code === 'string') {
      return new GitApiError(e.code, typeof e.message === 'string' ? e.message : String(e.code))
    }
  }
  return new GitApiError('request_failed', err instanceof Error ? err.message : String(err))
}
